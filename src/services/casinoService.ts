import type { Config, Game, GameStatus, GameType, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../database/prisma';
import { lockUsers, runTx } from '../database/transaction';
import { CASINO } from '../config/casino';
import { InsufficientFundsError, UserError } from '../utils/errors';
import { formatMoney, minB, parseAmount, scale } from '../utils/money';
import { acquire } from './cooldownService';
import { getConfig } from './configService';
import { credit, currentBalance, debit } from './economyService';
import { logEvent } from './logService';
import * as L from './casinoLogic';

export const GAME_NAME: Record<GameType, string> = {
  MINES: 'Buscaminas', BLACKJACK: 'Blackjack', HILO: 'Hi-Lo', CRASH: 'Crash',
};

const asJson = (v: unknown) => v as Prisma.InputJsonValue;

// ═════════════ Utilidades comunes ═════════════

/** Valida el casino, la apuesta y los límites; cobra la apuesta. Fila de usuario ya bloqueada. */
async function openTable(tx: Tx, cfg: Config, userId: string, rawBet: string, game: string): Promise<bigint> {
  if (!cfg.gamblingEnabled) throw new UserError('🎰 El casino está **cerrado** ahora mismo.');
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.cash <= 0n) throw new UserError('💸 No tienes efectivo para apostar.');

  const bet = parseAmount(rawBet, minB(user.cash, cfg.gamblingMaxBet));
  if (bet < cfg.gamblingMinBet) throw new UserError(`❌ La apuesta mínima es **${formatMoney(cfg.gamblingMinBet)}**.`);
  if (bet > cfg.gamblingMaxBet) throw new UserError(`❌ La apuesta máxima es **${formatMoney(cfg.gamblingMaxBet)}**.`);
  if (bet > user.cash) throw new InsufficientFundsError('💸 No tienes tanto efectivo.');

  await acquire(tx, userId, 'gamble', 'apostar de nuevo');
  await debit(tx, userId, 'CASH', bet, 'BET', { note: game });
  return bet;
}

/** Paga el premio (con tope) y actualiza las estadísticas. Devuelve lo pagado. */
async function payOut(tx: Tx, cfg: Config, userId: string, bet: bigint, payoutRaw: bigint, game: string): Promise<bigint> {
  const payout = payoutRaw > cfg.gamblingMaxPayout ? cfg.gamblingMaxPayout : payoutRaw < 0n ? 0n : payoutRaw;
  if (payout > 0n) await credit(tx, userId, 'CASH', payout, 'PAYOUT', { note: game });

  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { biggestWin: true } });
  const net = payout - bet;
  await tx.user.update({
    where: { id: userId },
    data: {
      gamesPlayed: { increment: 1 },
      totalWagered: { increment: bet },
      totalPayout: { increment: payout },
      ...(net > user.biggestWin ? { biggestWin: net } : {}),
    },
  });
  return payout;
}

/** Registro en el canal de logs (solo premios relevantes, según el mínimo configurado). */
export function logCasino(tag: string, game: string, bet: bigint, paid: bigint): Promise<void> {
  const net = paid - bet;
  return logEvent({
    category: 'CASINO',
    title: `${tag} — ${game}: ${net >= 0n ? 'ganó' : 'perdió'} ${formatMoney(net >= 0n ? net : -net)}`,
    description: `Apuesta ${formatMoney(bet)} · Premio ${formatMoney(paid)}`,
    amount: bet > paid ? bet : paid,
  });
}

// ═════════════ Juegos instantáneos ═════════════

/** Plantilla: lock → validar y cobrar apuesta → decidir resultado en el servidor → pagar. */
async function singleShot<T>(userId: string, rawBet: string, game: string, play: (bet: bigint) => { payout: bigint; data: T }) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const bet = await openTable(tx, cfg, userId, rawBet, game);
    const { payout, data } = play(bet);
    const paid = await payOut(tx, cfg, userId, bet, payout, game);
    return { bet, paid, cash: await currentBalance(tx, userId, 'CASH'), ...data };
  });
}

export const playCoinflip = (userId: string, rawBet: string, pick: 'cara' | 'cruz') =>
  singleShot(userId, rawBet, 'Coinflip', (bet) => {
    const result = L.coinflip();
    const win = result === pick;
    return { payout: win ? scale(bet, CASINO.coinflip.multiplier) : 0n, data: { result, win } };
  });

export const playDice = (userId: string, rawBet: string, mode: 'mayor' | 'menor', target: number) => {
  if (!Number.isInteger(target) || target < CASINO.dice.minTarget || target > CASINO.dice.maxTarget) {
    throw new UserError(`❌ El objetivo debe estar entre ${CASINO.dice.minTarget} y ${CASINO.dice.maxTarget}.`);
  }
  const chance = L.diceChance(mode, target);
  const mult = L.diceMultiplier(chance);
  return singleShot(userId, rawBet, 'Dados', (bet) => {
    const roll = L.rollDice();
    const win = mode === 'mayor' ? roll > target : roll < target;
    return { payout: win ? scale(bet, mult) : 0n, data: { roll, win, chance, mult } };
  });
};

export const playRoulette = (userId: string, rawBet: string, bet: L.RouletteBet, pick?: number) => {
  if (bet === 'numero' && (pick === undefined || !Number.isInteger(pick) || pick < 0 || pick > 36)) {
    throw new UserError('❌ Para apostar a un número indica `numero` entre 0 y 36.');
  }
  return singleShot(userId, rawBet, 'Ruleta', (stake) => {
    const number = L.spinRoulette();
    const mult = L.rouletteMultiplier(bet, number, pick);
    return { payout: scale(stake, mult), data: { number, mult, win: mult > 0 } };
  });
};

export const playSlots = (userId: string, rawBet: string) =>
  singleShot(userId, rawBet, 'Tragaperras', (bet) => {
    const spin = L.spinSlots();
    return { payout: scale(bet, spin.mult), data: { spin, win: spin.mult >= 1 } };
  });

// ═════════════ Partidas con estado ═════════════

const isStale = (g: Game) =>
  Date.now() - g.updatedAt.getTime() > (g.type === 'CRASH' ? CASINO.crash.staleMs : CASINO.staleMinutes * 60_000);

async function loadActive(tx: Tx, userId: string, gameId: string, type: GameType): Promise<Game> {
  const game = await tx.game.findFirst({ where: { id: gameId, userId, type } });
  if (!game) throw new UserError('❌ No encuentro esa partida.');
  if (game.status !== 'ACTIVE') throw new UserError('🏁 Esa partida ya terminó.');
  return game;
}

/** Cierra una partida: paga, guarda estado y estadísticas. */
async function finish(tx: Tx, cfg: Config, game: Game, status: GameStatus, payoutRaw: bigint, state: unknown) {
  const paid = await payOut(tx, cfg, game.userId, game.bet, payoutRaw, GAME_NAME[game.type]);
  const updated = await tx.game.update({ where: { id: game.id }, data: { status, payout: paid, state: asJson(state) } });
  return { game: updated, paid };
}

async function refund(tx: Tx, game: Game) {
  await credit(tx, game.userId, 'CASH', game.bet, 'PAYOUT', { note: `Reembolso ${GAME_NAME[game.type]}` });
  return tx.game.update({ where: { id: game.id }, data: { status: 'REFUNDED', payout: game.bet } });
}

/** Una sola partida activa por jugador; si la anterior está abandonada, se liquida. */
async function assertNoActive(tx: Tx, cfg: Config, userId: string) {
  const active = await tx.game.findFirst({ where: { userId, status: 'ACTIVE' } });
  if (!active) return;
  if (!isStale(active)) {
    throw new UserError(`🎮 Ya tienes una partida de **${GAME_NAME[active.type]}** en curso. Termínala (o retírate) antes de empezar otra.`);
  }
  await settleStale(tx, cfg, active);
}

export interface Step<S> {
  game: Game;
  state: S;
  ended: boolean;
  paid: bigint;
  cash: bigint;
}

const step = async <S>(tx: Tx, game: Game, state: S, paid = 0n): Promise<Step<S>> => ({
  game, state, paid, ended: game.status !== 'ACTIVE', cash: await currentBalance(tx, game.userId, 'CASH'),
});

// ── Buscaminas ──
export interface MinesState { mines: number[]; revealed: number[]; mineCount: number }

export async function startMines(userId: string, rawBet: string, mineCount: number) {
  if (!Number.isInteger(mineCount) || mineCount < CASINO.mines.minMines || mineCount > CASINO.mines.maxMines) {
    throw new UserError(`❌ Las minas deben estar entre ${CASINO.mines.minMines} y ${CASINO.mines.maxMines}.`);
  }
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    await assertNoActive(tx, cfg, userId);
    const bet = await openTable(tx, cfg, userId, rawBet, 'Buscaminas');
    const state: MinesState = { mines: L.placeMines(mineCount), revealed: [], mineCount };
    const game = await tx.game.create({ data: { userId, type: 'MINES', bet, state: asJson(state) } });
    return step(tx, game, state);
  });
}

export async function pickMines(userId: string, gameId: string, tile: number) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const game = await loadActive(tx, userId, gameId, 'MINES');
    const state = game.state as unknown as MinesState;
    if (!Number.isInteger(tile) || tile < 0 || tile >= L.MINES_TILES) throw new UserError('❌ Casilla no válida.');
    if (state.revealed.includes(tile)) return step(tx, game, state);

    if (state.mines.includes(tile)) {
      const r = await finish(tx, cfg, game, 'LOST', 0n, { ...state, revealed: [...state.revealed, tile], hit: tile });
      return step(tx, r.game, r.game.state as unknown as MinesState, r.paid);
    }
    const next: MinesState = { ...state, revealed: [...state.revealed, tile] };
    const payout = scale(game.bet, L.minesMultiplier(state.mineCount, next.revealed.length));
    const allSafe = next.revealed.length >= L.MINES_TILES - state.mineCount;
    if (allSafe || payout >= cfg.gamblingMaxPayout) {
      const r = await finish(tx, cfg, game, 'CASHED', payout, next);
      return step(tx, r.game, next, r.paid);
    }
    const updated = await tx.game.update({ where: { id: game.id }, data: { state: asJson(next) } });
    return step(tx, updated, next);
  });
}

export async function cashMines(userId: string, gameId: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const game = await loadActive(tx, userId, gameId, 'MINES');
    const state = game.state as unknown as MinesState;
    if (state.revealed.length === 0) throw new UserError('💎 Revela al menos una casilla antes de retirarte.');
    const r = await finish(tx, cfg, game, 'CASHED', scale(game.bet, L.minesMultiplier(state.mineCount, state.revealed.length)), state);
    return step(tx, r.game, state, r.paid);
  });
}

// ── Blackjack ──
export interface BjState { player: number[]; dealer: number[]; doubled: boolean; result?: L.BjResult }

async function resolveBlackjack(tx: Tx, cfg: Config, game: Game, state: BjState) {
  const busted = L.handValue(state.player).total > 21;
  const natural = L.isBlackjack(state.player) || L.isBlackjack(state.dealer);
  const dealer = busted || natural ? state.dealer : L.dealerPlay(state.dealer);
  const result = L.bjOutcome(state.player, dealer);
  const payout =
    result === 'BLACKJACK' ? scale(game.bet, 2.5) : result === 'WIN' ? game.bet * 2n : result === 'PUSH' ? game.bet : 0n;
  const status: GameStatus = result === 'PUSH' ? 'PUSH' : payout > 0n ? 'WON' : 'LOST';
  const final: BjState = { ...state, dealer, result };
  const r = await finish(tx, cfg, game, status, payout, final);
  return step(tx, r.game, final, r.paid);
}

export async function startBlackjack(userId: string, rawBet: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    await assertNoActive(tx, cfg, userId);
    const bet = await openTable(tx, cfg, userId, rawBet, 'Blackjack');
    const state: BjState = { player: [L.drawCard(), L.drawCard()], dealer: [L.drawCard(), L.drawCard()], doubled: false };
    const game = await tx.game.create({ data: { userId, type: 'BLACKJACK', bet, state: asJson(state) } });
    if (L.isBlackjack(state.player) || L.isBlackjack(state.dealer)) return resolveBlackjack(tx, cfg, game, state);
    return step(tx, game, state);
  });
}

export async function blackjackAction(userId: string, gameId: string, action: 'hit' | 'stand' | 'double') {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    let game = await loadActive(tx, userId, gameId, 'BLACKJACK');
    const state = game.state as unknown as BjState;

    if (action === 'stand') return resolveBlackjack(tx, cfg, game, state);

    if (action === 'double') {
      if (state.player.length !== 2 || state.doubled) throw new UserError('❌ Solo puedes doblar con tus dos primeras cartas.');
      const cash = await currentBalance(tx, userId, 'CASH');
      if (cash < game.bet) throw new UserError(`💸 Para doblar necesitas **${formatMoney(game.bet)}** más en efectivo.`);
      await debit(tx, userId, 'CASH', game.bet, 'BET', { note: 'Blackjack: doblar' });
      game = await tx.game.update({ where: { id: game.id }, data: { bet: game.bet * 2n } });
      return resolveBlackjack(tx, cfg, game, { ...state, doubled: true, player: [...state.player, L.drawCard()] });
    }

    const next: BjState = { ...state, player: [...state.player, L.drawCard()] };
    if (L.handValue(next.player).total >= 21) return resolveBlackjack(tx, cfg, game, next); // 21 = plantarse solo
    const updated = await tx.game.update({ where: { id: game.id }, data: { state: asJson(next) } });
    return step(tx, updated, next);
  });
}

// ── Hi-Lo ──
export interface HiloState { current: number; history: number[]; streak: number; mult: number; next?: number }

export async function startHilo(userId: string, rawBet: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    await assertNoActive(tx, cfg, userId);
    const bet = await openTable(tx, cfg, userId, rawBet, 'Hi-Lo');
    const state: HiloState = { current: L.drawCard(), history: [], streak: 0, mult: 1 };
    const game = await tx.game.create({ data: { userId, type: 'HILO', bet, state: asJson(state) } });
    return step(tx, game, state);
  });
}

export async function hiloGuess(userId: string, gameId: string, dir: 'hi' | 'lo') {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const game = await loadActive(tx, userId, gameId, 'HILO');
    const state = game.state as unknown as HiloState;
    if (L.hiloChance(state.current, dir) <= 0) throw new UserError('❌ Esa opción es imposible con esta carta.');

    const next = L.drawCard();
    const win = dir === 'hi' ? next > state.current : next < state.current;
    if (!win) {
      const r = await finish(tx, cfg, game, 'LOST', 0n, { ...state, next });
      return step(tx, r.game, { ...state, next }, r.paid);
    }
    const mult = Math.floor(state.mult * L.hiloStep(state.current, dir) * 100) / 100;
    const ns: HiloState = { current: next, history: [...state.history, state.current].slice(-8), streak: state.streak + 1, mult };
    const payout = scale(game.bet, mult);
    if (payout >= cfg.gamblingMaxPayout) {
      const r = await finish(tx, cfg, game, 'CASHED', payout, ns);
      return step(tx, r.game, ns, r.paid);
    }
    const updated = await tx.game.update({ where: { id: game.id }, data: { state: asJson(ns) } });
    return step(tx, updated, ns);
  });
}

export async function cashHilo(userId: string, gameId: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const game = await loadActive(tx, userId, gameId, 'HILO');
    const state = game.state as unknown as HiloState;
    if (state.streak < 1) throw new UserError('🃏 Acierta al menos una vez antes de retirarte.');
    const r = await finish(tx, cfg, game, 'CASHED', scale(game.bet, state.mult), state);
    return step(tx, r.game, state, r.paid);
  });
}

// ── Crash ──
export interface CrashState { crashPoint: number; startedAt: number; cashedAt?: number }

export async function startCrash(userId: string, rawBet: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    await assertNoActive(tx, cfg, userId);
    const bet = await openTable(tx, cfg, userId, rawBet, 'Crash');
    const state: CrashState = { crashPoint: L.crashPoint(), startedAt: Date.now() };
    const game = await tx.game.create({ data: { userId, type: 'CRASH', bet, state: asJson(state) } });
    if (state.crashPoint <= 1) {
      const r = await finish(tx, cfg, game, 'LOST', 0n, state);
      return step(tx, r.game, state, r.paid);
    }
    return step(tx, game, state);
  });
}

/** El jugador pulsa "Retirarse": se compara la hora del servidor con el punto de explosión. */
export async function cashCrash(userId: string, gameId: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const game = await loadActive(tx, userId, gameId, 'CRASH');
    const state = game.state as unknown as CrashState;
    const m = L.crashMultiplierAt(Date.now() - state.startedAt);
    if (m >= state.crashPoint) {
      const r = await finish(tx, cfg, game, 'LOST', 0n, state);
      return { ...(await step(tx, r.game, state, r.paid)), mult: state.crashPoint, crashed: true };
    }
    const next = { ...state, cashedAt: m };
    const r = await finish(tx, cfg, game, 'CASHED', scale(game.bet, m), next);
    return { ...(await step(tx, r.game, next, r.paid)), mult: m, crashed: false };
  });
}

/** Lo llama el bucle de animación cuando el multiplicador alcanza el punto de explosión. */
export async function bustCrash(userId: string, gameId: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const game = await loadActive(tx, userId, gameId, 'CRASH');
    const state = game.state as unknown as CrashState;
    if (L.crashMultiplierAt(Date.now() - state.startedAt) < state.crashPoint) return null;
    const r = await finish(tx, cfg, game, 'LOST', 0n, state);
    return step(tx, r.game, state, r.paid);
  });
}

export const getGame = (gameId: string) => prisma.game.findUnique({ where: { id: gameId } });

// ═════════════ Liquidación de partidas abandonadas ═════════════

async function settleStale(tx: Tx, cfg: Config, game: Game): Promise<void> {
  switch (game.type) {
    case 'MINES': {
      const s = game.state as unknown as MinesState;
      if (s.revealed.length === 0) await refund(tx, game);
      else await finish(tx, cfg, game, 'CASHED', scale(game.bet, L.minesMultiplier(s.mineCount, s.revealed.length)), s);
      break;
    }
    case 'HILO': {
      const s = game.state as unknown as HiloState;
      if (s.streak === 0) await refund(tx, game);
      else await finish(tx, cfg, game, 'CASHED', scale(game.bet, s.mult), s);
      break;
    }
    case 'BLACKJACK':
      await resolveBlackjack(tx, cfg, game, game.state as unknown as BjState); // se planta solo
      break;
    case 'CRASH':
      await finish(tx, cfg, game, 'LOST', 0n, game.state);
      break;
  }
}

/** Tarea periódica: nadie pierde dinero por una partida colgada ni se queda con ella abierta. */
export async function settleStaleGames(): Promise<number> {
  const cfg = await getConfig();
  const now = Date.now();
  const candidates = await prisma.game.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { type: { not: 'CRASH' }, updatedAt: { lt: new Date(now - CASINO.staleMinutes * 60_000) } },
        { type: 'CRASH', updatedAt: { lt: new Date(now - CASINO.crash.staleMs) } },
      ],
    },
    take: 50,
  });
  let settled = 0;
  for (const c of candidates) {
    await runTx(async (tx) => {
      await lockUsers(tx, [c.userId]);
      const fresh = await tx.game.findUnique({ where: { id: c.id } });
      if (fresh && fresh.status === 'ACTIVE') {
        await settleStale(tx, cfg, fresh);
        settled++;
      }
    });
  }
  return settled;
}

// ═════════════ Estadísticas ═════════════

export async function casinoTop(limit = 10) {
  return prisma.$queryRaw<{ id: string; net: bigint; played: number }[]>`
    SELECT "id", ("totalPayout" - "totalWagered")::bigint AS net, "gamesPlayed" AS played
    FROM "User" WHERE "gamesPlayed" > 0 ORDER BY net DESC, "id" ASC LIMIT ${limit}`;
}

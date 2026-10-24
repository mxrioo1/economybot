import type { BoostKind, EventKind, TxType } from '@prisma/client';
import { prisma, type Tx } from '../database/prisma';
import { RANDOM_EVENTS, type RandomEventDef } from '../config/events';
import { MAX_TOTAL_MULTIPLIER } from '../config/economy';
import { chance, randInt, weightedPick } from '../utils/random';
import { pct } from '../utils/money';
import { credit, currentBalance, debitUpTo } from './economyService';
import { getConfig } from './configService';

/** Multiplicadores activos para un usuario (eventos del servidor + boosts). */
export interface Modifiers {
  money: number;
  xp: number;
  shield: boolean;
  notes: string[];
}

export async function getModifiers(tx: Tx, userId: string): Promise<Modifiers> {
  const now = new Date();
  const [events, boosts] = await Promise.all([
    tx.serverEvent.findMany({ where: { startsAt: { lte: now }, endsAt: { gt: now } } }),
    tx.activeBoost.findMany({ where: { userId, expiresAt: { gt: now } } }),
  ]);

  const mods: Modifiers = { money: 1, xp: 1, shield: false, notes: [] };
  for (const e of events) {
    if (e.kind === 'MONEY_MULT') mods.money *= e.multiplier;
    else mods.xp *= e.multiplier;
    mods.notes.push(`🌍 ${e.name} (x${e.multiplier})`);
  }
  for (const b of boosts) {
    if (b.kind === 'MONEY') {
      mods.money *= b.multiplier;
      mods.notes.push(`⚡ Boost de dinero (x${b.multiplier})`);
    } else if (b.kind === 'XP') {
      mods.xp *= b.multiplier;
      mods.notes.push(`⚡ Boost de XP (x${b.multiplier})`);
    } else mods.shield = true;
  }
  mods.money = Math.min(mods.money, MAX_TOTAL_MULTIPLIER);
  mods.xp = Math.min(mods.xp, MAX_TOTAL_MULTIPLIER);
  return mods;
}

export async function activateBoost(tx: Tx, userId: string, kind: BoostKind, multiplier: number, minutes: number) {
  const now = Date.now();
  const existing = await tx.activeBoost.findUnique({ where: { userId_kind: { userId, kind } } });
  const base = existing && existing.expiresAt.getTime() > now ? existing.expiresAt.getTime() : now;
  const expiresAt = new Date(base + minutes * 60_000);
  const mult = existing && existing.expiresAt.getTime() > now ? Math.max(existing.multiplier, multiplier) : multiplier;
  await tx.activeBoost.upsert({
    where: { userId_kind: { userId, kind } },
    update: { expiresAt, multiplier: mult },
    create: { userId, kind, multiplier: mult, expiresAt },
  });
  return expiresAt;
}

// ── Eventos aleatorios ───────────────────────────────────────

export interface EventOutcome {
  def: RandomEventDef;
  text: string;
  /** Cambio neto de efectivo causado por el evento (puede ser negativo). */
  cashDelta: bigint;
  xp: number;
}

export async function rollRandomEvent(): Promise<RandomEventDef | null> {
  const cfg = await getConfig();
  if (!chance(cfg.randomEventChance / 100)) return null;
  return weightedPick(RANDOM_EVENTS, (e) => e.weight);
}

/** Aplica el evento dentro de la transacción (fila ya bloqueada). */
export async function applyRandomEvent(
  tx: Tx,
  userId: string,
  def: RandomEventDef,
  earned: bigint,
  shield: boolean,
): Promise<EventOutcome> {
  const type: TxType = 'EVENT';
  const fx = def.effect;
  const out: EventOutcome = { def, text: def.text, cashDelta: 0n, xp: 0 };

  switch (fx.type) {
    case 'BONUS_PCT': {
      const bonus = pct(earned, randInt(fx.min, fx.max));
      if (bonus > 0n) await credit(tx, userId, 'CASH', bonus, type, { note: def.name });
      out.cashDelta = bonus;
      break;
    }
    case 'FLAT': {
      const amount = BigInt(randInt(fx.min, fx.max));
      await credit(tx, userId, 'CASH', amount, type, { note: def.name });
      out.cashDelta = amount;
      break;
    }
    case 'FINE': {
      const cash = await currentBalance(tx, userId, 'CASH');
      const wanted = BigInt(Math.max(fx.floor, Number(pct(cash, randInt(fx.minPct, fx.maxPct)))));
      const paid = await debitUpTo(tx, userId, 'CASH', wanted, 'FINE', { note: def.name });
      out.cashDelta = -paid;
      break;
    }
    case 'ROBBED': {
      if (shield) {
        out.text = '🛡️ ¡Tu escudo anti-robo te protegió de un carterista!';
        break;
      }
      const cash = await currentBalance(tx, userId, 'CASH');
      const lost = await debitUpTo(tx, userId, 'CASH', pct(cash, randInt(fx.minPct, fx.maxPct)), type, { note: def.name });
      out.cashDelta = -lost;
      break;
    }
    case 'XP':
      out.xp = randInt(fx.min, fx.max);
      break;
  }
  return out;
}

// ── Eventos globales del servidor ────────────────────────────

export async function startServerEvent(name: string, kind: EventKind, multiplier: number, minutes: number, createdBy: string) {
  return prisma.serverEvent.create({
    data: { name, kind, multiplier, endsAt: new Date(Date.now() + minutes * 60_000), createdBy },
  });
}

export async function stopServerEvents(): Promise<number> {
  const res = await prisma.serverEvent.updateMany({ where: { endsAt: { gt: new Date() } }, data: { endsAt: new Date() } });
  return res.count;
}

export function listActiveServerEvents() {
  const now = new Date();
  return prisma.serverEvent.findMany({ where: { startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { endsAt: 'asc' } });
}

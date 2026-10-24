/**
 * LÓGICA PURA de los juegos (sin base de datos): fácil de probar y de auditar.
 */
import { CASINO } from '../config/casino';
import { randFloat, randInt, weightedPick } from '../utils/random';

// ── Cartas (mazo infinito: cada carta sale con probabilidad 1/13) ──
const RANK_NAMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠️', '♥️', '♦️', '♣️'];

export const drawCard = (): number => randInt(1, 13);
export const cardLabel = (rank: number, salt = 0): string => `**${RANK_NAMES[rank]}**${SUITS[(rank + salt) % 4]}`;
export const handLabel = (cards: number[]): string => cards.map((c, i) => cardLabel(c, i)).join(' ');

export function handValue(cards: number[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c === 1) aces++;
    total += Math.min(c, 10);
  }
  if (aces > 0 && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

export const isBlackjack = (cards: number[]) => cards.length === 2 && handValue(cards).total === 21;

/** El crupier pide hasta tener 17 o más (se planta con 17 blando). */
export function dealerPlay(dealer: number[]): number[] {
  const hand = [...dealer];
  while (handValue(hand).total < 17) hand.push(drawCard());
  return hand;
}

export type BjResult = 'BLACKJACK' | 'WIN' | 'LOSE' | 'PUSH' | 'BUST';

export function bjOutcome(player: number[], dealer: number[]): BjResult {
  const p = handValue(player).total;
  const d = handValue(dealer).total;
  const pBJ = isBlackjack(player);
  const dBJ = isBlackjack(dealer);
  if (p > 21) return 'BUST';
  if (pBJ && dBJ) return 'PUSH';
  if (pBJ) return 'BLACKJACK';
  if (dBJ) return 'LOSE';
  if (d > 21 || p > d) return 'WIN';
  if (p === d) return 'PUSH';
  return 'LOSE';
}

// ── Buscaminas ─────────────────────────────────────────────
export const MINES_TILES = CASINO.mines.rows * CASINO.mines.cols;

/** Coloca `count` minas en posiciones distintas (Fisher‑Yates con RNG seguro). */
export function placeMines(count: number): number[] {
  const tiles = Array.from({ length: MINES_TILES }, (_, i) => i);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
  }
  return tiles.slice(0, count).sort((a, b) => a - b);
}

/** Multiplicador tras `picks` casillas seguras: probabilidad justa × RTP. */
export function minesMultiplier(mineCount: number, picks: number): number {
  if (picks <= 0) return 1;
  let m = 1;
  for (let i = 0; i < picks; i++) m *= (MINES_TILES - i) / (MINES_TILES - mineCount - i);
  return Math.floor(m * CASINO.rtp * 100) / 100;
}

// ── Hi-Lo ──────────────────────────────────────────────────
/** Probabilidad de acertar (el empate pierde). */
export function hiloChance(current: number, dir: 'hi' | 'lo'): number {
  return dir === 'hi' ? (13 - current) / 13 : (current - 1) / 13;
}
export const hiloStep = (current: number, dir: 'hi' | 'lo'): number => {
  const p = hiloChance(current, dir);
  return p <= 0 ? 0 : CASINO.rtp / p;
};

// ── Crash ──────────────────────────────────────────────────
/** P(punto ≥ x) = RTP / x. Con probabilidad ~3 % revienta al instante (x1,00). */
export function crashPoint(): number {
  const u = randInt(0, 999_999_999) / 1_000_000_000;
  const raw = CASINO.rtp / (1 - u);
  return Math.min(CASINO.crash.maxPoint, Math.max(1, Math.floor(raw * 100) / 100));
}
export const crashMultiplierAt = (elapsedMs: number): number =>
  Math.floor(Math.exp((CASINO.crash.growth * Math.max(0, elapsedMs)) / 1000) * 100) / 100;

// ── Tragaperras ────────────────────────────────────────────
export interface SlotsResult {
  reels: string[];
  mult: number;
  label: string;
}

export function spinSlots(): SlotsResult {
  const symbols = CASINO.slots.symbols;
  const reels = [0, 1, 2].map(() => weightedPick(symbols, (s) => s.weight));
  const emojis = reels.map((r) => r.emoji);

  if (reels[0]!.emoji === reels[1]!.emoji && reels[1]!.emoji === reels[2]!.emoji) {
    return { reels: emojis, mult: reels[0]!.three, label: `¡Tres ${reels[0]!.emoji}!` };
  }
  const cherries = emojis.filter((e) => e === '🍒').length;
  if (cherries === 2) return { reels: emojis, mult: CASINO.slots.twoCherries, label: 'Dos cerezas' };
  if (cherries === 1) return { reels: emojis, mult: CASINO.slots.oneCherry, label: 'Una cereza (recuperas parte)' };
  return { reels: emojis, mult: 0, label: 'Sin premio' };
}

// ── Ruleta europea (0‑36) ──────────────────────────────────
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const ROULETTE_BETS = [
  'numero', 'rojo', 'negro', 'par', 'impar', 'bajo', 'alto',
  'docena1', 'docena2', 'docena3', 'columna1', 'columna2', 'columna3',
] as const;
export type RouletteBet = (typeof ROULETTE_BETS)[number];

export const ROULETTE_LABEL: Record<RouletteBet, string> = {
  numero: '🎯 Número exacto (x36)',
  rojo: '🔴 Rojo (x2)',
  negro: '⚫ Negro (x2)',
  par: 'Par (x2)',
  impar: 'Impar (x2)',
  bajo: '1‑18 (x2)',
  alto: '19‑36 (x2)',
  docena1: '1ª docena 1‑12 (x3)',
  docena2: '2ª docena 13‑24 (x3)',
  docena3: '3ª docena 25‑36 (x3)',
  columna1: '1ª columna (x3)',
  columna2: '2ª columna (x3)',
  columna3: '3ª columna (x3)',
};

export const rouletteColor = (n: number): '🟢' | '🔴' | '⚫' => (n === 0 ? '🟢' : RED.has(n) ? '🔴' : '⚫');
export const spinRoulette = (): number => randInt(0, 36);

/** Multiplicador TOTAL devuelto (apuesta incluida); 0 si pierde. */
export function rouletteMultiplier(bet: RouletteBet, n: number, pick?: number): number {
  switch (bet) {
    case 'numero': return n === pick ? 36 : 0;
    case 'rojo': return RED.has(n) ? 2 : 0;
    case 'negro': return n !== 0 && !RED.has(n) ? 2 : 0;
    case 'par': return n !== 0 && n % 2 === 0 ? 2 : 0;
    case 'impar': return n % 2 === 1 ? 2 : 0;
    case 'bajo': return n >= 1 && n <= 18 ? 2 : 0;
    case 'alto': return n >= 19 && n <= 36 ? 2 : 0;
    case 'docena1': return n >= 1 && n <= 12 ? 3 : 0;
    case 'docena2': return n >= 13 && n <= 24 ? 3 : 0;
    case 'docena3': return n >= 25 && n <= 36 ? 3 : 0;
    case 'columna1': return n >= 1 && n % 3 === 1 ? 3 : 0;
    case 'columna2': return n >= 1 && n % 3 === 2 ? 3 : 0;
    case 'columna3': return n >= 1 && n % 3 === 0 ? 3 : 0;
  }
}

// ── Dados (apuesta sobre/bajo un objetivo en 1‑100) ────────
export function diceChance(mode: 'mayor' | 'menor', target: number): number {
  return mode === 'mayor' ? (100 - target) / 100 : (target - 1) / 100;
}
export const diceMultiplier = (chance: number): number => Math.floor((CASINO.rtp / chance) * 100) / 100;
export const rollDice = (): number => randInt(1, 100);

export const coinflip = (): 'cara' | 'cruz' => (randFloat() < 0.5 ? 'cara' : 'cruz');

import { randomInt } from 'crypto';

/** Entero aleatorio criptográficamente seguro, ambos extremos incluidos. */
export function randInt(min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return randomInt(lo, hi + 1);
}

export function randFloat(): number {
  return randomInt(0, 1_000_000_000) / 1_000_000_000;
}

export const chance = (p: number): boolean => randFloat() < p;

/** Bigint aleatorio en [min, max]. */
export function randBig(min: bigint, max: bigint): bigint {
  if (max <= min) return min;
  const range = max - min;
  if (range < 2n ** 40n) return min + BigInt(randomInt(0, Number(range) + 1));
  return min + BigInt(Math.floor(randFloat() * Number(range + 1n)));
}

export function weightedPick<T>(items: readonly T[], weight: (item: T) => number): T {
  const total = items.reduce((acc, it) => acc + Math.max(0, weight(it)), 0);
  let roll = randFloat() * total;
  for (const it of items) {
    roll -= Math.max(0, weight(it));
    if (roll < 0) return it;
  }
  return items[items.length - 1]!;
}

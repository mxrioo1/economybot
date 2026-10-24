import { CURRENCY, MAX_BALANCE } from '../config/economy';
import { UserError } from './errors';

export function formatMoney(n: bigint): string {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  return `${neg ? '-' : ''}${CURRENCY}${abs.toLocaleString('en-US')}`;
}

export function formatNumber(n: bigint | number): string {
  return n.toLocaleString('en-US');
}

/** Multiplica un bigint por un decimal con 4 cifras de precisión. */
export function scale(amount: bigint, factor: number): bigint {
  if (!Number.isFinite(factor) || factor <= 0) return 0n;
  return (amount * BigInt(Math.round(factor * 10_000))) / 10_000n;
}

/** pct(1000n, 5) → 50n */
export function pct(amount: bigint, percent: number): bigint {
  return scale(amount, percent / 100);
}

export const minB = (a: bigint, b: bigint) => (a < b ? a : b);
export const maxB = (a: bigint, b: bigint) => (a > b ? a : b);

const SUFFIX: Record<string, bigint> = { k: 1_000n, m: 1_000_000n, b: 1_000_000_000n };

/**
 * Convierte texto del usuario en una cantidad segura (bigint > 0).
 * Acepta: 500 · 1,500 · 2k · 1.5k · 3m · todo · mitad
 * Nunca devuelve negativos, cero ni valores por encima de MAX_BALANCE.
 */
export function parseAmount(raw: string, available: bigint): bigint {
  const s = raw.trim().toLowerCase().replace(/[\s_,$]/g, '');
  let amount: bigint;

  if (s === 'todo' || s === 'all' || s === 'max') {
    amount = available;
  } else if (s === 'mitad' || s === 'half') {
    amount = available / 2n;
  } else {
    const m = /^(\d{1,18})(?:\.(\d{1,3}))?(k|m|b)?$/.exec(s);
    if (!m) {
      throw new UserError('❌ Cantidad no válida. Usa números como `500`, `2k`, `1.5m`, `mitad` o `todo`.');
    }
    const [, intPart, fracPart, suffix] = m;
    if (fracPart && !suffix) {
      throw new UserError('❌ Los decimales solo se admiten con sufijo (`1.5k`, `2.5m`).');
    }
    const mult = suffix ? SUFFIX[suffix]! : 1n;
    amount = BigInt(intPart!) * mult;
    if (fracPart) amount += (BigInt(fracPart.padEnd(3, '0')) * mult) / 1000n;
  }

  if (amount <= 0n) throw new UserError('❌ La cantidad debe ser mayor que 0.');
  if (amount > MAX_BALANCE) throw new UserError('❌ Esa cantidad es demasiado grande.');
  return amount;
}

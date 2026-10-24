import type { Prisma, TxType } from '@prisma/client';
import type { Tx } from '../database/prisma';
import { MAX_BALANCE } from '../config/economy';
import { InsufficientFundsError, UserError } from '../utils/errors';
import { minB, pct } from '../utils/money';

export type AccountName = 'CASH' | 'BANK';

interface LedgerOpts {
  note?: string;
  counterpartyId?: string;
}

const EARN_TYPES = new Set<TxType>(['DAILY', 'WORK', 'FISH', 'MINE', 'CRIME', 'ROBBERY', 'BEG', 'INTEREST', 'SALE', 'EVENT', 'BUSINESS']);
const SPEND_TYPES = new Set<TxType>(['PURCHASE', 'TAX', 'FINE', 'COST', 'UPKEEP']);

/**
 * ÚNICO punto por el que cambia un saldo. Requiere que la fila del usuario
 * ya esté bloqueada (lockUsers). Además valida en la propia sentencia UPDATE:
 *  · un débito solo se aplica si hay saldo suficiente (nunca negativo)
 *  · un crédito solo se aplica si no supera MAX_BALANCE (nunca overflow)
 * y escribe una línea en el libro mayor con el saldo resultante.
 */
async function adjust(
  tx: Tx,
  userId: string,
  account: AccountName,
  delta: bigint,
  type: TxType,
  opts: LedgerOpts = {},
): Promise<bigint> {
  if (delta === 0n) return currentBalance(tx, userId, account);
  const field = account === 'CASH' ? 'cash' : 'bank';

  const where: Prisma.UserWhereInput = { id: userId };
  if (delta < 0n) where[field] = { gte: -delta };
  else where[field] = { lte: MAX_BALANCE - delta };

  const data: Prisma.UserUpdateManyMutationInput = {};
  data[field] = { increment: delta };
  if (delta > 0n && EARN_TYPES.has(type)) data.totalEarned = { increment: delta };
  if (delta < 0n && SPEND_TYPES.has(type)) data.totalSpent = { increment: -delta };

  const res = await tx.user.updateMany({ where, data });
  if (res.count !== 1) {
    if (delta < 0n) throw new InsufficientFundsError();
    throw new UserError('🏦 Esa operación superaría el límite máximo de dinero permitido.');
  }

  const balanceAfter = await currentBalance(tx, userId, account);
  await tx.transaction.create({
    data: {
      userId,
      account,
      type,
      amount: delta,
      balanceAfter,
      counterpartyId: opts.counterpartyId,
      note: opts.note,
    },
  });
  return balanceAfter;
}

export async function currentBalance(tx: Tx, userId: string, account: AccountName): Promise<bigint> {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { cash: true, bank: true } });
  return account === 'CASH' ? u.cash : u.bank;
}

/** Ingreso. `amount` debe ser > 0. */
export function credit(tx: Tx, userId: string, account: AccountName, amount: bigint, type: TxType, opts?: LedgerOpts) {
  if (amount < 0n) throw new Error('credit() recibió una cantidad negativa');
  return adjust(tx, userId, account, amount, type, opts);
}

/** Egreso estricto: lanza InsufficientFundsError si no hay saldo. */
export function debit(tx: Tx, userId: string, account: AccountName, amount: bigint, type: TxType, opts?: LedgerOpts) {
  if (amount < 0n) throw new Error('debit() recibió una cantidad negativa');
  return adjust(tx, userId, account, -amount, type, opts);
}

/** Egreso "hasta donde llegue": cobra min(amount, saldo). Devuelve lo cobrado. */
export async function debitUpTo(
  tx: Tx,
  userId: string,
  account: AccountName,
  amount: bigint,
  type: TxType,
  opts?: LedgerOpts,
): Promise<bigint> {
  if (amount <= 0n) return 0n;
  const balance = await currentBalance(tx, userId, account);
  const actual = minB(amount, balance);
  if (actual > 0n) await debit(tx, userId, account, actual, type, opts);
  return actual;
}

/** Mueve efectivo de un usuario a otro (sin crear ni destruir dinero). */
export async function transferCash(tx: Tx, fromId: string, toId: string, amount: bigint, type: TxType, note?: string) {
  if (fromId === toId) throw new UserError('No puedes hacerte eso a ti mismo.');
  await debit(tx, fromId, 'CASH', amount, type, { counterpartyId: toId, note });
  await credit(tx, toId, 'CASH', amount, type, { counterpartyId: fromId, note });
}

/**
 * Pago entre jugadores con impuesto. El remitente entrega `total`;
 * el impuesto se destruye y el resto llega al destinatario.
 */
export async function payWithTax(tx: Tx, fromId: string, toId: string, total: bigint, taxPct: number) {
  if (fromId === toId) throw new UserError('No puedes pagarte a ti mismo.');
  const tax = pct(total, taxPct);
  const net = total - tax;
  await debit(tx, fromId, 'CASH', net, 'TRANSFER', { counterpartyId: toId, note: 'Pago a jugador' });
  if (tax > 0n) await debit(tx, fromId, 'CASH', tax, 'TAX', { note: 'Impuesto de transferencia' });
  await credit(tx, toId, 'CASH', net, 'TRANSFER', { counterpartyId: fromId, note: 'Pago recibido' });
  return { tax, net };
}

/** Efectivo ⇄ banco. */
export async function moveBetweenAccounts(tx: Tx, userId: string, from: AccountName, amount: bigint) {
  const to: AccountName = from === 'CASH' ? 'BANK' : 'CASH';
  const type: TxType = from === 'CASH' ? 'DEPOSIT' : 'WITHDRAW';
  await debit(tx, userId, from, amount, type, { note: from === 'CASH' ? 'Depósito' : 'Retiro' });
  await credit(tx, userId, to, amount, type, { note: from === 'CASH' ? 'Depósito' : 'Retiro' });
}

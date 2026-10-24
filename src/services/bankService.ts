import { prisma, type Tx } from '../database/prisma';
import { lockUsers, runTx } from '../database/transaction';
import { BANK } from '../config/economy';
import { InsufficientFundsError, UserError } from '../utils/errors';
import { formatMoney, minB, parseAmount, scale } from '../utils/money';
import { credit, moveBetweenAccounts } from './economyService';
import { getPropertyBonuses } from './propertyService';

const DAY_MS = 86_400_000;

export function baseBankLimit(level: number): bigint {
  let limit = BANK.limits[0]!.limit;
  for (const tier of BANK.limits) if (level >= tier.level) limit = tier.limit;
  return limit;
}

export async function bankLimit(tx: Tx, userId: string, level: number): Promise<bigint> {
  const bonuses = await getPropertyBonuses(tx, userId);
  return baseBankLimit(level) + bonuses.bankBonus;
}

/** Aplica los intereses diarios pendientes (máx. N días). Requiere fila bloqueada. */
export async function accrueInterest(tx: Tx, userId: string): Promise<bigint> {
  const u = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { bank: true, level: true, lastInterestAt: true },
  });
  const days = Math.floor((Date.now() - u.lastInterestAt.getTime()) / DAY_MS);
  if (days < 1) return 0n;

  const effDays = Math.min(days, BANK.maxInterestDays);
  let interest = 0n;
  if (u.bank > 0n) {
    const limit = await bankLimit(tx, userId, u.level);
    const room = limit > u.bank ? limit - u.bank : 0n;
    interest = minB(minB(scale(u.bank, BANK.dailyInterestRate * effDays), BANK.maxDailyInterest * BigInt(effDays)), room);
  }
  await tx.user.update({
    where: { id: userId },
    data: { lastInterestAt: new Date(u.lastInterestAt.getTime() + days * DAY_MS) },
  });
  if (interest > 0n) await credit(tx, userId, 'BANK', interest, 'INTEREST', { note: `Intereses de ${effDays} día(s)` });
  return interest;
}

export async function getBankState(userId: string) {
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const interest = await accrueInterest(tx, userId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const limit = await bankLimit(tx, userId, user.level);
    return { user, limit, interest };
  });
}

export async function deposit(userId: string, raw: string) {
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    await accrueInterest(tx, userId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const limit = await bankLimit(tx, userId, user.level);
    const room = limit > user.bank ? limit - user.bank : 0n;

    if (user.cash <= 0n) throw new UserError('💸 No tienes efectivo para depositar.');
    if (room <= 0n) throw new UserError(`🏦 Tu banco está lleno (límite **${formatMoney(limit)}**). Sube de nivel para ampliarlo.`);

    const amount = parseAmount(raw, minB(user.cash, room));
    if (amount > user.cash) throw new InsufficientFundsError('💸 No tienes tanto efectivo.');
    if (amount > room) {
      throw new UserError(`🏦 Solo caben **${formatMoney(room)}** más en tu banco (límite ${formatMoney(limit)}).`);
    }
    await moveBetweenAccounts(tx, userId, 'CASH', amount);
    return { amount, cash: user.cash - amount, bank: user.bank + amount, limit };
  });
}

export async function withdraw(userId: string, raw: string) {
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    await accrueInterest(tx, userId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.bank <= 0n) throw new UserError('🏦 No tienes dinero en el banco.');

    const amount = parseAmount(raw, user.bank);
    if (amount > user.bank) throw new InsufficientFundsError('🏦 No tienes tanto dinero en el banco.');
    await moveBetweenAccounts(tx, userId, 'BANK', amount);
    return { amount, cash: user.cash + amount, bank: user.bank - amount };
  });
}

export async function bankHistory(userId: string, page: number) {
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      skip: page * BANK.historyPageSize,
      take: BANK.historyPageSize,
    }),
    prisma.transaction.count({ where: { userId } }),
  ]);
  return { rows, total };
}

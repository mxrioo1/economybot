import type { TxType } from '@prisma/client';
import { prisma } from '../database/prisma';
import { lockUsers, runTx } from '../database/transaction';
import { STARTING_CASH } from '../config/economy';
import { credit, currentBalance, debit, debitUpTo, type AccountName } from './economyService';

export type AdminMode = 'add' | 'remove' | 'set';

/** Ajuste administrativo de saldo; queda en el libro mayor con el ID del admin. */
export async function adminAdjust(adminId: string, targetId: string, account: AccountName, mode: AdminMode, amount: bigint) {
  const note = `Ajuste administrativo (${mode}) por ${adminId}`;
  return runTx(async (tx) => {
    await lockUsers(tx, [targetId]);
    const before = await currentBalance(tx, targetId, account);
    if (mode === 'add') await credit(tx, targetId, account, amount, 'ADMIN', { note, counterpartyId: adminId });
    else if (mode === 'remove') await debitUpTo(tx, targetId, account, amount, 'ADMIN', { note, counterpartyId: adminId });
    else if (amount > before) await credit(tx, targetId, account, amount - before, 'ADMIN', { note, counterpartyId: adminId });
    else if (amount < before) await debit(tx, targetId, account, before - amount, 'ADMIN', { note, counterpartyId: adminId });
    return { before, after: await currentBalance(tx, targetId, account) };
  });
}

/** Devuelve la cuenta a su estado inicial (el libro mayor se conserva para auditoría). */
export async function resetUser(adminId: string, targetId: string) {
  return runTx(async (tx) => {
    await lockUsers(tx, [targetId]);
    const note = `Reinicio de cuenta por ${adminId}`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: targetId } });
    if (user.cash > 0n) await debit(tx, targetId, 'CASH', user.cash, 'ADMIN', { note, counterpartyId: adminId });
    if (user.bank > 0n) await debit(tx, targetId, 'BANK', user.bank, 'ADMIN', { note, counterpartyId: adminId });
    await credit(tx, targetId, 'CASH', STARTING_CASH, 'ADMIN', { note, counterpartyId: adminId });

    await Promise.all([
      tx.inventory.deleteMany({ where: { userId: targetId } }),
      tx.userProperty.deleteMany({ where: { userId: targetId } }),
      tx.userBusiness.deleteMany({ where: { userId: targetId } }),
      tx.cooldown.deleteMany({ where: { userId: targetId } }),
      tx.activeBoost.deleteMany({ where: { userId: targetId } }),
    ]);
    await tx.user.update({
      where: { id: targetId },
      data: {
        level: 1, xp: 0, jobId: null, dailyStreak: 0, lastDailyAt: null, lastInterestAt: new Date(),
        workCount: 0, fishCount: 0, mineCount: 0, crimeCount: 0, crimeWins: 0, robCount: 0, robWins: 0,
        timesRobbed: 0, totalEarned: 0n, totalSpent: 0n,
      },
    });
  });
}

const INTERNAL: TxType[] = ['TRANSFER', 'DEPOSIT', 'WITHDRAW', 'ROBBERY'];
const CASINO_TYPES: TxType[] = ['BET', 'PAYOUT'];

/** Dinero creado y destruido en las últimas `hours` horas, por tipo de movimiento. */
export async function economyStats(hours = 24) {
  const since = new Date(Date.now() - hours * 3_600_000);
  const base = { createdAt: { gte: since }, type: { notIn: [...INTERNAL, ...CASINO_TYPES] } };
  // El casino se agrega aparte: apuestas (−) y premios (+) se compensan, lo que importa es el neto.
  const [minted, burned, totals, users, casino] = await Promise.all([
    prisma.transaction.groupBy({ by: ['type'], where: { ...base, amount: { gt: 0n } }, _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ['type'], where: { ...base, amount: { lt: 0n } }, _sum: { amount: true } }),
    prisma.user.aggregate({ _sum: { cash: true, bank: true } }),
    prisma.user.count(),
    prisma.transaction.aggregate({ where: { createdAt: { gte: since }, type: { in: CASINO_TYPES } }, _sum: { amount: true } }),
  ]);
  const sum = (rows: typeof minted) => rows.reduce((a, r) => a + (r._sum.amount ?? 0n), 0n);
  const casinoNet = casino._sum.amount ?? 0n; // negativo = el casino se queda dinero
  return {
    casinoProfit: -casinoNet,
    minted: minted.map((r) => ({ type: r.type, amount: r._sum.amount ?? 0n })).sort((a, b) => (a.amount < b.amount ? 1 : -1)),
    burned: burned.map((r) => ({ type: r.type, amount: -(r._sum.amount ?? 0n) })).sort((a, b) => (a.amount < b.amount ? 1 : -1)),
    totalMinted: sum(minted) + (casinoNet > 0n ? casinoNet : 0n),
    totalBurned: -sum(burned) + (casinoNet < 0n ? -casinoNet : 0n),
    cash: totals._sum.cash ?? 0n,
    bank: totals._sum.bank ?? 0n,
    users,
  };
}

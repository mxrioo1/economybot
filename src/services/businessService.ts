import { prisma } from '../database/prisma';
import { lockUsers, runTx } from '../database/transaction';
import { BUSINESS } from '../config/economy';
import { UserError } from '../utils/errors';
import { formatMoney, maxB, pct } from '../utils/money';
import { chance } from '../utils/random';
import { credit, debit, debitUpTo } from './economyService';
import { getConfig } from './configService';

const HOUR_MS = 3_600_000;

export const listBusinesses = () => prisma.business.findMany({ orderBy: { price: 'asc' } });

export const ownedBusinesses = (userId: string) =>
  prisma.userBusiness.findMany({ where: { userId }, include: { business: true }, orderBy: { business: { price: 'asc' } } });

/** Beneficio bruto/mantenimiento acumulado hasta ahora (para mostrar). */
export function pendingFor(ub: { lastCollectedAt: Date; business: { incomePerHour: bigint; upkeepPerHour: bigint; maxHours: number } }) {
  const ms = Math.min(Date.now() - ub.lastCollectedAt.getTime(), ub.business.maxHours * HOUR_MS);
  const safe = BigInt(Math.max(0, Math.floor(ms)));
  return {
    ms: Number(safe),
    income: (ub.business.incomePerHour * safe) / BigInt(HOUR_MS),
    upkeep: (ub.business.upkeepPerHour * safe) / BigInt(HOUR_MS),
    full: ms >= ub.business.maxHours * HOUR_MS,
  };
}

export async function buyBusiness(userId: string, businessId: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const business = await tx.business.findUnique({ where: { id: businessId } });
    if (!business) throw new UserError('❌ Ese negocio no existe.');
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.level < business.minLevel) {
      throw new UserError(`🔒 Necesitas **nivel ${business.minLevel}** para comprar ${business.emoji} ${business.name}.`);
    }
    const owned = await tx.userBusiness.findUnique({ where: { userId_businessId: { userId, businessId } } });
    if (owned) throw new UserError('🏢 Ya eres dueño de ese negocio.');

    const tax = pct(business.price, cfg.purchaseTaxPct);
    if (user.cash < business.price + tax) {
      throw new UserError(`💸 Necesitas **${formatMoney(business.price + tax)}** en efectivo (precio + impuestos).`);
    }
    await debit(tx, userId, 'CASH', business.price, 'PURCHASE', { note: `Negocio: ${business.name}` });
    if (tax > 0n) await debit(tx, userId, 'CASH', tax, 'TAX', { note: 'IVA negocio' });
    await tx.userBusiness.create({ data: { userId, businessId } });
    return { business, price: business.price, tax };
  });
}

export interface CollectLine {
  name: string;
  emoji: string;
  income: bigint;
  upkeep: bigint;
  repair: bigint;
  hours: number;
}

/** Cobra todos los negocios: ingresos − mantenimiento − averías − impuestos. */
export async function collectAll(userId: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const owned = await tx.userBusiness.findMany({ where: { userId }, include: { business: true } });
    if (owned.length === 0) throw new UserError('🏢 No tienes negocios. Consulta `/negocio catalogo`.');

    const now = Date.now();
    const lines: CollectLine[] = [];
    let income = 0n;
    let costs = 0n;

    for (const ub of owned) {
      const p = pendingFor(ub);
      if (p.ms < 60_000) continue; // menos de un minuto: nada que cobrar

      const broke = chance(BUSINESS.breakdownChance);
      const repair = broke ? ub.business.upkeepPerHour * BigInt(BUSINESS.breakdownUpkeepHours) : 0n;
      income += p.income;
      costs += p.upkeep + repair;
      lines.push({ name: ub.business.name, emoji: ub.business.emoji, income: p.income, upkeep: p.upkeep, repair, hours: p.ms / HOUR_MS });

      await tx.userBusiness.update({
        where: { userId_businessId: { userId, businessId: ub.businessId } },
        data: { lastCollectedAt: new Date(now), totalProfit: { increment: p.income - p.upkeep - repair } },
      });
    }
    if (lines.length === 0) throw new UserError('⏳ Tus negocios acaban de cobrarse; vuelve en unos minutos.');

    if (income > 0n) await credit(tx, userId, 'CASH', income, 'BUSINESS', { note: 'Ingresos de negocios' });
    const paidCosts = await debitUpTo(tx, userId, 'CASH', costs, 'UPKEEP', { note: 'Mantenimiento y reparaciones' });
    const tax = await debitUpTo(tx, userId, 'CASH', pct(maxB(0n, income - costs), cfg.businessTaxPct), 'TAX', {
      note: 'Impuesto sobre beneficios',
    });
    return { lines, income, costs: paidCosts, tax, net: income - paidCosts - tax };
  });
}

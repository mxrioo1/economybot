import { prisma, type Tx } from '../database/prisma';
import { lockUsers, runTx } from '../database/transaction';
import { UserError } from '../utils/errors';
import { pct } from '../utils/money';
import { debit } from './economyService';
import { getConfig } from './configService';

export async function getPropertyBonuses(tx: Tx, userId: string) {
  const owned = await tx.userProperty.findMany({ where: { userId }, include: { property: true } });
  return {
    capacity: owned.reduce((a, o) => a + o.property.capacity, 0),
    workBonusPct: owned.reduce((a, o) => a + o.property.workBonusPct, 0),
    bankBonus: owned.reduce((a, o) => a + o.property.bankBonus, 0n),
  };
}

export const listProperties = () => prisma.property.findMany({ orderBy: { price: 'asc' } });

export const ownedProperties = (userId: string) =>
  prisma.userProperty.findMany({ where: { userId }, include: { property: true }, orderBy: { property: { price: 'asc' } } });

export async function buyProperty(userId: string, propertyId: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const property = await tx.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new UserError('❌ Esa propiedad no existe.');

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.level < property.minLevel) {
      throw new UserError(`🔒 Necesitas **nivel ${property.minLevel}** para comprar ${property.emoji} ${property.name}.`);
    }
    const owned = await tx.userProperty.findUnique({ where: { userId_propertyId: { userId, propertyId } } });
    if (owned) throw new UserError('🏠 Ya eres propietario de esa propiedad.');

    const tax = pct(property.price, cfg.purchaseTaxPct);
    if (user.cash < property.price + tax) {
      throw new UserError(`💸 Necesitas **$${(property.price + tax).toLocaleString('en-US')}** en efectivo (precio + impuestos).`);
    }
    await debit(tx, userId, 'CASH', property.price, 'PURCHASE', { note: `Propiedad: ${property.name}` });
    if (tax > 0n) await debit(tx, userId, 'CASH', tax, 'TAX', { note: 'IVA propiedad' });
    await tx.userProperty.create({ data: { userId, propertyId } });
    return { property, price: property.price, tax };
  });
}

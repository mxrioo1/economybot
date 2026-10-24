import type { Item, ItemCategory, Property, Rarity } from '@prisma/client';
import { prisma } from '../database/prisma';
import { lockUsers, runTx } from '../database/transaction';
import { INVENTORY } from '../config/economy';
import { parseMeta } from '../types/items';
import { UserError } from '../utils/errors';
import { formatMoney, pct } from '../utils/money';
import { debit, credit } from './economyService';
import { addItem, getOwned, removeItem } from './inventoryService';
import { buyProperty } from './propertyService';
import { activateBoost } from './eventService';
import { getConfig } from './configService';

export const SHOP_CATEGORIES = ['VEHICULOS', 'CASAS', 'HERRAMIENTAS', 'OBJETOS', 'COSMETICOS', 'BOOSTS'] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];
export const SHOP_PAGE_SIZE = 5;

export interface ShopEntry {
  /** Valor que se usa en /comprar: id del item o `prop:<id>`. */
  key: string;
  kind: 'item' | 'property';
  name: string;
  emoji: string;
  description: string;
  price: bigint;
  minLevel: number;
  rarity?: Rarity;
  stock?: number | null;
}

const fromItem = (i: Item): ShopEntry => ({
  key: i.id,
  kind: 'item',
  name: i.name,
  emoji: i.emoji,
  description: i.description,
  price: i.price,
  minLevel: i.minLevel,
  rarity: i.rarity,
  stock: i.stock,
});

const fromProperty = (p: Property): ShopEntry => ({
  key: `prop:${p.id}`,
  kind: 'property',
  name: p.name,
  emoji: p.emoji,
  description: p.description,
  price: p.price,
  minLevel: p.minLevel,
});

export async function listShop(category: ShopCategory, page: number) {
  if (category === 'CASAS') {
    const [rows, total] = await Promise.all([
      prisma.property.findMany({ orderBy: { price: 'asc' }, skip: page * SHOP_PAGE_SIZE, take: SHOP_PAGE_SIZE }),
      prisma.property.count(),
    ]);
    return { entries: rows.map(fromProperty), total };
  }
  const where = { category: category as ItemCategory, shopListed: true };
  const [rows, total] = await Promise.all([
    prisma.item.findMany({ where, orderBy: { price: 'asc' }, skip: page * SHOP_PAGE_SIZE, take: SHOP_PAGE_SIZE }),
    prisma.item.count({ where }),
  ]);
  return { entries: rows.map(fromItem), total };
}

/** Compra un item (`id`) o una propiedad (`prop:id`). */
export async function purchase(userId: string, key: string, quantity = 1) {
  if (key.startsWith('prop:')) {
    const r = await buyProperty(userId, key.slice(5));
    return { name: `${r.property.emoji} ${r.property.name}`, quantity: 1, price: r.price, tax: r.tax, kind: 'property' as const };
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > INVENTORY.maxBuyQuantity) {
    throw new UserError(`❌ La cantidad debe estar entre 1 y ${INVENTORY.maxBuyQuantity}.`);
  }
  const cfg = await getConfig();

  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const item = await tx.item.findUnique({ where: { id: key } });
    if (!item || !item.shopListed) throw new UserError('❌ Ese artículo no existe en la tienda.');

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.level < item.minLevel) throw new UserError(`🔒 Necesitas **nivel ${item.minLevel}** para comprar ${item.emoji} ${item.name}.`);

    const meta = parseMeta(item.meta);
    const unique = meta?.kind === 'tool' || meta?.kind === 'vehicle' || meta?.kind === 'cosmetic';
    if (unique) {
      if (quantity !== 1) throw new UserError('❌ Ese artículo solo se puede comprar de uno en uno.');
      if ((await getOwned(tx, userId, item.id)) > 0) throw new UserError(`✅ Ya tienes ${item.emoji} **${item.name}**.`);
    }

    if (item.stock !== null) {
      const res = await tx.item.updateMany({ where: { id: item.id, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } });
      if (res.count !== 1) throw new UserError('📦 Ese artículo está **agotado** o no quedan suficientes unidades.');
    }

    const total = item.price * BigInt(quantity);
    const tax = pct(total, cfg.purchaseTaxPct);
    if (user.cash < total + tax) {
      throw new UserError(`💸 Necesitas **${formatMoney(total + tax)}** en efectivo (incluye ${formatMoney(tax)} de impuestos).`);
    }
    await debit(tx, userId, 'CASH', total, 'PURCHASE', { note: `${quantity}x ${item.name}` });
    if (tax > 0n) await debit(tx, userId, 'CASH', tax, 'TAX', { note: 'IVA tienda' });
    await addItem(tx, userId, item.id, quantity);

    return { name: `${item.emoji} ${item.name}`, quantity, price: total, tax, kind: 'item' as const };
  });
}

/** Vende objetos del inventario. `rawQty`: número o "todo". */
export async function sellItem(userId: string, itemId: string, rawQty: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const item = await tx.item.findUnique({ where: { id: itemId } });
    if (!item) throw new UserError('❌ Ese objeto no existe.');
    if (!item.sellable || item.sellValue <= 0n) throw new UserError('🚫 Ese objeto no se puede vender.');

    const owned = await getOwned(tx, userId, item.id);
    if (owned <= 0) throw new UserError(`❌ No tienes ${item.emoji} ${item.name}.`);

    const cleaned = rawQty.trim().toLowerCase();
    let qty: number;
    if (cleaned === 'todo' || cleaned === 'all') qty = owned;
    else if (/^\d{1,6}$/.test(cleaned)) qty = Number(cleaned);
    else throw new UserError('❌ Cantidad no válida. Usa un número o `todo`.');
    if (qty < 1) throw new UserError('❌ La cantidad debe ser al menos 1.');
    if (qty > owned) throw new UserError(`❌ Solo tienes **${owned}** unidades.`);

    await removeItem(tx, userId, item.id, qty);
    const gross = item.sellValue * BigInt(qty);
    await credit(tx, userId, 'CASH', gross, 'SALE', { note: `${qty}x ${item.name}` });
    const fee = pct(gross, cfg.sellFeePct);
    if (fee > 0n) await debit(tx, userId, 'CASH', fee, 'TAX', { note: 'Comisión de venta' });
    return { item, qty, gross, fee, net: gross - fee };
  });
}

/** Usa un objeto consumible (boosts y escudos). */
export async function useItem(userId: string, itemId: string) {
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const item = await tx.item.findUnique({ where: { id: itemId } });
    if (!item) throw new UserError('❌ Ese objeto no existe.');
    const meta = parseMeta(item.meta);
    if (meta?.kind !== 'boost') throw new UserError('🚫 Ese objeto no se puede usar. Los boosts y escudos sí.');

    await removeItem(tx, userId, item.id, 1);
    const expiresAt = await activateBoost(tx, userId, meta.boost, meta.multiplier, meta.minutes);
    return { item, meta, expiresAt };
  });
}

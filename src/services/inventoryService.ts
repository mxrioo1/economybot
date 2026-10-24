import type { Item } from '@prisma/client';
import { prisma, type Tx } from '../database/prisma';
import { INVENTORY } from '../config/economy';
import { parseMeta } from '../types/items';
import { UserError } from '../utils/errors';

export async function getCapacity(tx: Tx, userId: string): Promise<number> {
  const props = await tx.userProperty.findMany({
    where: { userId },
    select: { property: { select: { capacity: true } } },
  });
  return INVENTORY.baseCapacity + props.reduce((acc, p) => acc + p.property.capacity, 0);
}

export async function usedSlots(tx: Tx, userId: string): Promise<number> {
  const r = await tx.inventory.aggregate({ where: { userId }, _sum: { quantity: true } });
  return r._sum.quantity ?? 0;
}

export async function getOwned(tx: Tx, userId: string, itemId: string): Promise<number> {
  const row = await tx.inventory.findUnique({ where: { userId_itemId: { userId, itemId } } });
  return row?.quantity ?? 0;
}

/** Añade objetos respetando la capacidad. Requiere fila de usuario bloqueada. */
export async function addItem(tx: Tx, userId: string, itemId: string, quantity: number): Promise<void> {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Cantidad de inventario inválida');
  const [capacity, used] = await Promise.all([getCapacity(tx, userId), usedSlots(tx, userId)]);
  if (used + quantity > capacity) {
    throw new UserError(
      `🎒 Tu inventario está lleno (**${used}/${capacity}**). Vende objetos con \`/vender\` o compra una casa con más capacidad.`,
    );
  }
  await tx.inventory.upsert({
    where: { userId_itemId: { userId, itemId } },
    update: { quantity: { increment: quantity } },
    create: { userId, itemId, quantity },
  });
}

/** Quita objetos de forma atómica; falla si no hay suficientes. */
export async function removeItem(tx: Tx, userId: string, itemId: string, quantity: number): Promise<void> {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Cantidad de inventario inválida');
  const res = await tx.inventory.updateMany({
    where: { userId, itemId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (res.count !== 1) throw new UserError('❌ No tienes suficientes unidades de ese objeto.');
  await tx.inventory.deleteMany({ where: { userId, itemId, quantity: { lte: 0 } } });
}

async function ownedItems(tx: Tx, userId: string): Promise<Item[]> {
  const rows = await tx.inventory.findMany({ where: { userId }, include: { item: true } });
  return rows.map((r) => r.item);
}

/** Mejor herramienta (la de más suerte) que posee el usuario. */
export async function bestToolLuck(tx: Tx, userId: string, tool: 'fishing' | 'mining') {
  let luck = 1;
  let name: string | null = null;
  for (const it of await ownedItems(tx, userId)) {
    const meta = parseMeta(it.meta);
    if (meta?.kind === 'tool' && meta.tool === tool && meta.luck > luck) {
      luck = meta.luck;
      name = `${it.emoji} ${it.name}`;
    }
  }
  return { luck, name };
}

/** Mejor bonus de vehículo (no se acumulan). */
export async function vehicleBonus(tx: Tx, userId: string) {
  let pct = 0;
  let name: string | null = null;
  for (const it of await ownedItems(tx, userId)) {
    const meta = parseMeta(it.meta);
    if (meta?.kind === 'vehicle' && meta.workBonusPct > pct) {
      pct = meta.workBonusPct;
      name = `${it.emoji} ${it.name}`;
    }
  }
  return { pct, name };
}

export async function cosmeticBadges(userId: string): Promise<string[]> {
  const badges: string[] = [];
  for (const it of await ownedItems(prisma, userId)) {
    const meta = parseMeta(it.meta);
    if (meta?.kind === 'cosmetic') badges.push(meta.badge);
  }
  return badges.slice(0, 6);
}

export async function listInventory(userId: string, page: number) {
  const [rows, total, used] = await Promise.all([
    prisma.inventory.findMany({
      where: { userId },
      include: { item: true },
      orderBy: [{ item: { sellValue: 'desc' } }, { itemId: 'asc' }],
      skip: page * INVENTORY.pageSize,
      take: INVENTORY.pageSize,
    }),
    prisma.inventory.count({ where: { userId } }),
    usedSlots(prisma, userId),
  ]);
  const capacity = await getCapacity(prisma, userId);
  return { rows, total, used, capacity };
}

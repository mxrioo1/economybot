import type { AutocompleteInteraction } from 'discord.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';
import { formatMoney } from './money';
import { truncate } from './embeds';

type Choice = { name: string; value: string };
const send = (i: AutocompleteInteraction, choices: Choice[]) => i.respond(choices.slice(0, 25)).catch(() => undefined);
const clean = (q: string) => q.trim().slice(0, 40);

/** Objetos y casas de la tienda (para /comprar). */
export async function shopChoices(i: AutocompleteInteraction) {
  const q = clean(i.options.getFocused());
  const [items, props] = await Promise.all([
    prisma.item.findMany({ where: { shopListed: true, name: { contains: q, mode: 'insensitive' } }, orderBy: { price: 'asc' }, take: 18 }),
    prisma.property.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, orderBy: { price: 'asc' }, take: 7 }),
  ]);
  await send(i, [
    ...items.map((it) => ({ name: truncate(`${it.emoji} ${it.name} — ${formatMoney(it.price)}`, 100), value: it.id })),
    ...props.map((p) => ({ name: truncate(`${p.emoji} ${p.name} (casa) — ${formatMoney(p.price)}`, 100), value: `prop:${p.id}` })),
  ]);
}

/** Objetos del inventario del usuario; `only` filtra por tipo de objeto. */
export async function inventoryChoices(i: AutocompleteInteraction, only?: 'boost') {
  const q = clean(i.options.getFocused());
  const where: Prisma.InventoryWhereInput = { userId: i.user.id, item: { name: { contains: q, mode: 'insensitive' } } };
  if (only === 'boost') where.item = { ...(where.item as object), category: 'BOOSTS' };
  const rows = await prisma.inventory.findMany({ where, include: { item: true }, take: 25, orderBy: { item: { sellValue: 'desc' } } });
  await send(i, rows.map((r) => ({ name: truncate(`${r.item.emoji} ${r.item.name} ×${r.quantity}`, 100), value: r.itemId })));
}

export async function propertyChoices(i: AutocompleteInteraction) {
  const q = clean(i.options.getFocused());
  const rows = await prisma.property.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, orderBy: { price: 'asc' }, take: 25 });
  await send(i, rows.map((p) => ({ name: truncate(`${p.emoji} ${p.name} — ${formatMoney(p.price)} (nv. ${p.minLevel})`, 100), value: p.id })));
}

export async function businessChoices(i: AutocompleteInteraction) {
  const q = clean(i.options.getFocused());
  const rows = await prisma.business.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, orderBy: { price: 'asc' }, take: 25 });
  await send(i, rows.map((b) => ({ name: truncate(`${b.emoji} ${b.name} — ${formatMoney(b.price)} (nv. ${b.minLevel})`, 100), value: b.id })));
}

export async function jobChoices(i: AutocompleteInteraction) {
  const q = clean(i.options.getFocused());
  const rows = await prisma.job.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, orderBy: { minLevel: 'asc' }, take: 25 });
  await send(i, rows.map((j) => ({ name: truncate(`${j.emoji} ${j.name} (nv. ${j.minLevel})`, 100), value: j.id })));
}

import { INVENTORY } from '../config/economy';
import { listInventory } from '../services/inventoryService';
import { baseEmbed, EMOJI, RARITY_LABEL } from '../utils/embeds';
import { formatMoney } from '../utils/money';
import type { View } from '../types';
import { clampPage, pagerRow } from './common';

export async function buildInventoryView(targetId: string, requestedPage: number, ownerId: string): Promise<View> {
  const first = await listInventory(targetId, Math.max(0, requestedPage));
  const pages = Math.max(1, Math.ceil(first.total / INVENTORY.pageSize));
  const page = clampPage(requestedPage, pages);
  const data = page === requestedPage ? first : await listInventory(targetId, page);

  const lines = data.rows.map(({ item, quantity }) => {
    const value = item.sellValue > 0n ? `${formatMoney(item.sellValue)} c/u` : 'No vendible';
    return `${item.emoji} **${item.name}** ×${quantity}\n└ ${RARITY_LABEL[item.rarity]} · ${value}`;
  });

  const embed = baseEmbed()
    .setTitle(`${EMOJI.bag} Inventario de ${targetId === ownerId ? 'tu mochila' : 'otro jugador'}`)
    .setDescription(lines.length ? lines.join('\n') : '*Vacío. Prueba con `/pescar`, `/minar` o `/tienda`.*')
    .addFields({ name: 'Espacio', value: `**${data.used}/${data.capacity}** huecos usados`, inline: true })
    .setFooter({ text: `💰 Economía • ${data.total} tipo(s) de objeto` });
  if (targetId !== ownerId) embed.setDescription(`<@${targetId}>\n\n${embed.data.description}`);

  return { embeds: [embed], components: [pagerRow('inv', ownerId, [targetId], page, pages)] };
}

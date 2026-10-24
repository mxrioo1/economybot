import { StringSelectMenuBuilder } from 'discord.js';
import { listShop, SHOP_CATEGORIES, SHOP_PAGE_SIZE, type ShopCategory } from '../services/shopService';
import { baseEmbed, CATEGORY_LABEL, COLORS, RARITY_LABEL, truncate } from '../utils/embeds';
import { formatMoney } from '../utils/money';
import type { View } from '../types';
import { clampPage, newRow, pagerRow } from './common';

export async function buildShopView(category: ShopCategory, requestedPage: number, ownerId: string, userLevel: number): Promise<View> {
  const first = await listShop(category, Math.max(0, requestedPage));
  const pages = Math.max(1, Math.ceil(first.total / SHOP_PAGE_SIZE));
  const page = clampPage(requestedPage, pages);
  const data = page === requestedPage ? first : await listShop(category, page);

  const blocks = data.entries.map((e) => {
    const lock = e.minLevel > userLevel ? ` 🔒 nivel ${e.minLevel}` : '';
    const meta = [e.rarity ? RARITY_LABEL[e.rarity] : null, e.minLevel > 1 ? `Nivel ${e.minLevel}+` : null, e.stock != null ? `Stock: ${e.stock}` : null]
      .filter(Boolean)
      .join(' · ');
    return `${e.emoji} **${e.name}** — ${formatMoney(e.price)}${lock}\n> ${e.description || 'Sin descripción.'}${meta ? `\n> ${meta}` : ''}\n> \`/comprar ${e.key}\``;
  });

  const embed = baseEmbed(COLORS.primary)
    .setTitle(`🛒 Tienda — ${CATEGORY_LABEL[category]}`)
    .setDescription(blocks.length ? blocks.join('\n\n') : '*No hay artículos en esta categoría.*')
    .setFooter({ text: '💰 Economía • Los precios llevan IVA al comprar' });

  const rows = [
    newRow().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`shop:${ownerId}:cat`)
        .setPlaceholder('Categoría…')
        .addOptions(SHOP_CATEGORIES.map((c) => ({ label: CATEGORY_LABEL[c]!.replace(/^\S+\s/, ''), value: c, emoji: CATEGORY_LABEL[c]!.split(' ')[0], default: c === category }))),
    ),
  ];
  if (data.entries.length > 0) {
    rows.push(
      newRow().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`shop:${ownerId}:buy:${category}:${page}`)
          .setPlaceholder('🛒 Comprar 1 unidad de…')
          .addOptions(data.entries.map((e) => ({ label: truncate(`${e.name} — ${formatMoney(e.price)}`, 100), value: e.key, emoji: e.emoji }))),
      ),
    );
  }
  rows.push(pagerRow('shop', ownerId, ['pg', category], page, pages));
  return { embeds: [embed], components: rows };
}

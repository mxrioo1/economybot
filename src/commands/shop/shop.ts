import { SHOP_CATEGORIES, purchase, sellItem, useItem, type ShopCategory } from '../../services/shopService';
import { getUser } from '../../services/userService';
import { logEvent } from '../../services/logService';
import { inventoryChoices, shopChoices } from '../../utils/autocomplete';
import { baseEmbed, CATEGORY_LABEL, COLORS, successEmbed } from '../../utils/embeds';
import { formatMoney } from '../../utils/money';
import { discordTime } from '../../utils/time';
import { INVENTORY } from '../../config/economy';
import { buildShopView } from '../../views/shop';
import { buildInventoryView } from '../../views/inventory';
import type { Command } from '../../types';
import { assertHuman, newCommand } from '../helpers';

export const tienda: Command = {
  data: newCommand('tienda', 'Explora la tienda por categorías.').addStringOption((o) =>
    o
      .setName('categoria')
      .setDescription('Categoría a mostrar')
      .addChoices(...SHOP_CATEGORIES.map((c) => ({ name: CATEGORY_LABEL[c]!.replace(/^\S+\s/, ''), value: c }))),
  ),
  async execute(i) {
    await i.deferReply();
    const category = (i.options.getString('categoria') ?? 'VEHICULOS') as ShopCategory;
    const user = await getUser(i.user.id);
    await i.editReply(await buildShopView(category, 0, i.user.id, user.level));
  },
};

export const comprar: Command = {
  data: newCommand('comprar', 'Compra un artículo o una casa de la tienda.')
    .addStringOption((o) => o.setName('item').setDescription('Artículo a comprar').setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName('cantidad').setDescription('Unidades (por defecto 1)').setMinValue(1).setMaxValue(INVENTORY.maxBuyQuantity)),
  async autocomplete(i) {
    await shopChoices(i);
  },
  async execute(i) {
    await i.deferReply();
    const r = await purchase(i.user.id, i.options.getString('item', true), i.options.getInteger('cantidad') ?? 1);
    await i.editReply({
      embeds: [
        successEmbed('Compra realizada', `Compraste **${r.quantity}× ${r.name}** por **${formatMoney(r.price)}**.\n🧾 Impuestos: **${formatMoney(r.tax)}**`),
      ],
    });
    await logEvent({ category: 'PURCHASE', title: `${i.user.tag} compró ${r.quantity}× ${r.name}`, description: `Total: ${formatMoney(r.price + r.tax)}`, amount: r.price });
  },
};

export const vender: Command = {
  data: newCommand('vender', 'Vende objetos de tu inventario.')
    .addStringOption((o) => o.setName('item').setDescription('Objeto a vender').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('cantidad').setDescription('Número de unidades o "todo" (por defecto 1)').setMaxLength(10)),
  async autocomplete(i) {
    await inventoryChoices(i);
  },
  async execute(i) {
    await i.deferReply();
    const r = await sellItem(i.user.id, i.options.getString('item', true), i.options.getString('cantidad') ?? '1');
    await i.editReply({
      embeds: [
        successEmbed('Venta realizada', `Vendiste **${r.qty}× ${r.item.emoji} ${r.item.name}** por **${formatMoney(r.gross)}**.\n🧾 Comisión: **-${formatMoney(r.fee)}** · Recibes **${formatMoney(r.net)}**`),
      ],
    });
    await logEvent({ category: 'SALE', title: `${i.user.tag} vendió ${r.qty}× ${r.item.name}`, description: `Neto: ${formatMoney(r.net)}`, amount: r.gross });
  },
};

export const usar: Command = {
  data: newCommand('usar', 'Usa un boost o un escudo de tu inventario.').addStringOption((o) =>
    o.setName('item').setDescription('Objeto a usar').setRequired(true).setAutocomplete(true),
  ),
  async autocomplete(i) {
    await inventoryChoices(i, 'boost');
  },
  async execute(i) {
    await i.deferReply();
    const r = await useItem(i.user.id, i.options.getString('item', true));
    await i.editReply({
      embeds: [baseEmbed(COLORS.success).setTitle(`${r.item.emoji} ${r.item.name} activado`).setDescription(`Efecto activo hasta ${discordTime(r.expiresAt, 'f')} (${discordTime(r.expiresAt)}).`)],
    });
  },
};

export const inventario: Command = {
  data: newCommand('inventario', 'Mira los objetos que tienes.').addUserOption((o) =>
    o.setName('usuario').setDescription('Ver el inventario de otro jugador'),
  ),
  async execute(i) {
    await i.deferReply();
    const target = i.options.getUser('usuario') ?? i.user;
    assertHuman(target);
    await getUser(target.id);
    await i.editReply(await buildInventoryView(target.id, 0, i.user.id));
  },
};

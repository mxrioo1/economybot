import { MessageFlags } from 'discord.js';
import type { ComponentHandler } from '../types';
import { SHOP_CATEGORIES, purchase, type ShopCategory } from '../services/shopService';
import { getUser } from '../services/userService';
import { logEvent } from '../services/logService';
import { buildShopView } from '../views/shop';
import { successEmbed } from '../utils/embeds';
import { formatMoney } from '../utils/money';

const isCategory = (v: unknown): v is ShopCategory => SHOP_CATEGORIES.includes(v as ShopCategory);

export const shopHandler: ComponentHandler = {
  prefix: 'shop',
  async execute(i, args) {
    const [action, cat, rawPage] = args;

    // Cambio de categoría (menú desplegable)
    if (i.isStringSelectMenu() && action === 'cat') {
      const category = i.values[0];
      if (!isCategory(category)) return;
      const user = await getUser(i.user.id);
      await i.update(await buildShopView(category, 0, i.user.id, user.level));
      return;
    }

    // Paginación
    if (i.isButton() && action === 'pg') {
      const page = Number(rawPage);
      if (!isCategory(cat) || !Number.isInteger(page)) return;
      const user = await getUser(i.user.id);
      await i.update(await buildShopView(cat, page, i.user.id, user.level));
      return;
    }

    // Compra rápida (1 unidad)
    if (i.isStringSelectMenu() && action === 'buy') {
      const key = i.values[0];
      if (!key) return;
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const r = await purchase(i.user.id, key, 1);
      await i.editReply({
        embeds: [successEmbed('Compra realizada', `Has comprado **${r.name}** por **${formatMoney(r.price)}** (+ ${formatMoney(r.tax)} de impuestos).`)],
      });
      await logEvent({ category: 'PURCHASE', title: `${i.user.tag} compró ${r.name}`, description: `<@${i.user.id}> pagó ${formatMoney(r.price + r.tax)}`, amount: r.price });
    }
  },
};

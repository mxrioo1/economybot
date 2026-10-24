import type { ComponentHandler } from '../types';
import { buildInventoryView } from '../views/inventory';

export const inventoryHandler: ComponentHandler = {
  prefix: 'inv',
  async execute(i, args) {
    if (!i.isButton()) return;
    const [targetId, rawPage] = args;
    const page = Number(rawPage);
    if (!targetId || !/^\d{15,25}$/.test(targetId) || !Number.isInteger(page)) return;
    await i.update(await buildInventoryView(targetId, page, i.user.id));
  },
};

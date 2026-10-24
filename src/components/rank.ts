import type { ComponentHandler } from '../types';
import { buildRankingView, RANKING_TYPES } from '../views/ranking';
import type { RankingType } from '../services/rankingService';

export const rankHandler: ComponentHandler = {
  prefix: 'rank',
  async execute(i, args) {
    if (!i.isStringSelectMenu() && !i.isButton()) return;
    let type: string | undefined;
    let page = 0;
    if (i.isStringSelectMenu()) type = i.values[0];
    else if (i.isButton()) {
      type = args[0];
      page = Number(args[1]);
    }
    if (!type || !RANKING_TYPES.includes(type as RankingType) || !Number.isInteger(page)) return;
    await i.update(await buildRankingView(type as RankingType, page, i.user.id));
  },
};

import { StringSelectMenuBuilder } from 'discord.js';
import { RANKING } from '../config/economy';
import { getRanking, type RankingType } from '../services/rankingService';
import { baseEmbed, COLORS } from '../utils/embeds';
import { formatMoney } from '../utils/money';
import type { View } from '../types';
import { clampPage, newRow, pagerRow } from './common';

export const RANKING_TYPES: RankingType[] = ['dinero', 'nivel', 'trabajo', 'patrimonio'];

const LABEL: Record<RankingType, string> = {
  dinero: '💰 Más ricos (efectivo + banco)',
  nivel: '⭐ Mayor nivel',
  trabajo: '💼 Más trabajadores',
  patrimonio: '🏛️ Mayor patrimonio',
};

const MEDALS = ['🥇', '🥈', '🥉'];

export async function buildRankingView(type: RankingType, requestedPage: number, ownerId: string): Promise<View> {
  let data = await getRanking(type, Math.max(0, requestedPage));
  const page = clampPage(requestedPage, data.pages);
  if (page !== requestedPage) data = await getRanking(type, page);

  const lines = data.rows.map((r, idx) => {
    const pos = page * RANKING.pageSize + idx;
    const medal = MEDALS[pos] ?? `**#${pos + 1}**`;
    let value: string;
    if (type === 'nivel') value = `Nivel **${r.value}** · ${r.extra}`;
    else if (type === 'trabajo') value = `**${r.value}** trabajos`;
    else value = `**${formatMoney(r.value)}**`;
    return `${medal} <@${r.userId}> — ${value}`;
  });

  const embed = baseEmbed(COLORS.money)
    .setTitle(`🏆 Ranking — ${LABEL[type]}`)
    .setDescription(lines.length ? lines.join('\n') : 'Aún no hay datos para este ranking.')
    .setFooter({ text: `💰 Economía • ${data.total} jugadores` });

  const select = newRow().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`rank:${ownerId}:sel`)
      .setPlaceholder('Cambiar de ranking…')
      .addOptions(RANKING_TYPES.map((t) => ({ label: LABEL[t], value: t, default: t === type }))),
  );
  return { embeds: [embed], components: [select, pagerRow('rank', ownerId, [type], page, data.pages)] };
}

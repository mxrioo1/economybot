import { prisma } from '../../database/prisma';
import { LEVELS } from '../../config/economy';
import { cosmeticBadges } from '../../services/inventoryService';
import { getNetWorth, getRank } from '../../services/rankingService';
import { getUser } from '../../services/userService';
import { baseEmbed, COLORS, progressBar } from '../../utils/embeds';
import { formatMoney, formatNumber } from '../../utils/money';
import type { Command } from '../../types';
import { assertHuman, newCommand } from '../helpers';

export const balance: Command = {
  data: newCommand('balance', 'Muestra tu dinero, nivel y patrimonio.').addUserOption((o) =>
    o.setName('usuario').setDescription('Ver la cartera de otro jugador'),
  ),
  async execute(i) {
    await i.deferReply();
    const target = i.options.getUser('usuario') ?? i.user;
    assertHuman(target);

    const user = await getUser(target.id);
    const [net, rank, badges, job] = await Promise.all([
      getNetWorth(target.id),
      getRank(target.id),
      cosmeticBadges(target.id),
      user.jobId ? prisma.job.findUnique({ where: { id: user.jobId } }) : null,
    ]);
    const need = LEVELS.xpForNext(user.level);

    const embed = baseEmbed(COLORS.money)
      .setAuthor({ name: `Cartera de ${target.displayName}`, iconURL: target.displayAvatarURL() })
      .setTitle(`${badges.join('') || '💳'} ${formatMoney(user.cash + user.bank)}`)
      .addFields(
        { name: '💵 Efectivo', value: formatMoney(user.cash), inline: true },
        { name: '🏦 Banco', value: formatMoney(user.bank), inline: true },
        { name: '🏛️ Patrimonio', value: formatMoney(net), inline: true },
        {
          name: `⭐ Nivel ${user.level}`,
          value: user.level >= LEVELS.maxLevel ? '**Nivel máximo**' : `${progressBar(user.xp, need)} ${formatNumber(user.xp)}/${formatNumber(need)} XP`,
        },
        { name: '💼 Trabajo', value: job ? `${job.emoji} ${job.name}` : '🪫 Desempleado', inline: true },
        { name: '📅 Racha diaria', value: `${user.dailyStreak} día(s)`, inline: true },
        { name: '🏆 Puesto', value: rank ? `#${rank}` : '—', inline: true },
      );
    await i.editReply({ embeds: [embed] });
  },
};

import { claimDaily } from '../../services/activityService';
import { baseEmbed, COLORS } from '../../utils/embeds';
import { formatMoney } from '../../utils/money';
import { logEvent } from '../../services/logService';
import { notesLine } from '../../views/results';
import { xpLine } from '../../views/common';
import type { Command } from '../../types';
import { newCommand } from '../helpers';

export const daily: Command = {
  data: newCommand('daily', 'Reclama tu recompensa diaria (cada 24 horas).'),
  async execute(i) {
    await i.deferReply();
    const r = await claimDaily(i.user.id);
    const embed = baseEmbed(COLORS.success)
      .setTitle('📅 ¡Recompensa diaria!')
      .setDescription(`Has recibido **${formatMoney(r.reward)}**.\n🔥 Racha: **${r.streak}** día(s) seguidos (más racha = más bonus).`)
      .addFields({ name: '💵 Efectivo', value: formatMoney(r.cash), inline: true }, { name: 'Progreso', value: xpLine(r.xp), inline: true });
    const notes = notesLine(r.notes);
    if (notes) embed.addFields({ name: 'Bonificaciones activas', value: notes });
    await i.editReply({ embeds: [embed] });
    await logEvent({ category: 'MINT', title: `Daily de ${i.user.tag}`, amount: r.reward });
  },
};

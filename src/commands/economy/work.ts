import { work as doWork } from '../../services/activityService';
import { baseEmbed, COLORS } from '../../utils/embeds';
import { formatMoney } from '../../utils/money';
import { logEvent } from '../../services/logService';
import { eventLine, notesLine } from '../../views/results';
import { xpLine } from '../../views/common';
import type { Command } from '../../types';
import { newCommand } from '../helpers';

export const work: Command = {
  data: newCommand('work', 'Trabaja en tu empleo actual para ganar dinero.'),
  async execute(i) {
    await i.deferReply();
    const r = await doWork(i.user.id);
    const embed = baseEmbed(COLORS.success)
      .setTitle(`${r.job.emoji} Turno como ${r.job.name}`)
      .setDescription(`Ganaste **${formatMoney(r.net)}** tras impuestos.`)
      .addFields(
        { name: 'Bruto', value: formatMoney(r.gross), inline: true },
        { name: '🧾 Impuesto', value: `-${formatMoney(r.tax)}`, inline: true },
        { name: '💵 Efectivo', value: formatMoney(r.cash), inline: true },
        { name: 'Progreso', value: xpLine(r.xp) },
      );
    const ev = eventLine(r.event);
    if (ev) embed.addFields({ name: '🎲 Evento aleatorio', value: ev });
    const notes = notesLine(r.notes);
    if (notes) embed.addFields({ name: 'Bonificaciones', value: notes });
    embed.setFooter({ text: `💰 Economía • Multiplicador x${r.multiplier.toFixed(2)}` });
    await i.editReply({ embeds: [embed] });
    await logEvent({ category: 'MINT', title: `Trabajo de ${i.user.tag}`, amount: r.gross });
  },
};

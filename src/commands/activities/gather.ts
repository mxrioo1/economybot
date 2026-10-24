import { gather, type GatherResult } from '../../services/activityService';
import { baseEmbed, COLORS, RARITY_LABEL } from '../../utils/embeds';
import { formatMoney } from '../../utils/money';
import { eventLine } from '../../views/results';
import { xpLine } from '../../views/common';
import type { Command } from '../../types';
import { newCommand } from '../helpers';

function render(r: GatherResult) {
  const fish = r.kind === 'fish';
  const total = r.item.sellValue * BigInt(r.quantity);
  const embed = baseEmbed(r.item.rarity === 'LEGENDARIO' ? COLORS.money : COLORS.info)
    .setTitle(fish ? '🎣 ¡Has pescado algo!' : '⛏️ ¡Has encontrado algo!')
    .setDescription(`${r.item.emoji} **${r.item.name}** ×${r.quantity}\n${RARITY_LABEL[r.item.rarity]} · Vale **${formatMoney(total)}** (\`/vender\`)`)
    .addFields(
      { name: fish ? '🪱 Cebo' : '🧰 Equipo', value: `-${formatMoney(r.cost)}`, inline: true },
      { name: '💵 Efectivo', value: formatMoney(r.cash), inline: true },
      { name: 'Progreso', value: xpLine(r.xp), inline: true },
    );
  if (r.toolName) embed.addFields({ name: '🍀 Herramienta', value: r.toolName, inline: true });
  const ev = eventLine(r.event);
  if (ev) embed.addFields({ name: '🎲 Evento aleatorio', value: ev });
  return embed;
}

export const pescar: Command = {
  data: newCommand('pescar', 'Lanza la caña: peces y tesoros de distintas rarezas (cuesta cebo).'),
  async execute(i) {
    await i.deferReply();
    await i.editReply({ embeds: [render(await gather(i.user.id, 'fish'))] });
  },
};

export const minar: Command = {
  data: newCommand('minar', 'Pica en la mina: minerales de distinto valor (cuesta equipo).'),
  async execute(i) {
    await i.deferReply();
    await i.editReply({ embeds: [render(await gather(i.user.id, 'mine'))] });
  },
};

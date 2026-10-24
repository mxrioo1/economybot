import { beg, crime as doCrime, rob } from '../../services/activityService';
import { logEvent } from '../../services/logService';
import { baseEmbed, COLORS } from '../../utils/embeds';
import { formatMoney } from '../../utils/money';
import { notesLine } from '../../views/results';
import { xpLine } from '../../views/common';
import type { Command } from '../../types';
import { assertHuman, newCommand } from '../helpers';

export const crimen: Command = {
  data: newCommand('crimen', 'Actividad de alto riesgo: gran botín… o una multa.'),
  async execute(i) {
    await i.deferReply();
    const r = await doCrime(i.user.id);
    const embed = r.win
      ? baseEmbed(COLORS.success).setTitle('🕵️ ¡Golpe perfecto!').setDescription(`Te escapas con **${formatMoney(r.amount)}**.`)
      : baseEmbed(COLORS.error).setTitle('🚔 ¡Te atraparon!').setDescription(r.amount > 0n ? `Pagas una multa de **${formatMoney(r.amount)}**.` : 'Te dejan ir… no llevabas nada encima.');
    embed.addFields({ name: '💵 Efectivo', value: formatMoney(r.cash), inline: true }, { name: 'Progreso', value: xpLine(r.xp), inline: true });
    const notes = notesLine(r.notes);
    if (notes && r.win) embed.addFields({ name: 'Bonificaciones', value: notes });
    await i.editReply({ embeds: [embed] });
    await logEvent({ category: r.win ? 'MINT' : 'BURN', title: `Crimen de ${i.user.tag}: ${r.win ? 'éxito' : 'multa'}`, amount: r.amount });
  },
};

export const robar: Command = {
  data: newCommand('robar', 'Intenta robar el efectivo de otro jugador (el banco está a salvo).').addUserOption((o) =>
    o.setName('usuario').setDescription('A quién robar').setRequired(true),
  ),
  async execute(i) {
    await i.deferReply();
    const target = i.options.getUser('usuario', true);
    assertHuman(target);
    const r = await rob(i.user.id, target.id);
    const embed = r.win
      ? baseEmbed(COLORS.success).setTitle('🦹 ¡Robo exitoso!').setDescription(`Le quitaste **${formatMoney(r.amount)}** a ${target}.\n🛡️ Ahora estará protegido un rato.`)
      : baseEmbed(COLORS.error).setTitle('🚨 ¡Te pillaron!').setDescription(`Fallaste y compensas a ${target} con **${formatMoney(r.amount)}**.`);
    embed.addFields({ name: '💵 Tu efectivo', value: formatMoney(r.cash), inline: true }, { name: 'Progreso', value: xpLine(r.xp), inline: true });
    await i.editReply({ content: `${target}`, embeds: [embed], allowedMentions: { users: [target.id] } });
    await logEvent({ category: 'TRANSFER', title: `Robo ${r.win ? 'exitoso' : 'fallido'}`, description: `<@${i.user.id}> → <@${target.id}>: ${formatMoney(r.amount)}`, amount: r.amount });
  },
};

export const mendigar: Command = {
  data: newCommand('mendigar', 'Pide unas monedas por la calle.'),
  async execute(i) {
    await i.deferReply();
    const r = await beg(i.user.id);
    const embed =
      r.amount > 0n
        ? baseEmbed(COLORS.info).setTitle('🙏 Alguien se compadece').setDescription(`Te dan **${formatMoney(r.amount)}**.`)
        : baseEmbed(COLORS.warn).setTitle('😔 Nadie te hace caso').setDescription('Hoy la gente va con prisa… no consigues nada.');
    embed.addFields({ name: '💵 Efectivo', value: formatMoney(r.cash), inline: true }, { name: 'Progreso', value: xpLine(r.xp), inline: true });
    await i.editReply({ embeds: [embed] });
  },
};

import { prisma } from '../../database/prisma';
import { COOLDOWNS, type CooldownKey } from '../../config/economy';
import { remaining } from '../../services/cooldownService';
import { baseEmbed } from '../../utils/embeds';
import { formatDuration } from '../../utils/time';
import type { Command } from '../../types';
import { EPHEMERAL, newCommand } from '../helpers';

const LABELS: [CooldownKey, string][] = [
  ['daily', '📅 /daily'], ['work', '💼 /work'], ['fish', '🎣 /pescar'], ['mine', '⛏️ /minar'],
  ['crime', '🕵️ /crimen'], ['rob', '🦹 /robar'], ['beg', '🙏 /mendigar'],
];

export const cooldowns: Command = {
  data: newCommand('cooldowns', 'Mira cuándo podrás volver a usar cada actividad.'),
  async execute(i) {
    await i.deferReply({ flags: EPHEMERAL });
    const lines: string[] = [];
    for (const [key, label] of LABELS) {
      const ms = await remaining(prisma, i.user.id, key);
      lines.push(`${label} — ${ms > 0 ? `⏳ **${formatDuration(ms)}**` : '✅ **Disponible**'}`);
    }
    const prot = await remaining(prisma, i.user.id, 'robProtect');
    if (prot > 0) lines.push(`🛡️ Protección anti-robo — **${formatDuration(prot)}**`);
    await i.editReply({ embeds: [baseEmbed().setTitle('⏱️ Tus cooldowns').setDescription(lines.join('\n')).setFooter({ text: `💰 Economía • Base: /work ${formatDuration(COOLDOWNS.work)}` })] });
  },
};

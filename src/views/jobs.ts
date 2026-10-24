import { StringSelectMenuBuilder } from 'discord.js';
import { DEFAULT_JOB_ID } from '../config/economy';
import { listJobs } from '../services/jobService';
import { getUser } from '../services/userService';
import { baseEmbed } from '../utils/embeds';
import { formatMoney } from '../utils/money';
import type { View } from '../types';
import { newRow } from './common';

export async function buildJobsView(userId: string): Promise<View> {
  const [user, jobs] = await Promise.all([getUser(userId), listJobs()]);
  const currentId = user.jobId ?? DEFAULT_JOB_ID;
  const current = jobs.find((j) => j.id === currentId);

  const lines = jobs.map((j) => {
    const mark = j.id === currentId ? '✅' : j.minLevel > user.level ? '🔒' : '▫️';
    return `${mark} ${j.emoji} **${j.name}** — nv. ${j.minLevel} · ${formatMoney(j.minPay)}–${formatMoney(j.maxPay)} por turno`;
  });

  const embed = baseEmbed()
    .setTitle('💼 Trabajos')
    .setDescription(`**Trabajo actual:** ${current ? `${current.emoji} ${current.name}` : 'Ninguno'}\n*${current?.description ?? ''}*\n\n${lines.join('\n')}`)
    .setFooter({ text: `💰 Economía • Tu nivel: ${user.level}` });

  const options = jobs.filter((j) => j.id !== currentId && j.minLevel <= user.level).slice(0, 25);
  const components = options.length
    ? [
        newRow().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`job:${userId}:set`)
            .setPlaceholder('Cambiar de trabajo…')
            .addOptions(options.map((j) => ({ label: j.name, description: `${formatMoney(j.minPay)}–${formatMoney(j.maxPay)}`, value: j.id, emoji: j.emoji }))),
        ),
      ]
    : [];
  return { embeds: [embed], components };
}

import { MessageFlags } from 'discord.js';
import type { ComponentHandler } from '../types';
import { changeJob } from '../services/jobService';
import { buildJobsView } from '../views/jobs';
import { successEmbed } from '../utils/embeds';
import { formatMoney } from '../utils/money';

export const jobHandler: ComponentHandler = {
  prefix: 'job',
  async execute(i) {
    if (!i.isStringSelectMenu()) return;
    const jobId = i.values[0];
    if (!jobId) return;
    await i.deferUpdate();
    const job = await changeJob(i.user.id, jobId);
    await i.editReply(await buildJobsView(i.user.id));
    await i.followUp({
      flags: MessageFlags.Ephemeral,
      embeds: [successEmbed('¡Nuevo trabajo!', `Ahora eres ${job.emoji} **${job.name}**.\nPaga: ${formatMoney(job.minPay)}–${formatMoney(job.maxPay)} por turno.`)],
    });
  },
};

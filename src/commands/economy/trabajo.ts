import { changeJob } from '../../services/jobService';
import { jobChoices } from '../../utils/autocomplete';
import { successEmbed } from '../../utils/embeds';
import { formatMoney } from '../../utils/money';
import { buildJobsView } from '../../views/jobs';
import type { Command } from '../../types';
import { newCommand } from '../helpers';

export const trabajo: Command = {
  data: newCommand('trabajo', 'Consulta tu trabajo actual, mira los disponibles o cambia de empleo.').addStringOption((o) =>
    o.setName('cambiar').setDescription('Trabajo al que quieres cambiarte').setAutocomplete(true),
  ),
  async autocomplete(i) {
    await jobChoices(i);
  },
  async execute(i) {
    await i.deferReply();
    const target = i.options.getString('cambiar');
    if (target) {
      const job = await changeJob(i.user.id, target);
      await i.editReply({
        embeds: [successEmbed('¡Nuevo trabajo!', `Ahora eres ${job.emoji} **${job.name}**.\nPaga: ${formatMoney(job.minPay)}–${formatMoney(job.maxPay)} por turno.`)],
      });
      return;
    }
    await i.editReply(await buildJobsView(i.user.id));
  },
};

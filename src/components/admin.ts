import { MessageFlags } from 'discord.js';
import type { ComponentHandler } from '../types';
import { resetUser } from '../services/adminService';
import { logEvent } from '../services/logService';
import { isEconomyAdmin } from '../utils/permissions';
import { baseEmbed, COLORS, successEmbed } from '../utils/embeds';
import { UserError } from '../utils/errors';

/** customId: adm:<adminId>:reset:<targetId>:<yes|no> */
export const adminHandler: ComponentHandler = {
  prefix: 'adm',
  async execute(i, args) {
    if (!i.isButton()) return;
    if (!isEconomyAdmin(i)) throw new UserError('🚫 No tienes permisos para esto.');
    const [action, targetId, decision] = args;

    if (action === 'reset' && targetId && /^\d{15,25}$/.test(targetId)) {
      if (decision !== 'yes') {
        return void (await i.update({ embeds: [baseEmbed(COLORS.warn).setDescription('Reinicio cancelado.')], components: [] }));
      }
      await i.deferUpdate();
      await resetUser(i.user.id, targetId);
      await i.editReply({ embeds: [successEmbed('Cuenta reiniciada', `Se reinició la economía de <@${targetId}>.`)], components: [] });
      await logEvent({ category: 'ADMIN', title: 'Reinicio de cuenta', description: `<@${i.user.id}> reinició la cuenta de <@${targetId}>`, always: true });
      await i.followUp({ content: '✅ Hecho.', flags: MessageFlags.Ephemeral });
    }
  },
};

import { payUser } from '../../services/transferService';
import { logEvent } from '../../services/logService';
import { successEmbed } from '../../utils/embeds';
import { formatMoney } from '../../utils/money';
import type { Command } from '../../types';
import { assertHuman, newCommand } from '../helpers';

export const pagar: Command = {
  data: newCommand('pagar', 'Transfiere efectivo a otro jugador.')
    .addUserOption((o) => o.setName('usuario').setDescription('Quién recibe el dinero').setRequired(true))
    .addStringOption((o) => o.setName('cantidad').setDescription('Cantidad: 500, 2k, mitad o todo').setRequired(true).setMaxLength(20)),
  async execute(i) {
    await i.deferReply();
    const target = i.options.getUser('usuario', true);
    assertHuman(target);
    const r = await payUser(i.user.id, target.id, i.options.getString('cantidad', true));
    await i.editReply({
      embeds: [
        successEmbed('Pago realizado', `Enviaste **${formatMoney(r.total)}** a ${target}.\n🧾 Impuesto (${r.taxPct}%): **${formatMoney(r.tax)}** · Recibe: **${formatMoney(r.net)}**`),
      ],
    });
    await logEvent({
      category: 'TRANSFER',
      title: 'Transferencia entre jugadores',
      description: `<@${i.user.id}> → <@${target.id}>`,
      fields: [{ name: 'Importe', value: `${formatMoney(r.total)} (neto ${formatMoney(r.net)}, impuesto ${formatMoney(r.tax)})` }],
      amount: r.total,
    });
  },
};

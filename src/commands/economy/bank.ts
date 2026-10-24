import { deposit, withdraw } from '../../services/bankService';
import { logEvent } from '../../services/logService';
import { successEmbed } from '../../utils/embeds';
import { formatMoney } from '../../utils/money';
import { buildBankView } from '../../views/bank';
import type { Command } from '../../types';
import { EPHEMERAL, newCommand } from '../helpers';

export const banco: Command = {
  data: newCommand('banco', 'Abre tu panel bancario: saldo, límite, intereses e historial.'),
  async execute(i) {
    await i.deferReply({ flags: EPHEMERAL });
    await i.editReply(await buildBankView(i.user.id));
  },
};

const amountOption = (o: import('discord.js').SlashCommandStringOption) =>
  o.setName('cantidad').setDescription('Cantidad: 500, 2k, 1.5m, mitad o todo').setRequired(true).setMaxLength(20);

export const depositar: Command = {
  data: newCommand('depositar', 'Pasa dinero del efectivo al banco.').addStringOption(amountOption),
  async execute(i) {
    await i.deferReply();
    const r = await deposit(i.user.id, i.options.getString('cantidad', true));
    await i.editReply({
      embeds: [successEmbed('Depósito realizado', `📥 Depositaste **${formatMoney(r.amount)}**.\n💵 Efectivo: **${formatMoney(r.cash)}** · 🏦 Banco: **${formatMoney(r.bank)}** / ${formatMoney(r.limit)}`)],
    });
    await logEvent({ category: 'TRANSFER', title: 'Depósito', description: `<@${i.user.id}> depositó ${formatMoney(r.amount)}`, amount: r.amount });
  },
};

export const retirar: Command = {
  data: newCommand('retirar', 'Pasa dinero del banco al efectivo.').addStringOption(amountOption),
  async execute(i) {
    await i.deferReply();
    const r = await withdraw(i.user.id, i.options.getString('cantidad', true));
    await i.editReply({
      embeds: [successEmbed('Retiro realizado', `📤 Retiraste **${formatMoney(r.amount)}**.\n💵 Efectivo: **${formatMoney(r.cash)}** · 🏦 Banco: **${formatMoney(r.bank)}**`)],
    });
    await logEvent({ category: 'TRANSFER', title: 'Retiro', description: `<@${i.user.id}> retiró ${formatMoney(r.amount)}`, amount: r.amount });
  },
};

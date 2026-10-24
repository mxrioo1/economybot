import { ActionRowBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import type { ComponentHandler } from '../types';
import { deposit, withdraw } from '../services/bankService';
import { logEvent } from '../services/logService';
import { buildBankView, buildHistoryView } from '../views/bank';
import { successEmbed } from '../utils/embeds';
import { formatMoney } from '../utils/money';

function amountModal(owner: string, kind: 'dep' | 'ret') {
  const input = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel('Cantidad (ej: 500, 2k, 1.5m, mitad, todo)')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(20)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(`bankmodal:${owner}:${kind}`)
    .setTitle(kind === 'dep' ? 'Depositar en el banco' : 'Retirar del banco')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

async function runAndRefresh(i: Parameters<ComponentHandler['execute']>[0], kind: 'dep' | 'ret', raw: string) {
  const r = kind === 'dep' ? await deposit(i.user.id, raw) : await withdraw(i.user.id, raw);
  await i.followUp({
    flags: MessageFlags.Ephemeral,
    embeds: [
      successEmbed(
        kind === 'dep' ? 'Depósito realizado' : 'Retiro realizado',
        `${kind === 'dep' ? '📥 Depositaste' : '📤 Retiraste'} **${formatMoney(r.amount)}**.\n💵 Efectivo: **${formatMoney(r.cash)}** · 🏦 Banco: **${formatMoney(r.bank)}**`,
      ),
    ],
  });
  await logEvent({ category: 'TRANSFER', title: kind === 'dep' ? 'Depósito' : 'Retiro', description: `<@${i.user.id}> ${kind === 'dep' ? 'depositó' : 'retiró'} ${formatMoney(r.amount)}`, amount: r.amount });
}

export const bankHandler: ComponentHandler = {
  prefix: 'bank',
  async execute(i, args) {
    if (!i.isButton()) return;
    const [action, rawPage] = args;

    if (action === 'dep' || action === 'ret') return void (await i.showModal(amountModal(i.user.id, action)));

    if (action === 'hist') {
      const page = Number(rawPage);
      if (!Number.isInteger(page)) return;
      return void (await i.update(await buildHistoryView(i.user.id, page)));
    }
    if (action === 'home') return void (await i.update(await buildBankView(i.user.id)));

    if (action === 'depall' || action === 'retall') {
      await i.deferUpdate();
      await runAndRefresh(i, action === 'depall' ? 'dep' : 'ret', 'todo');
      await i.editReply(await buildBankView(i.user.id));
    }
  },
};

export const bankModalHandler: ComponentHandler = {
  prefix: 'bankmodal',
  async execute(i, args) {
    if (!i.isModalSubmit()) return;
    const kind = args[0];
    if (kind !== 'dep' && kind !== 'ret') return;
    const raw = i.fields.getTextInputValue('amount');

    if (i.isFromMessage()) {
      await i.deferUpdate();
      await runAndRefresh(i, kind, raw);
      await i.editReply(await buildBankView(i.user.id));
    } else {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await runAndRefresh(i, kind, raw);
    }
  },
};

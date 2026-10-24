import { ButtonBuilder, ButtonStyle } from 'discord.js';
import type { TxType } from '@prisma/client';
import { BANK } from '../config/economy';
import { bankHistory, getBankState } from '../services/bankService';
import { baseEmbed, COLORS, progressBar } from '../utils/embeds';
import { formatMoney, pct } from '../utils/money';
import { discordTime } from '../utils/time';
import type { View } from '../types';
import { clampPage, newRow, pagerRow } from './common';

export const TX_LABEL: Record<TxType, string> = {
  WELCOME: '🎁 Bienvenida', DAILY: '📅 Diario', WORK: '💼 Trabajo', FISH: '🎣 Pesca', MINE: '⛏️ Minería',
  CRIME: '🕵️ Crimen', ROBBERY: '🦹 Robo', BEG: '🙏 Limosna', TRANSFER: '🔁 Transferencia', DEPOSIT: '📥 Depósito',
  WITHDRAW: '📤 Retiro', INTEREST: '💹 Intereses', PURCHASE: '🛒 Compra', SALE: '💱 Venta', TAX: '🧾 Impuesto',
  FINE: '🚨 Multa', COST: '🧰 Coste', UPKEEP: '🔧 Mantenimiento', EVENT: '🎲 Evento', BUSINESS: '🏢 Negocio', ADMIN: '🛡️ Admin', BET: '🎰 Apuesta', PAYOUT: '🏆 Premio',
};

export async function buildBankView(userId: string): Promise<View> {
  const { user, limit, interest } = await getBankState(userId);
  const embed = baseEmbed(COLORS.info)
    .setTitle('🏦 Tu banco')
    .setDescription(
      `${progressBar(Number(user.bank), Number(limit), 14)} **${Math.min(100, Math.floor((Number(user.bank) / Number(limit)) * 100))}%** del límite`,
    )
    .addFields(
      { name: '💵 Efectivo', value: formatMoney(user.cash), inline: true },
      { name: '🏦 En el banco', value: formatMoney(user.bank), inline: true },
      { name: '🔒 Límite', value: formatMoney(limit), inline: true },
      {
        name: '💹 Intereses',
        value: `${(BANK.dailyInterestRate * 100).toFixed(1)}% diario (máx. ${formatMoney(BANK.maxDailyInterest)}/día)${interest > 0n ? `\n✅ Acabas de cobrar **${formatMoney(interest)}**` : ''}`,
      },
      { name: '🛡️ Protección', value: 'El dinero del banco **no puede ser robado**. Sube de nivel o compra casas para ampliar el límite.' },
    );

  const row = newRow().addComponents(
    new ButtonBuilder().setCustomId(`bank:${userId}:dep`).setLabel('Depositar').setEmoji('📥').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bank:${userId}:ret`).setLabel('Retirar').setEmoji('📤').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bank:${userId}:depall`).setLabel('Depositar todo').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bank:${userId}:retall`).setLabel('Retirar todo').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bank:${userId}:hist:0`).setLabel('Historial').setEmoji('📜').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

export async function buildHistoryView(userId: string, requestedPage: number): Promise<View> {
  const first = await bankHistory(userId, Math.max(0, requestedPage));
  const pages = Math.max(1, Math.ceil(first.total / BANK.historyPageSize));
  const page = clampPage(requestedPage, pages);
  const data = page === requestedPage ? first : await bankHistory(userId, page);

  const lines = data.rows.map((t) => {
    const sign = t.amount >= 0n ? '+' : '-';
    const abs = t.amount >= 0n ? t.amount : -t.amount;
    const acc = t.account === 'CASH' ? '💵' : '🏦';
    return `${discordTime(t.createdAt)} ${TX_LABEL[t.type]} · **${sign}${formatMoney(abs)}** ${acc}${t.note ? `\n└ *${t.note}*` : ''}`;
  });
  const embed = baseEmbed(COLORS.info)
    .setTitle('📜 Historial de movimientos')
    .setDescription(lines.length ? lines.join('\n') : 'Sin movimientos todavía.');

  const back = newRow().addComponents(new ButtonBuilder().setCustomId(`bank:${userId}:home`).setLabel('Volver al banco').setEmoji('🏦').setStyle(ButtonStyle.Secondary));
  return { embeds: [embed], components: [pagerRow('bank', userId, ['hist'], page, pages), back] };
}

/** Utilidad para mostrar porcentajes en otras vistas. */
export const percentOf = pct;

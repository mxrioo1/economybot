import { ButtonBuilder, ButtonStyle, type EmbedBuilder } from 'discord.js';
import type { Game } from '@prisma/client';
import { CASINO } from '../config/casino';
import * as L from '../services/casinoLogic';
import type { BjState, CrashState, HiloState, MinesState, Step } from '../services/casinoService';
import { baseEmbed, COLORS } from '../utils/embeds';
import { formatMoney, scale } from '../utils/money';
import type { View } from '../types';
import { newRow } from './common';

const colorFor = (g: Game) =>
  g.status === 'ACTIVE' ? COLORS.primary
  : g.status === 'LOST' ? COLORS.error
  : g.status === 'PUSH' || g.status === 'REFUNDED' ? COLORS.warn
  : COLORS.success;

const money = formatMoney;
const sign = (n: bigint) => `${n >= 0n ? '+' : '-'}${money(n >= 0n ? n : -n)}`;

function footer(e: EmbedBuilder, cash: bigint) {
  return e.setFooter({ text: `🎰 Casino • Efectivo: ${money(cash)}` });
}

// ═════ Resultado de juegos instantáneos ═════
export function outcomeEmbed(o: { title: string; win: boolean; lines: string[]; bet: bigint; paid: bigint; cash: bigint }): EmbedBuilder {
  const net = o.paid - o.bet;
  return footer(
    baseEmbed(o.win ? COLORS.success : o.paid > 0n ? COLORS.warn : COLORS.error)
      .setTitle(o.title)
      .setDescription(o.lines.join('\n'))
      .addFields(
        { name: 'Apuesta', value: money(o.bet), inline: true },
        { name: 'Premio', value: money(o.paid), inline: true },
        { name: 'Resultado', value: `**${sign(net)}**`, inline: true },
      ),
    o.cash,
  );
}

export const spinningEmbed = (title: string, text: string): EmbedBuilder => baseEmbed(COLORS.info).setTitle(title).setDescription(text);

// ═════ Buscaminas (4 filas × 5 columnas + fila de retirada) ═════
export function minesView(r: Step<MinesState>): View {
  const { game, state } = r;
  const ended = game.status !== 'ACTIVE';
  const picks = state.revealed.length;
  const mult = L.minesMultiplier(state.mineCount, picks);
  const potential = scale(game.bet, mult);
  const safeLeft = L.MINES_TILES - state.mineCount - picks;

  const embed = footer(
    baseEmbed(colorFor(game)).setTitle(`💣 Buscaminas — ${state.mineCount} mina(s)`),
    r.cash,
  );
  if (game.status === 'LOST') embed.setDescription(`💥 **¡BOOM!** Pisaste una mina y perdiste **${money(game.bet)}**.`);
  else if (game.status === 'CASHED') embed.setDescription(`💰 Te retiraste con **${money(game.payout)}** (x${mult.toFixed(2)}). Beneficio: **${sign(game.payout - game.bet)}**`);
  else if (game.status === 'REFUNDED') embed.setDescription('↩️ Partida abandonada sin jugar: apuesta devuelta.');
  else embed.setDescription('Elige casillas **seguras**. Cuantas más abras, mayor multiplicador. Pulsa **Retirar** cuando quieras.');

  embed.addFields(
    { name: 'Apuesta', value: money(game.bet), inline: true },
    { name: 'Multiplicador', value: `x${mult.toFixed(2)}`, inline: true },
    { name: ended ? 'Premio' : 'Ahora cobrarías', value: money(ended ? game.payout : potential), inline: true },
  );
  if (!ended && safeLeft > 0) embed.addFields({ name: 'Siguiente casilla', value: `x${L.minesMultiplier(state.mineCount, picks + 1).toFixed(2)} · quedan ${safeLeft} seguras`, inline: false });

  const rows = [];
  for (let r0 = 0; r0 < CASINO.mines.rows; r0++) {
    const row = newRow();
    for (let c = 0; c < CASINO.mines.cols; c++) {
      const t = r0 * CASINO.mines.cols + c;
      const b = new ButtonBuilder().setCustomId(`mines:${game.userId}:${game.id}:${t}`);
      if (state.revealed.includes(t)) b.setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true);
      else if (ended && state.mines.includes(t)) b.setEmoji('💣').setStyle(ButtonStyle.Danger).setDisabled(true);
      else if (ended) b.setEmoji('▫️').setStyle(ButtonStyle.Secondary).setDisabled(true);
      else b.setEmoji('❔').setStyle(ButtonStyle.Secondary);
      row.addComponents(b);
    }
    rows.push(row);
  }
  rows.push(
    newRow().addComponents(
      new ButtonBuilder()
        .setCustomId(`mines:${game.userId}:${game.id}:cash`)
        .setLabel(picks === 0 || ended ? 'Retirar' : `Retirar ${money(potential)}`)
        .setEmoji('💰')
        .setStyle(ButtonStyle.Success)
        .setDisabled(ended || picks === 0),
    ),
  );
  return { embeds: [embed], components: rows };
}

// ═════ Blackjack ═════
export function blackjackView(r: Step<BjState>): View {
  const { game, state } = r;
  const ended = game.status !== 'ACTIVE';
  const p = L.handValue(state.player);
  const d = L.handValue(state.dealer);

  const embed = footer(baseEmbed(colorFor(game)).setTitle(`🃏 Blackjack${state.doubled ? ' (doblado)' : ''}`), r.cash).addFields(
    { name: `Tu mano (${p.total}${p.soft && p.total < 21 ? ' blando' : ''})`, value: L.handLabel(state.player), inline: true },
    {
      name: ended ? `Crupier (${d.total})` : 'Crupier',
      value: ended ? L.handLabel(state.dealer) : `${L.cardLabel(state.dealer[0]!)} 🂠`,
      inline: true,
    },
    { name: 'Apuesta', value: money(game.bet), inline: true },
  );

  if (ended) {
    const text: Record<L.BjResult, string> = {
      BLACKJACK: `🎉 **¡BLACKJACK!** Cobras 3:2 → **${money(game.payout)}**`,
      WIN: `✅ **Ganas** y cobras **${money(game.payout)}**`,
      PUSH: `🤝 **Empate.** Recuperas tu apuesta (${money(game.payout)})`,
      LOSE: `❌ **Pierdes** ${money(game.bet)}. El crupier tiene ${d.total}.`,
      BUST: `💥 **Te pasaste de 21** y pierdes ${money(game.bet)}.`,
    };
    embed.setDescription(text[state.result ?? 'LOSE']);
    return { embeds: [embed], components: [] };
  }

  embed.setDescription('El crupier se planta con 17. Blackjack paga 3:2.');
  const row = newRow().addComponents(
    new ButtonBuilder().setCustomId(`bj:${game.userId}:${game.id}:hit`).setLabel('Pedir').setEmoji('➕').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bj:${game.userId}:${game.id}:stand`).setLabel('Plantarse').setEmoji('✋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bj:${game.userId}:${game.id}:double`).setLabel('Doblar').setEmoji('✖️').setStyle(ButtonStyle.Success).setDisabled(state.player.length !== 2),
  );
  return { embeds: [embed], components: [row] };
}

// ═════ Hi-Lo ═════
export function hiloView(r: Step<HiloState>): View {
  const { game, state } = r;
  const ended = game.status !== 'ACTIVE';

  const embed = footer(baseEmbed(colorFor(game)).setTitle('🃏 Hi-Lo — ¿mayor o menor?'), r.cash);
  if (game.status === 'LOST') {
    embed.setDescription(`💥 Salió ${L.cardLabel(state.next ?? state.current, 1)} y **fallaste**. Pierdes **${money(game.bet)}**.\n*(El empate cuenta como fallo.)*`);
  } else if (game.status === 'CASHED') {
    embed.setDescription(`💰 Te retiraste con **${money(game.payout)}** (x${state.mult.toFixed(2)}). Beneficio: **${sign(game.payout - game.bet)}**`);
  } else if (game.status === 'REFUNDED') {
    embed.setDescription('↩️ Partida abandonada sin jugar: apuesta devuelta.');
  } else {
    embed.setDescription(`Carta actual: ${L.cardLabel(state.current)}\n¿La siguiente será **mayor** o **menor**? *(El empate pierde.)*`);
  }
  embed.addFields(
    { name: 'Apuesta', value: money(game.bet), inline: true },
    { name: 'Racha', value: `${state.streak} · x${state.mult.toFixed(2)}`, inline: true },
    { name: ended ? 'Premio' : 'Ahora cobrarías', value: money(ended ? game.payout : scale(game.bet, state.mult)), inline: true },
  );
  if (state.history.length) embed.addFields({ name: 'Cartas anteriores', value: L.handLabel(state.history) });
  if (ended) return { embeds: [embed], components: [] };

  const hi = L.hiloStep(state.current, 'hi');
  const lo = L.hiloStep(state.current, 'lo');
  const row = newRow().addComponents(
    new ButtonBuilder().setCustomId(`hilo:${game.userId}:${game.id}:hi`).setLabel(hi ? `Mayor (x${(state.mult * hi).toFixed(2)})` : 'Mayor').setEmoji('⬆️').setStyle(ButtonStyle.Primary).setDisabled(!hi),
    new ButtonBuilder().setCustomId(`hilo:${game.userId}:${game.id}:lo`).setLabel(lo ? `Menor (x${(state.mult * lo).toFixed(2)})` : 'Menor').setEmoji('⬇️').setStyle(ButtonStyle.Primary).setDisabled(!lo),
    new ButtonBuilder().setCustomId(`hilo:${game.userId}:${game.id}:cash`).setLabel('Retirar').setEmoji('💰').setStyle(ButtonStyle.Success).setDisabled(state.streak < 1),
  );
  return { embeds: [embed], components: [row] };
}

// ═════ Crash ═════
export function crashView(game: Game, state: CrashState, mult: number, cash: bigint): View {
  const ended = game.status !== 'ACTIVE';
  const embed = footer(baseEmbed(colorFor(game)).setTitle('🚀 Crash'), cash);

  if (game.status === 'ACTIVE') {
    embed
      .setDescription(`# x${mult.toFixed(2)}\nPulsa **Retirarse** antes de que el cohete explote.`)
      .addFields(
        { name: 'Apuesta', value: money(game.bet), inline: true },
        { name: 'Ahora cobrarías', value: money(scale(game.bet, mult)), inline: true },
      );
  } else if (game.status === 'CASHED') {
    embed
      .setDescription(`# ✅ x${(state.cashedAt ?? mult).toFixed(2)}\nTe retiraste a tiempo y cobras **${money(game.payout)}**.`)
      .addFields({ name: 'Resultado', value: `**${sign(game.payout - game.bet)}**`, inline: true }, { name: 'El cohete habría explotado en', value: `x${state.crashPoint.toFixed(2)}`, inline: true });
  } else {
    embed
      .setDescription(`# 💥 x${state.crashPoint.toFixed(2)}\n¡El cohete explotó! Pierdes **${money(game.bet)}**.`);
  }
  if (ended) return { embeds: [embed], components: [] };
  return {
    embeds: [embed],
    components: [newRow().addComponents(new ButtonBuilder().setCustomId(`crash:${game.userId}:${game.id}:cash`).setLabel('Retirarse').setEmoji('💰').setStyle(ButtonStyle.Success))],
  };
}

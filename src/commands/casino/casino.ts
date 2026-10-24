import { CASINO } from '../../config/casino';
import { casinoTop } from '../../services/casinoService';
import { getConfig } from '../../services/configService';
import { getUser } from '../../services/userService';
import { baseEmbed, COLORS } from '../../utils/embeds';
import { formatMoney, formatNumber } from '../../utils/money';
import type { Command } from '../../types';
import { newCommand } from '../helpers';

const signed = (n: bigint) => `${n >= 0n ? '+' : '-'}${formatMoney(n >= 0n ? n : -n)}`;
const MEDALS = ['🥇', '🥈', '🥉'];

export const casino: Command = {
  data: newCommand('casino', 'Reglas, probabilidades, tus estadísticas y el ranking del casino.')
    .addSubcommand((s) => s.setName('reglas').setDescription('Juegos disponibles, pagos y límites.'))
    .addSubcommand((s) => s.setName('stats').setDescription('Tus estadísticas de apuestas.'))
    .addSubcommand((s) => s.setName('top').setDescription('Quién ha ganado más en el casino.')),
  async execute(i) {
    await i.deferReply();
    const sub = i.options.getSubcommand();

    if (sub === 'reglas') {
      const cfg = await getConfig();
      const rtp = `${(CASINO.rtp * 100).toFixed(0)}%`;
      await i.editReply({
        embeds: [
          baseEmbed(COLORS.money)
            .setTitle('🎰 Casino — juegos y reglas')
            .setDescription(
              `Todo se juega con **dinero virtual** del servidor. Estado: ${cfg.gamblingEnabled ? '✅ **abierto**' : '🔒 **cerrado**'}.\n` +
                `Apuesta: **${formatMoney(cfg.gamblingMinBet)}** – **${formatMoney(cfg.gamblingMaxBet)}** · Premio máximo por partida: **${formatMoney(cfg.gamblingMaxPayout)}**\n` +
                `Los resultados se deciden en el servidor con aleatoriedad segura. La casa siempre tiene ventaja: **a la larga se pierde dinero**.`,
            )
            .addFields(
              { name: '🪙 /coinflip', value: `Cara o cruz · paga **x${CASINO.coinflip.multiplier}** (50 %)`, inline: true },
              { name: '🎲 /dados', value: `Mayor/menor que un objetivo · retorno ${rtp} (multiplicador según riesgo)`, inline: true },
              { name: '🎡 /ruleta', value: 'Europea 0‑36 · número x36 · color/paridad/mitad x2 · docena/columna x3 · retorno 97,3 %', inline: true },
              { name: '🎰 /tragaperras', value: 'Tres iguales: 🍒x5 🍋x8 🍊x12 🍇x20 🔔x50 💎x150 7️⃣x500 · 2 cerezas x1,8 · 1 cereza x0,4 · retorno ~94 %', inline: true },
              { name: '🃏 /blackjack', value: 'Blackjack 3:2 · crupier se planta en 17 · doblar con 2 cartas', inline: true },
              { name: '💣 /buscaminas', value: `Tablero ${CASINO.mines.rows}×${CASINO.mines.cols}, ${CASINO.mines.minMines}‑${CASINO.mines.maxMines} minas · retírate cuando quieras · retorno ${rtp}`, inline: true },
              { name: '⬆️ /hilo', value: `Mayor o menor, el empate pierde · multiplica por racha · retorno ${rtp}`, inline: true },
              { name: '🚀 /crash', value: `El cohete sube hasta x${CASINO.crash.maxPoint}; retírate antes de que explote · retorno ${rtp}`, inline: true },
              { name: 'ℹ️ Importante', value: `Solo una partida con estado a la vez. Si abandonas una, se liquida sola a los ${CASINO.staleMinutes} min (en buscaminas/hi-lo cobras lo acumulado; en blackjack el crupier juega).` },
            ),
        ],
      });
      return;
    }

    if (sub === 'stats') {
      const u = await getUser(i.user.id);
      const net = u.totalPayout - u.totalWagered;
      const rtp = u.totalWagered > 0n ? `${((Number(u.totalPayout) / Number(u.totalWagered)) * 100).toFixed(1)}%` : '—';
      await i.editReply({
        embeds: [
          baseEmbed(net >= 0n ? COLORS.success : COLORS.error)
            .setAuthor({ name: `Casino de ${i.user.displayName}`, iconURL: i.user.displayAvatarURL() })
            .setTitle(`Balance: ${signed(net)}`)
            .addFields(
              { name: '🎮 Partidas', value: formatNumber(u.gamesPlayed), inline: true },
              { name: '💸 Apostado', value: formatMoney(u.totalWagered), inline: true },
              { name: '🏆 Cobrado', value: formatMoney(u.totalPayout), inline: true },
              { name: '📈 Mayor ganancia', value: formatMoney(u.biggestWin), inline: true },
              { name: '🎯 Retorno real', value: rtp, inline: true },
            ),
        ],
      });
      return;
    }

    const rows = await casinoTop(10);
    const lines = rows.map((r, idx) => `${MEDALS[idx] ?? `**#${idx + 1}**`} <@${r.id}> — **${signed(r.net)}** · ${r.played} partidas`);
    await i.editReply({
      embeds: [baseEmbed(COLORS.money).setTitle('🏆 Mejores jugadores del casino').setDescription(lines.join('\n') || 'Nadie ha apostado todavía.')],
    });
  },
};

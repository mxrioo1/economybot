import type { SlashCommandStringOption } from 'discord.js';
import { CASINO } from '../../config/casino';
import {
  bustCrash, getGame, logCasino, playCoinflip, playDice, playRoulette, playSlots,
  startBlackjack, startCrash, startHilo, startMines,
} from '../../services/casinoService';
import * as L from '../../services/casinoLogic';
import { logger } from '../../utils/logger';
import { sleep } from '../../utils/time';
import { blackjackView, crashView, hiloView, minesView, outcomeEmbed, spinningEmbed } from '../../views/casino';
import type { Command } from '../../types';
import { newCommand } from '../helpers';

const betOption = (o: SlashCommandStringOption) =>
  o.setName('apuesta').setDescription('Apuesta: 500, 2k, 1.5m, mitad o todo').setRequired(true).setMaxLength(20);

// ═════ Coinflip ═════
export const coinflip: Command = {
  data: newCommand('coinflip', 'Cara o cruz: acierta y cobras x1,95.')
    .addStringOption(betOption)
    .addStringOption((o) =>
      o.setName('lado').setDescription('Tu elección').setRequired(true).addChoices({ name: '🪙 Cara', value: 'cara' }, { name: '⚫ Cruz', value: 'cruz' }),
    ),
  async execute(i) {
    await i.deferReply();
    const pick = i.options.getString('lado', true) as 'cara' | 'cruz';
    const r = await playCoinflip(i.user.id, i.options.getString('apuesta', true), pick);
    await i.editReply({ embeds: [spinningEmbed('🪙 Coinflip', 'La moneda gira por el aire…')] });
    await sleep(1_100);
    await i.editReply({
      embeds: [
        outcomeEmbed({
          title: r.win ? '🪙 ¡Ganaste!' : '🪙 Perdiste',
          win: r.win,
          lines: [`Elegiste **${pick}** y salió **${r.result}**.`],
          bet: r.bet, paid: r.paid, cash: r.cash,
        }),
      ],
    });
    await logCasino(i.user.tag, 'Coinflip', r.bet, r.paid);
  },
};

// ═════ Dados ═════
export const dados: Command = {
  data: newCommand('dados', 'Tira un dado de 1 a 100 y apuesta por encima o por debajo de un objetivo.')
    .addStringOption(betOption)
    .addStringOption((o) =>
      o.setName('modo').setDescription('¿Qué debe salir?').setRequired(true).addChoices({ name: '⬆️ Mayor que el objetivo', value: 'mayor' }, { name: '⬇️ Menor que el objetivo', value: 'menor' }),
    )
    .addIntegerOption((o) =>
      o.setName('objetivo').setDescription('Número objetivo (5‑95). Más riesgo = más premio').setRequired(true).setMinValue(CASINO.dice.minTarget).setMaxValue(CASINO.dice.maxTarget),
    ),
  async execute(i) {
    await i.deferReply();
    const mode = i.options.getString('modo', true) as 'mayor' | 'menor';
    const target = i.options.getInteger('objetivo', true);
    const r = await playDice(i.user.id, i.options.getString('apuesta', true), mode, target);
    await i.editReply({ embeds: [spinningEmbed('🎲 Dados', 'Los dados ruedan…')] });
    await sleep(1_000);
    await i.editReply({
      embeds: [
        outcomeEmbed({
          title: r.win ? '🎲 ¡Ganaste!' : '🎲 Perdiste',
          win: r.win,
          lines: [
            `Necesitabas **${mode === 'mayor' ? 'más' : 'menos'} de ${target}** (probabilidad ${(r.chance * 100).toFixed(0)}% · x${r.mult.toFixed(2)}).`,
            `🎲 Salió el **${r.roll}**.`,
          ],
          bet: r.bet, paid: r.paid, cash: r.cash,
        }),
      ],
    });
    await logCasino(i.user.tag, 'Dados', r.bet, r.paid);
  },
};

// ═════ Ruleta ═════
export const ruleta: Command = {
  data: newCommand('ruleta', 'Ruleta europea (0‑36): color, paridad, docenas, columnas o número exacto.')
    .addStringOption(betOption)
    .addStringOption((o) =>
      o.setName('tipo').setDescription('A qué apuestas').setRequired(true).addChoices(...L.ROULETTE_BETS.map((b) => ({ name: L.ROULETTE_LABEL[b], value: b }))),
    )
    .addIntegerOption((o) => o.setName('numero').setDescription('Solo si apuestas a número exacto (0‑36)').setMinValue(0).setMaxValue(36)),
  async execute(i) {
    await i.deferReply();
    const type = i.options.getString('tipo', true) as L.RouletteBet;
    const pick = i.options.getInteger('numero') ?? undefined;
    const r = await playRoulette(i.user.id, i.options.getString('apuesta', true), type, pick);

    await i.editReply({ embeds: [spinningEmbed('🎡 Ruleta', 'La bola empieza a girar…')] });
    for (let f = 0; f < 2; f++) {
      await sleep(900);
      const n = L.spinRoulette();
      await i.editReply({ embeds: [spinningEmbed('🎡 Ruleta', `La bola rebota… ${L.rouletteColor(n)} **${n}**`)] });
    }
    await sleep(900);
    await i.editReply({
      embeds: [
        outcomeEmbed({
          title: r.win ? '🎡 ¡Ganaste!' : '🎡 Perdiste',
          win: r.win,
          lines: [
            `Apostaste a **${L.ROULETTE_LABEL[type]}${type === 'numero' ? ` · ${pick}` : ''}**.`,
            `La bola cayó en ${L.rouletteColor(r.number)} **${r.number}**.`,
          ],
          bet: r.bet, paid: r.paid, cash: r.cash,
        }),
      ],
    });
    await logCasino(i.user.tag, 'Ruleta', r.bet, r.paid);
  },
};

// ═════ Tragaperras ═════
export const tragaperras: Command = {
  data: newCommand('tragaperras', 'Tragaperras de 3 rodillos: tres iguales pagan hasta x500.').addStringOption(betOption),
  async execute(i) {
    await i.deferReply();
    const r = await playSlots(i.user.id, i.options.getString('apuesta', true));
    const [a, b, c] = r.spin.reels as [string, string, string];
    const frame = (t: string) => spinningEmbed('🎰 Tragaperras', `**[ ${t} ]**`);
    await i.editReply({ embeds: [frame('🔄 🔄 🔄')] });
    await sleep(800);
    await i.editReply({ embeds: [frame(`${a} 🔄 🔄`)] });
    await sleep(800);
    await i.editReply({ embeds: [frame(`${a} ${b} 🔄`)] });
    await sleep(800);
    await i.editReply({
      embeds: [
        outcomeEmbed({
          title: r.spin.mult >= 5 ? '🎰 ¡PREMIAZO!' : r.win ? '🎰 ¡Ganaste!' : '🎰 Sin suerte',
          win: r.win,
          lines: [`**[ ${a} ${b} ${c} ]**`, `${r.spin.label}${r.spin.mult > 0 ? ` → **x${r.spin.mult}**` : ''}`],
          bet: r.bet, paid: r.paid, cash: r.cash,
        }),
      ],
    });
    await logCasino(i.user.tag, 'Tragaperras', r.bet, r.paid);
  },
};

// ═════ Buscaminas ═════
export const buscaminas: Command = {
  data: newCommand('buscaminas', 'Abre casillas seguras y retírate a tiempo: más minas = más multiplicador.')
    .addStringOption(betOption)
    .addIntegerOption((o) =>
      o.setName('minas').setDescription(`Número de minas (${CASINO.mines.minMines}‑${CASINO.mines.maxMines}, por defecto ${CASINO.mines.defaultMines})`).setMinValue(CASINO.mines.minMines).setMaxValue(CASINO.mines.maxMines),
    ),
  async execute(i) {
    await i.deferReply();
    const r = await startMines(i.user.id, i.options.getString('apuesta', true), i.options.getInteger('minas') ?? CASINO.mines.defaultMines);
    await i.editReply(minesView(r));
  },
};

// ═════ Blackjack ═════
export const blackjack: Command = {
  data: newCommand('blackjack', 'Blackjack contra el crupier: pedir, plantarse o doblar. Blackjack paga 3:2.').addStringOption(betOption),
  async execute(i) {
    await i.deferReply();
    const r = await startBlackjack(i.user.id, i.options.getString('apuesta', true));
    await i.editReply(blackjackView(r));
    if (r.ended) await logCasino(i.user.tag, 'Blackjack', r.game.bet, r.paid);
  },
};

// ═════ Hi-Lo ═════
export const hilo: Command = {
  data: newCommand('hilo', 'Adivina si la siguiente carta es mayor o menor y encadena aciertos.').addStringOption(betOption),
  async execute(i) {
    await i.deferReply();
    const r = await startHilo(i.user.id, i.options.getString('apuesta', true));
    await i.editReply(hiloView(r));
  },
};

// ═════ Crash ═════
export const crash: Command = {
  data: newCommand('crash', 'Un cohete sube y sube… ¡retírate antes de que explote!').addStringOption(betOption),
  async execute(i) {
    await i.deferReply();
    const r = await startCrash(i.user.id, i.options.getString('apuesta', true));
    await i.editReply(crashView(r.game, r.state, 1, r.cash));
    if (r.ended) return void (await logCasino(i.user.tag, 'Crash', r.game.bet, r.paid));

    // El multiplicador depende solo del tiempo; el bucle únicamente refresca el mensaje.
    // Los errores aquí no deben borrar la partida, así que se capturan.
    try {
      const crashMs = (Math.log(r.state.crashPoint) / CASINO.crash.growth) * 1000;
      for (;;) {
        const elapsed = Date.now() - r.state.startedAt;
        await sleep(Math.min(CASINO.crash.tickMs, Math.max(150, crashMs - elapsed + 60)));
        const g = await getGame(r.game.id);
        if (!g || g.status !== 'ACTIVE') return; // ya se retiró
        const m = L.crashMultiplierAt(Date.now() - r.state.startedAt);
        if (m >= r.state.crashPoint) {
          const bust = await bustCrash(i.user.id, g.id);
          if (bust) {
            await i.editReply(crashView(bust.game, r.state, r.state.crashPoint, bust.cash));
            await logCasino(i.user.tag, 'Crash', bust.game.bet, 0n);
          }
          return;
        }
        await i.editReply(crashView(g, r.state, m, r.cash));
      }
    } catch (error) {
      logger.warn('El bucle de crash terminó con error (la partida se liquidará sola)', error);
    }
  },
};


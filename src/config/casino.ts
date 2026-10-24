/**
 * AJUSTES DEL CASINO
 * Todos los juegos usan aleatoriedad criptográfica (crypto.randomInt) y el
 * resultado se decide en el SERVIDOR antes de mostrar nada. Cada juego tiene
 * ventaja de la casa > 0: el casino es un sumidero de dinero de la economía.
 *
 * Límites de apuesta y tope de premio: /economia configuración
 */
export const CASINO = {
  /** Retorno al jugador (RTP) en juegos con multiplicador: 97 % → 3 % de ventaja de la casa. */
  rtp: 0.97,

  coinflip: { multiplier: 1.95 }, // 50 % × 1,95 = RTP 97,5 %

  dice: { minTarget: 5, maxTarget: 95 },

  mines: { rows: 4, cols: 5, minMines: 1, maxMines: 10, defaultMines: 3 },

  crash: {
    /** m(t) = e^(growth·t). 0,08 → x2 a los ~9 s, x10 a los ~29 s. */
    growth: 0.08,
    maxPoint: 100,
    tickMs: 2_000,
    /** Una partida de crash abandonada se da por perdida pasado este tiempo. */
    staleMs: 120_000,
  },

  slots: {
    symbols: [
      { emoji: '🍒', weight: 30, three: 5 },
      { emoji: '🍋', weight: 24, three: 8 },
      { emoji: '🍊', weight: 20, three: 12 },
      { emoji: '🍇', weight: 14, three: 20 },
      { emoji: '🔔', weight: 8, three: 50 },
      { emoji: '💎', weight: 3, three: 150 },
      { emoji: '7️⃣', weight: 1, three: 500 },
    ],
    twoCherries: 1.8,
    oneCherry: 0.4,
  },

  /** Partidas con estado sin tocar durante este tiempo se liquidan solas. */
  staleMinutes: 10,
  /** Cada cuánto corre el liquidador de partidas abandonadas. */
  settleIntervalMs: 120_000,
} as const;

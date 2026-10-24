/**
 * ─────────────────────────────────────────────────────────────
 *  AJUSTES DE LA ECONOMÍA
 *  Todo lo que afecta al equilibrio está aquí: recompensas,
 *  cooldowns, costes y límites. Los porcentajes de impuestos y el
 *  multiplicador global se pueden cambiar en caliente con
 *  `/economia configuración` (se guardan en la base de datos).
 * ─────────────────────────────────────────────────────────────
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

export const CURRENCY = '$';

/** Tope absoluto de efectivo o banco por usuario (cabe de sobra en int8). */
export const MAX_BALANCE = 1_000_000_000_000_000n;

/** Dinero con el que empieza cada usuario nuevo. */
export const STARTING_CASH = 500n;

/** Trabajo asignado por defecto. */
export const DEFAULT_JOB_ID = 'desempleado';

export const COOLDOWNS = {
  daily: 24 * HOUR,
  work: 30 * MIN,
  fish: 10 * MIN,
  mine: 10 * MIN,
  crime: 40 * MIN,
  rob: 30 * MIN,
  beg: 5 * MIN,
  /** Pausa mínima entre apuestas del casino. */
  gamble: 3_000,
  /** Protección que recibe una víctima tras ser robada con éxito. */
  robProtect: 45 * MIN,
} as const;

export type CooldownKey = keyof typeof COOLDOWNS;

export const LEVELS = {
  maxLevel: 100,
  /** XP necesaria para pasar de `level` a `level + 1`. */
  xpForNext: (level: number) => Math.floor(50 + 25 * level ** 1.5),
  /** Bonus de pago en /work por nivel (0,5 % por nivel, máx. +50 %). */
  workBonusPerLevel: 0.005,
  workBonusMax: 0.5,
};

/** Multiplicador total máximo (nivel × casas × vehículo × boosts × eventos). */
export const MAX_TOTAL_MULTIPLIER = 4;

// ── Banco ────────────────────────────────────────────────────
export const BANK = {
  /** Límite bancario según nivel (se usa el tramo más alto alcanzado). */
  limits: [
    { level: 1, limit: 10_000n },
    { level: 5, limit: 30_000n },
    { level: 10, limit: 100_000n },
    { level: 15, limit: 250_000n },
    { level: 25, limit: 1_000_000n },
    { level: 40, limit: 5_000_000n },
    { level: 60, limit: 25_000_000n },
    { level: 100, limit: 100_000_000n },
  ],
  /** Interés diario (0,4 %) con un tope diario para no inflar la economía. */
  dailyInterestRate: 0.004,
  maxDailyInterest: 2_500n,
  /** Días de interés acumulables si el usuario no entra. */
  maxInterestDays: 7,
  historyPageSize: 8,
};

// ── Inventario ───────────────────────────────────────────────
export const INVENTORY = {
  baseCapacity: 100,
  pageSize: 8,
  maxBuyQuantity: 100,
};

// ── Recompensas por actividad ────────────────────────────────
export const DAILY = {
  base: 500,
  perLevel: 60,
  streakBonusPerDay: 0.05,
  streakMaxDays: 7,
  xp: 30,
  /** Si pasan más de estas horas desde el último /daily se pierde la racha. */
  streakResetHours: 48,
};

export const BEG = {
  min: 5,
  max: 60,
  perLevel: 0.5,
  nothingChance: 0.2,
  xp: 2,
};

export const CRIME = {
  minLevel: 3,
  successChance: 0.4,
  rewardMin: 400,
  rewardMax: 1400,
  rewardPerLevel: 0.03,
  rewardLevelMax: 2,
  /** Multa: porcentaje del efectivo (mínimo y máximo). */
  finePct: 0.2,
  fineMin: 300n,
  fineMax: 50_000n,
  xpWin: 25,
  xpFail: 8,
};

export const ROB = {
  minLevel: 3,
  successChance: 0.4,
  /** El ladrón debe tener al menos esto en efectivo (fianza). */
  minRobberCash: 300n,
  /** La víctima debe tener al menos esto en efectivo para poder ser robada. */
  minVictimCash: 500n,
  stealPctMin: 0.1,
  stealPctMax: 0.25,
  stealCapBase: 1_000n,
  stealCapPerLevel: 400n,
  /** Si fallas pagas este % de tu efectivo a la víctima. */
  failFinePct: 0.15,
  failFineMin: 100n,
  xpWin: 20,
  xpFail: 5,
};

export const GATHER = {
  fish: { costBase: 20, costPerLevel: 1, xpMin: 12, xpMax: 22, cooldown: 'fish' as CooldownKey },
  mine: { costBase: 25, costPerLevel: 1, xpMin: 14, xpMax: 24, cooldown: 'mine' as CooldownKey },
};

export const TRANSFER = {
  minLevel: 2,
  minAmount: 10n,
};

export const BUSINESS = {
  /** Probabilidad de avería por cobro (genera un gasto de reparación). */
  breakdownChance: 0.06,
  /** La reparación cuesta N horas de mantenimiento. */
  breakdownUpkeepHours: 6,
};

export const RANKING = { pageSize: 10 };

/** Valores por defecto de la fila `Config` de la base de datos. */
export const CONFIG_DEFAULTS = {
  incomeTaxPct: 5,
  transferTaxPct: 2,
  purchaseTaxPct: 5,
  sellFeePct: 3,
  businessTaxPct: 10,
  rewardMultiplier: 1,
  randomEventChance: 12,
  logMinAmount: 1000n,
  gamblingEnabled: true,
  gamblingMinBet: 10n,
  gamblingMaxBet: 250_000n,
  gamblingMaxPayout: 5_000_000n,
};

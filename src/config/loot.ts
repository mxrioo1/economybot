import type { Rarity } from '@prisma/client';

export interface LootEntry {
  id: string; // id del Item en la base de datos
  name: string;
  emoji: string;
  rarity: Rarity;
  weight: number;
  value: bigint; // valor de venta
  qty: [number, number];
}

/** Botín de /pescar. El valor esperado por lanzamiento ronda los $70. */
export const FISH_LOOT: LootEntry[] = [
  { id: 'bota-vieja', name: 'Bota vieja', emoji: '👢', rarity: 'COMUN', weight: 20, value: 2n, qty: [1, 1] },
  { id: 'sardina', name: 'Sardina', emoji: '🐟', rarity: 'COMUN', weight: 32, value: 14n, qty: [1, 2] },
  { id: 'trucha', name: 'Trucha', emoji: '🐟', rarity: 'COMUN', weight: 22, value: 30n, qty: [1, 1] },
  { id: 'salmon', name: 'Salmón', emoji: '🍣', rarity: 'POCO_COMUN', weight: 12, value: 60n, qty: [1, 1] },
  { id: 'atun', name: 'Atún', emoji: '🐠', rarity: 'POCO_COMUN', weight: 7, value: 120n, qty: [1, 1] },
  { id: 'pez-espada', name: 'Pez espada', emoji: '🗡️', rarity: 'RARO', weight: 4.2, value: 270n, qty: [1, 1] },
  { id: 'cofre-pirata', name: 'Cofre pirata', emoji: '🧰', rarity: 'EPICO', weight: 1.4, value: 1000n, qty: [1, 1] },
  { id: 'perla-negra', name: 'Perla negra', emoji: '🦪', rarity: 'LEGENDARIO', weight: 0.35, value: 3400n, qty: [1, 1] },
  { id: 'pez-dorado', name: 'Pez dorado', emoji: '✨', rarity: 'LEGENDARIO', weight: 0.05, value: 10000n, qty: [1, 1] },
];

/** Botín de /minar. */
export const MINE_LOOT: LootEntry[] = [
  { id: 'piedra', name: 'Piedra', emoji: '🪨', rarity: 'COMUN', weight: 30, value: 4n, qty: [1, 3] },
  { id: 'carbon', name: 'Carbón', emoji: '⚫', rarity: 'COMUN', weight: 25, value: 18n, qty: [1, 3] },
  { id: 'cobre', name: 'Cobre', emoji: '🟠', rarity: 'COMUN', weight: 18, value: 33n, qty: [1, 2] },
  { id: 'hierro', name: 'Hierro', emoji: '⛓️', rarity: 'POCO_COMUN', weight: 12, value: 42n, qty: [1, 2] },
  { id: 'plata', name: 'Plata', emoji: '🥈', rarity: 'POCO_COMUN', weight: 7, value: 90n, qty: [1, 1] },
  { id: 'oro', name: 'Oro', emoji: '🥇', rarity: 'RARO', weight: 4.5, value: 180n, qty: [1, 1] },
  { id: 'rubi', name: 'Rubí', emoji: '♦️', rarity: 'EPICO', weight: 2.5, value: 525n, qty: [1, 1] },
  { id: 'esmeralda', name: 'Esmeralda', emoji: '💚', rarity: 'EPICO', weight: 0.8, value: 1350n, qty: [1, 1] },
  { id: 'diamante', name: 'Diamante', emoji: '💎', rarity: 'LEGENDARIO', weight: 0.2, value: 4200n, qty: [1, 1] },
];

export const RARITY_ORDER: Rarity[] = ['COMUN', 'POCO_COMUN', 'RARO', 'EPICO', 'LEGENDARIO'];

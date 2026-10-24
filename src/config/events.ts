/**
 * Eventos aleatorios que pueden saltar tras /work, /pescar y /minar.
 * La probabilidad global se configura con `/economia configuración`
 * (campo "prob-evento"). Aquí se ajusta el peso relativo de cada uno.
 */
export type RandomEventEffect =
  | { type: 'BONUS_PCT'; min: number; max: number } // +% sobre lo ganado
  | { type: 'FLAT'; min: number; max: number } // dinero extra
  | { type: 'FINE'; minPct: number; maxPct: number; floor: number } // multa (% del efectivo)
  | { type: 'ROBBED'; minPct: number; maxPct: number } // te roban (lo evita el escudo)
  | { type: 'XP'; min: number; max: number }; // XP extra

export interface RandomEventDef {
  id: string;
  emoji: string;
  name: string;
  text: string;
  weight: number;
  effect: RandomEventEffect;
}

export const RANDOM_EVENTS: RandomEventDef[] = [
  {
    id: 'bono_trabajo',
    emoji: '🎉',
    name: '¡Bono de trabajo!',
    text: 'Tu esfuerzo no pasó desapercibido y recibes un extra.',
    weight: 30,
    effect: { type: 'BONUS_PCT', min: 20, max: 60 },
  },
  {
    id: 'lluvia_dinero',
    emoji: '💸',
    name: '¡Lluvia de dinero!',
    text: 'Encuentras billetes tirados en la calle.',
    weight: 20,
    effect: { type: 'FLAT', min: 80, max: 400 },
  },
  {
    id: 'multa',
    emoji: '🚨',
    name: 'Multa inesperada',
    text: 'Te ponen una multa de tráfico camino a casa.',
    weight: 25,
    effect: { type: 'FINE', minPct: 3, maxPct: 8, floor: 50 },
  },
  {
    id: 'robo',
    emoji: '🦹',
    name: '¡Te han robado!',
    text: 'Un carterista te quita parte del efectivo.',
    weight: 15,
    effect: { type: 'ROBBED', minPct: 5, maxPct: 12 },
  },
  {
    id: 'jackpot',
    emoji: '🎰',
    name: '¡JACKPOT!',
    text: 'La suerte te sonríe: ¡un premio gordo!',
    weight: 1.5,
    effect: { type: 'FLAT', min: 3000, max: 10000 },
  },
  {
    id: 'evento_especial',
    emoji: '🌟',
    name: 'Evento especial',
    text: 'Un mentor te enseña un truco valioso.',
    weight: 8,
    effect: { type: 'XP', min: 40, max: 100 },
  },
];

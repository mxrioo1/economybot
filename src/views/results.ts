import type { EventOutcome } from '../services/eventService';
import { formatMoney } from '../utils/money';

export function eventLine(e: EventOutcome | null): string | null {
  if (!e) return null;
  const delta = e.cashDelta === 0n ? '' : e.cashDelta > 0n ? ` **+${formatMoney(e.cashDelta)}**` : ` **-${formatMoney(-e.cashDelta)}**`;
  const xp = e.xp > 0 ? ` **+${e.xp} XP**` : '';
  return `${e.def.emoji} **${e.def.name}** — ${e.text}${delta}${xp}`;
}

export const notesLine = (notes: string[]): string | null => (notes.length ? notes.join('\n') : null);

export type ItemMeta =
  | { kind: 'tool'; tool: 'fishing' | 'mining'; luck: number }
  | { kind: 'vehicle'; workBonusPct: number }
  | { kind: 'boost'; boost: 'MONEY' | 'XP' | 'SHIELD'; multiplier: number; minutes: number }
  | { kind: 'cosmetic'; badge: string }
  | { kind: 'loot' };

export function parseMeta(meta: unknown): ItemMeta | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  switch (m.kind) {
    case 'tool':
      if ((m.tool === 'fishing' || m.tool === 'mining') && typeof m.luck === 'number') return m as unknown as ItemMeta;
      return null;
    case 'vehicle':
      return typeof m.workBonusPct === 'number' ? (m as unknown as ItemMeta) : null;
    case 'boost':
      return (m.boost === 'MONEY' || m.boost === 'XP' || m.boost === 'SHIELD') &&
        typeof m.multiplier === 'number' &&
        typeof m.minutes === 'number'
        ? (m as unknown as ItemMeta)
        : null;
    case 'cosmetic':
      return typeof m.badge === 'string' ? (m as unknown as ItemMeta) : null;
    case 'loot':
      return { kind: 'loot' };
    default:
      return null;
  }
}

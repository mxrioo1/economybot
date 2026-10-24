/** 3_725_000 → "1h 2m" (máximo dos unidades). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && parts.length < 2 && !d) parts.push(`${s}s`);
  return parts.slice(0, 2).join(' ') || '0s';
}

/** Marca de tiempo de Discord: <t:123:R> */
export function discordTime(date: Date | number, style: 'R' | 'f' | 'F' | 'd' | 't' = 'R'): string {
  const ms = typeof date === 'number' ? date : date.getTime();
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

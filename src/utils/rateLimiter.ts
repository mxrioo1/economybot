/**
 * Anti-spam en memoria: máximo `MAX_HITS` interacciones por ventana.
 * Si se supera, el usuario queda bloqueado `PENALTY_MS`.
 */
const WINDOW_MS = 10_000;
const MAX_HITS = 8;
const PENALTY_MS = 15_000;

const hits = new Map<string, number[]>();
const blockedUntil = new Map<string, number>();

/** Devuelve 0 si puede continuar, o los ms que debe esperar. */
export function checkRateLimit(userId: string): number {
  const now = Date.now();
  const until = blockedUntil.get(userId) ?? 0;
  if (until > now) return until - now;

  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);

  if (recent.length > MAX_HITS) {
    blockedUntil.set(userId, now + PENALTY_MS);
    hits.delete(userId);
    return PENALTY_MS;
  }
  return 0;
}

setInterval(() => {
  const now = Date.now();
  for (const [id, until] of blockedUntil) if (until <= now) blockedUntil.delete(id);
  for (const [id, arr] of hits) if (!arr.some((t) => now - t < WINDOW_MS)) hits.delete(id);
}, 60_000).unref();

import type { Tx } from '../database/prisma';
import { LEVELS } from '../config/economy';

export interface XpResult {
  gained: number;
  level: number;
  xp: number;
  levelsUp: number;
}

/** Suma XP y sube de nivel tantas veces como corresponda. Requiere fila bloqueada. */
export async function grantXp(tx: Tx, userId: string, amount: number): Promise<XpResult> {
  const gained = Math.max(0, Math.floor(amount));
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true, xp: true } });
  let { level, xp } = user;
  let levelsUp = 0;

  xp += gained;
  while (level < LEVELS.maxLevel && xp >= LEVELS.xpForNext(level)) {
    xp -= LEVELS.xpForNext(level);
    level++;
    levelsUp++;
  }
  if (level >= LEVELS.maxLevel) xp = 0;

  if (gained > 0) await tx.user.update({ where: { id: userId }, data: { level, xp } });
  return { gained, level, xp, levelsUp };
}

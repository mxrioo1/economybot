import { prisma, type Tx } from '../database/prisma';
import { COOLDOWNS, type CooldownKey } from '../config/economy';
import { CooldownError } from '../utils/errors';

/**
 * Reserva el cooldown de forma atómica. Debe llamarse DENTRO de la transacción
 * de la acción y con la fila del usuario ya bloqueada (lockUsers): así dos
 * comandos simultáneos no pueden saltarse la espera, y si la acción falla
 * después, el rollback devuelve también el cooldown.
 */
export async function acquire(tx: Tx, userId: string, key: CooldownKey, label: string, ms: number = COOLDOWNS[key]) {
  const now = Date.now();
  const row = await tx.cooldown.findUnique({ where: { userId_key: { userId, key } } });
  if (row && row.expiresAt.getTime() > now) throw new CooldownError(row.expiresAt.getTime() - now, label);
  const expiresAt = new Date(now + ms);
  await tx.cooldown.upsert({
    where: { userId_key: { userId, key } },
    update: { expiresAt },
    create: { userId, key, expiresAt },
  });
}

/** Fuerza un cooldown (p. ej. protección anti-robo de la víctima). */
export async function setCooldown(tx: Tx, userId: string, key: CooldownKey, ms: number) {
  const expiresAt = new Date(Date.now() + ms);
  await tx.cooldown.upsert({
    where: { userId_key: { userId, key } },
    update: { expiresAt },
    create: { userId, key, expiresAt },
  });
}

/** Milisegundos restantes (0 si está libre). */
export async function remaining(client: Tx, userId: string, key: CooldownKey): Promise<number> {
  const row = await client.cooldown.findUnique({ where: { userId_key: { userId, key } } });
  if (!row) return 0;
  return Math.max(0, row.expiresAt.getTime() - Date.now());
}

export async function purgeExpired(): Promise<void> {
  const now = new Date();
  await prisma.cooldown.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.activeBoost.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.serverEvent.deleteMany({ where: { endsAt: { lte: new Date(Date.now() - 7 * 86_400_000) } } });
}

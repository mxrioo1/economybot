import type { User } from '@prisma/client';
import { prisma } from '../database/prisma';
import { lockUsers, runTx } from '../database/transaction';

/** Devuelve el usuario, creándolo (con bono de bienvenida) si es nuevo. */
export async function getUser(id: string): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (existing) return existing;
  await runTx((tx) => lockUsers(tx, [id]));
  return prisma.user.findUniqueOrThrow({ where: { id } });
}

import { Prisma, prisma, type Tx } from './prisma';
import { STARTING_CASH } from '../config/economy';
import { sleep } from '../utils/time';

function isRetryable(error: unknown): boolean {
  // P2034: conflicto de escritura / deadlock detectado por PostgreSQL.
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

/**
 * Ejecuta `fn` dentro de una transacción interactiva con reintentos ante
 * deadlocks. TODA operación que mueva dinero debe pasar por aquí.
 */
export async function runTx<T>(fn: (tx: Tx) => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { maxWait: 5_000, timeout: 20_000 });
    } catch (error) {
      if (attempt < retries && isRetryable(error)) {
        await sleep(40 * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }
}

/**
 * Crea (si no existen) y BLOQUEA las filas de usuario con `SELECT … FOR UPDATE`
 * en orden estable. Mientras dure la transacción nadie más puede modificar
 * esos saldos: es la base contra duplicación y condiciones de carrera.
 */
export async function lockUsers(tx: Tx, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return;

  const created = await tx.user.createManyAndReturn({
    data: unique.map((id) => ({ id, cash: STARTING_CASH })),
    skipDuplicates: true,
    select: { id: true },
  });
  if (created.length > 0) {
    await tx.transaction.createMany({
      data: created.map((u) => ({
        userId: u.id,
        account: 'CASH' as const,
        type: 'WELCOME' as const,
        amount: STARTING_CASH,
        balanceAfter: STARTING_CASH,
        note: 'Bono de bienvenida',
      })),
    });
  }

  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(unique)}) ORDER BY "id" FOR UPDATE`;
}

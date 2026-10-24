import { Prisma, prisma } from '../database/prisma';
import { RANKING } from '../config/economy';

export type RankingType = 'dinero' | 'nivel' | 'trabajo' | 'patrimonio';
export interface RankingRow {
  userId: string;
  value: bigint;
  extra?: string;
}

/** Patrimonio = efectivo + banco + valor de venta del inventario + precio de casas y negocios. */
const WORTH_SQL = Prisma.sql`(
  u."cash" + u."bank"
  + COALESCE((SELECT SUM(i."quantity"::bigint * it."sellValue") FROM "Inventory" i JOIN "Item" it ON it."id" = i."itemId" WHERE i."userId" = u."id"), 0)
  + COALESCE((SELECT SUM(p."price") FROM "UserProperty" up JOIN "Property" p ON p."id" = up."propertyId" WHERE up."userId" = u."id"), 0)
  + COALESCE((SELECT SUM(b."price") FROM "UserBusiness" ub JOIN "Business" b ON b."id" = ub."businessId" WHERE ub."userId" = u."id"), 0)
)::bigint`;

export async function getRanking(type: RankingType, page: number) {
  const size = RANKING.pageSize;
  const offset = page * size;
  const total = await prisma.user.count();

  let rows: RankingRow[];
  if (type === 'nivel') {
    const users = await prisma.user.findMany({ orderBy: [{ level: 'desc' }, { xp: 'desc' }, { id: 'asc' }], skip: offset, take: size });
    rows = users.map((u) => ({ userId: u.id, value: BigInt(u.level), extra: `${u.xp} XP` }));
  } else if (type === 'trabajo') {
    const users = await prisma.user.findMany({ orderBy: [{ workCount: 'desc' }, { id: 'asc' }], skip: offset, take: size });
    rows = users.map((u) => ({ userId: u.id, value: BigInt(u.workCount) }));
  } else if (type === 'dinero') {
    const res = await prisma.$queryRaw<{ id: string; worth: bigint }[]>`
      SELECT u."id" AS id, (u."cash" + u."bank")::bigint AS worth
      FROM "User" u ORDER BY worth DESC, u."id" ASC LIMIT ${size} OFFSET ${offset}`;
    rows = res.map((r) => ({ userId: r.id, value: r.worth }));
  } else {
    const res = await prisma.$queryRaw<{ id: string; worth: bigint }[]>`
      SELECT u."id" AS id, ${WORTH_SQL} AS worth
      FROM "User" u ORDER BY worth DESC, u."id" ASC LIMIT ${size} OFFSET ${offset}`;
    rows = res.map((r) => ({ userId: r.id, value: r.worth }));
  }
  return { rows, total, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function getNetWorth(userId: string): Promise<bigint> {
  const res = await prisma.$queryRaw<{ worth: bigint }[]>`
    SELECT ${WORTH_SQL} AS worth FROM "User" u WHERE u."id" = ${userId}`;
  return res[0]?.worth ?? 0n;
}

/** Posición del usuario en un ranking (1 = primero). */
export async function getRank(userId: string): Promise<number | null> {
  const res = await prisma.$queryRaw<{ pos: bigint }[]>`
    SELECT COUNT(*)::bigint + 1 AS pos FROM "User" o, "User" me
    WHERE me."id" = ${userId} AND (o."cash" + o."bank") > (me."cash" + me."bank")`;
  return res[0] ? Number(res[0].pos) : null;
}

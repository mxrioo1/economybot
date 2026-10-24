import { prisma } from '../database/prisma';
import { lockUsers, runTx } from '../database/transaction';
import { UserError } from '../utils/errors';

export const listJobs = () => prisma.job.findMany({ orderBy: [{ minLevel: 'asc' }, { minPay: 'asc' }] });

export async function changeJob(userId: string, jobId: string) {
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const [user, job] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId } }),
      tx.job.findUnique({ where: { id: jobId } }),
    ]);
    if (!job) throw new UserError('❌ Ese trabajo no existe.');
    if (user.level < job.minLevel) {
      throw new UserError(`🔒 Necesitas **nivel ${job.minLevel}** para ser ${job.emoji} ${job.name}.`);
    }
    if (user.jobId === job.id) throw new UserError(`Ya trabajas como ${job.emoji} **${job.name}**.`);
    await tx.user.update({ where: { id: userId }, data: { jobId: job.id } });
    return job;
  });
}

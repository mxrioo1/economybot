import { prisma } from '../database/prisma';
import { seedDatabase } from '../database/seed';

seedDatabase()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

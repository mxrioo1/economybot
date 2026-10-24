import type { Config, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';
import { CONFIG_DEFAULTS } from '../config/economy';
import { env } from '../config/env';

let cache: { at: number; value: Config } | null = null;
const TTL_MS = 15_000;

export async function getConfig(): Promise<Config> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await prisma.config.upsert({
    where: { id: 'global' },
    update: {},
    create: { id: 'global', ...CONFIG_DEFAULTS },
  });
  cache = { at: Date.now(), value };
  return value;
}

export async function updateConfig(data: Prisma.ConfigUpdateInput): Promise<Config> {
  await getConfig();
  const value = await prisma.config.update({ where: { id: 'global' }, data });
  cache = { at: Date.now(), value };
  return value;
}

export async function getLogChannelId(): Promise<string | null> {
  const cfg = await getConfig();
  return cfg.logChannelId || env.LOG_CHANNEL_ID || null;
}

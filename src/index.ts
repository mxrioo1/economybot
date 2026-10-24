import { env } from './config/env'; // valida el .env antes que nada
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { prisma } from './database/prisma';
import { ensureSeed } from './database/seed';
import { onInteractionCreate } from './events/interactionCreate';
import { onReady } from './events/ready';
import { getConfig } from './services/configService';
import { logger } from './utils/logger';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => onReady(c));
client.on(Events.InteractionCreate, (i) => void onInteractionCreate(i));
client.on(Events.Error, (e) => logger.error('Error del cliente de Discord', e));

async function shutdown(signal: string): Promise<void> {
  logger.info(`Recibido ${signal}, cerrando…`);
  client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('Promesa rechazada sin controlar', reason));
process.on('uncaughtException', (error) => logger.error('Excepción sin controlar', error));

async function main(): Promise<void> {
  await prisma.$connect();
  logger.info('🗄️  Conectado a PostgreSQL.');
  await ensureSeed();
  await getConfig();
  await client.login(env.DISCORD_TOKEN);
}

main().catch((error) => {
  logger.error('No se pudo iniciar el bot', error);
  process.exit(1);
});

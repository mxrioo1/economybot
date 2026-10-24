import { ActivityType, type Client } from 'discord.js';
import { CASINO } from '../config/casino';
import { settleStaleGames } from '../services/casinoService';
import { purgeExpired } from '../services/cooldownService';
import { initLogService } from '../services/logService';
import { logger } from '../utils/logger';

export function onReady(client: Client<true>): void {
  initLogService(client);
  client.user.setPresence({ activities: [{ name: 'la economía 💰 | /ayuda', type: ActivityType.Watching }], status: 'online' });
  logger.info(`✅ Conectado como ${client.user.tag} en ${client.guilds.cache.size} servidor(es).`);

  // Limpieza horaria de cooldowns, boosts y eventos caducados.
  // Liquida partidas de casino abandonadas (nadie pierde dinero por un mensaje colgado).
  const settle = () => void settleStaleGames().then((n) => n && logger.info(`🎰 ${n} partida(s) abandonada(s) liquidada(s).`)).catch((e) => logger.warn('Fallo al liquidar partidas', e));
  setTimeout(settle, 5_000).unref();
  setInterval(settle, CASINO.settleIntervalMs).unref();

  setInterval(() => void purgeExpired().catch((e) => logger.warn('Fallo al limpiar datos caducados', e)), 3_600_000).unref();
}

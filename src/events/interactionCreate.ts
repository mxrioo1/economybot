import { MessageFlags, type Interaction, type RepliableInteraction } from 'discord.js';
import { commandMap } from '../commands';
import { componentMap } from '../components';
import { logEvent } from '../services/logService';
import { errorEmbed } from '../utils/embeds';
import { UserError } from '../utils/errors';
import { logger } from '../utils/logger';
import { checkRateLimit } from '../utils/rateLimiter';
import { replyError } from '../utils/respond';
import { formatDuration } from '../utils/time';

async function fail(i: RepliableInteraction, error: unknown, source: string): Promise<void> {
  if (error instanceof UserError) return replyError(i, error.message);

  logger.error(`Error en ${source}`, error);
  void logEvent({
    category: 'ERROR',
    title: `Error en ${source}`,
    description: `Usuario: <@${i.user.id}>\n\`\`\`${String((error as Error)?.message ?? error).slice(0, 900)}\`\`\``,
    always: true,
  });
  return replyError(i, 'Ocurrió un error inesperado. Inténtalo de nuevo en unos segundos.');
}

export async function onInteractionCreate(i: Interaction): Promise<void> {
  try {
    // ── Comandos slash ──
    if (i.isChatInputCommand()) {
      const wait = checkRateLimit(i.user.id);
      if (wait > 0) {
        await i.reply({ embeds: [errorEmbed(`⏳ Vas demasiado rápido. Espera **${formatDuration(wait)}**.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      const command = commandMap.get(i.commandName);
      if (!command) return;
      try {
        await command.execute(i);
      } catch (error) {
        await fail(i, error, `/${i.commandName}`);
      }
      return;
    }

    // ── Autocompletado ──
    if (i.isAutocomplete()) {
      try {
        await commandMap.get(i.commandName)?.autocomplete?.(i);
      } catch (error) {
        logger.warn(`Autocomplete falló en /${i.commandName}`, error);
        await i.respond([]).catch(() => undefined);
      }
      return;
    }

    // ── Botones, menús y modales ──
    if (i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) {
      const [prefix, owner, ...args] = i.customId.split(':');
      const handler = prefix ? componentMap.get(prefix) : undefined;
      if (!handler) return;

      // Solo el dueño del mensaje puede usar sus controles.
      if (owner !== i.user.id) {
        await i.reply({ embeds: [errorEmbed('Estos controles pertenecen a otra persona. Usa tu propio comando.')], flags: MessageFlags.Ephemeral });
        return;
      }
      const wait = checkRateLimit(i.user.id);
      if (wait > 0) {
        await i.reply({ embeds: [errorEmbed(`⏳ Vas demasiado rápido. Espera **${formatDuration(wait)}**.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      try {
        await handler.execute(i, args);
      } catch (error) {
        await fail(i, error, `componente ${prefix}`);
      }
    }
  } catch (error) {
    logger.error('Error no controlado en interactionCreate', error);
  }
}

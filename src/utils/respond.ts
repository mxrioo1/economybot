import { MessageFlags, type RepliableInteraction } from 'discord.js';
import { errorEmbed } from './embeds';

/**
 * Muestra un error solo a quien lo causó. Si la respuesta ya estaba diferida
 * (pública), la borra y envía el error como mensaje efímero.
 */
export async function replyError(i: RepliableInteraction, message: string): Promise<void> {
  const payload = { embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral } as const;
  try {
    if (i.deferred && !i.replied && i.isChatInputCommand()) {
      await i.deleteReply().catch(() => undefined);
      await i.followUp(payload);
    } else if (i.replied || i.deferred) {
      await i.followUp(payload);
    } else {
      await i.reply(payload);
    }
  } catch {
    /* la interacción ya expiró */
  }
}

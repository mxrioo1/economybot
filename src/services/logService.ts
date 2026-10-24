import type { Client } from 'discord.js';
import { baseEmbed, COLORS } from '../utils/embeds';
import { logger } from '../utils/logger';
import { getConfig, getLogChannelId } from './configService';

export type LogCategory = 'TRANSFER' | 'PURCHASE' | 'SALE' | 'MINT' | 'BURN' | 'ADMIN' | 'BUSINESS' | 'CASINO' | 'ERROR';

const STYLE: Record<LogCategory, { emoji: string; color: number; label: string }> = {
  TRANSFER: { emoji: '🔁', color: COLORS.info, label: 'Transferencia' },
  PURCHASE: { emoji: '🛒', color: COLORS.primary, label: 'Compra' },
  SALE: { emoji: '💱', color: COLORS.success, label: 'Venta' },
  MINT: { emoji: '🟢', color: COLORS.success, label: 'Dinero creado' },
  BURN: { emoji: '🔥', color: COLORS.warn, label: 'Dinero eliminado' },
  ADMIN: { emoji: '🛡️', color: COLORS.warn, label: 'Acción administrativa' },
  BUSINESS: { emoji: '🏢', color: COLORS.primary, label: 'Negocio' },
  CASINO: { emoji: '🎰', color: COLORS.money, label: 'Casino' },
  ERROR: { emoji: '🚨', color: COLORS.error, label: 'Error' },
};

let client: Client | null = null;
export const initLogService = (c: Client) => void (client = c);

interface LogOptions {
  category: LogCategory;
  title: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  /** Importe asociado: si es menor que el mínimo configurado, no se envía al canal. */
  amount?: bigint;
  /** Fuerza el envío al canal aunque el importe sea pequeño. */
  always?: boolean;
}

/** Registra en consola y, si hay canal configurado, en Discord. Nunca lanza. */
export async function logEvent(opts: LogOptions): Promise<void> {
  const style = STYLE[opts.category];
  logger.info(`[${opts.category}] ${opts.title}${opts.description ? ` — ${opts.description}` : ''}`);

  try {
    if (!client) return;
    const cfg = await getConfig();
    const important = opts.always || opts.category === 'ADMIN' || opts.category === 'ERROR';
    if (!important && opts.amount !== undefined && opts.amount < cfg.logMinAmount) return;

    const channelId = await getLogChannelId();
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel)) return;

    const embed = baseEmbed(style.color)
      .setAuthor({ name: `${style.emoji} ${style.label}` })
      .setTitle(opts.title.slice(0, 256));
    if (opts.description) embed.setDescription(opts.description.slice(0, 4000));
    if (opts.fields?.length) embed.addFields(opts.fields.slice(0, 25));
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    logger.warn('No se pudo enviar el log al canal de Discord', error);
  }
}

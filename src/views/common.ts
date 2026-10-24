import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type MessageActionRowComponentBuilder } from 'discord.js';
import type { XpResult } from '../services/levelService';

export type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;
export const newRow = (): Row => new ActionRowBuilder<MessageActionRowComponentBuilder>();

/** Fila "◀ Página x/y ▶". customId = prefijo:dueño:…extra:página */
export function pagerRow(prefix: string, owner: string, extra: string[], page: number, pages: number): Row {
  const id = (p: number) => [prefix, owner, ...extra, p].join(':');
  return newRow().addComponents(
    new ButtonBuilder().setCustomId(id(page - 1)).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`${prefix}:${owner}:noop`).setLabel(`Página ${page + 1}/${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(id(page + 1)).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
  );
}

export function xpLine(xp: XpResult): string {
  let line = `✨ +${xp.gained} XP`;
  if (xp.levelsUp > 0) line += `\n🎉 **¡Subiste al nivel ${xp.level}!**`;
  return line;
}

export const clampPage = (page: number, pages: number) => Math.min(Math.max(0, Number.isFinite(page) ? Math.floor(page) : 0), Math.max(0, pages - 1));

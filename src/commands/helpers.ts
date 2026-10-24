import { InteractionContextType, MessageFlags, SlashCommandBuilder, type User } from 'discord.js';
import { UserError } from '../utils/errors';

export const EPHEMERAL = MessageFlags.Ephemeral;

/** Crea un comando que solo funciona en servidores. */
export const newCommand = (name: string, description: string) =>
  new SlashCommandBuilder().setName(name).setDescription(description).setContexts(InteractionContextType.Guild);

export function assertHuman(user: User): void {
  if (user.bot) throw new UserError('🤖 Los bots no participan en la economía.');
}

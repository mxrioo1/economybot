import { PermissionFlagsBits, type PermissionsBitField } from 'discord.js';
import { env } from '../config/env';

interface HasAuthor {
  user: { id: string };
  memberPermissions: Readonly<PermissionsBitField> | null;
}

/** Admin de la economía = permiso "Administrador" de Discord o ID en ADMIN_IDS. */
export function isEconomyAdmin(i: HasAuthor): boolean {
  return env.ADMIN_IDS.includes(i.user.id) || i.memberPermissions?.has(PermissionFlagsBits.Administrator) === true;
}

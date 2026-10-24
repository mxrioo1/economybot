import { EmbedBuilder } from 'discord.js';

export const COLORS = {
  primary: 0x6366f1,
  success: 0x22c55e,
  error: 0xef4444,
  warn: 0xf59e0b,
  money: 0xfacc15,
  info: 0x38bdf8,
} as const;

export const EMOJI = {
  cash: '💵',
  bank: '🏦',
  level: '⭐',
  xp: '✨',
  job: '💼',
  ok: '✅',
  error: '❌',
  warn: '⚠️',
  shop: '🛒',
  bag: '🎒',
  house: '🏠',
  business: '🏢',
  trophy: '🏆',
  clock: '⏳',
  tax: '🧾',
} as const;

export function baseEmbed(color: number = COLORS.primary): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setFooter({ text: '💰 Economía' }).setTimestamp();
}

export const successEmbed = (title: string, description?: string) =>
  baseEmbed(COLORS.success).setTitle(`${EMOJI.ok} ${title}`).setDescription(description ?? null);

export const errorEmbed = (description: string) =>
  baseEmbed(COLORS.error).setDescription(description.startsWith('❌') || description.startsWith('⏳') || description.startsWith('💸') ? description : `${EMOJI.error} ${description}`);

export const infoEmbed = (title: string, description?: string) =>
  baseEmbed(COLORS.info).setTitle(title).setDescription(description ?? null);

export function progressBar(value: number, max: number, length = 10): string {
  const ratio = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max));
  const filled = Math.round(ratio * length);
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

export const RARITY_LABEL: Record<string, string> = {
  COMUN: '⚪ Común',
  POCO_COMUN: '🟢 Poco común',
  RARO: '🔵 Raro',
  EPICO: '🟣 Épico',
  LEGENDARIO: '🟡 Legendario',
};

export const CATEGORY_LABEL: Record<string, string> = {
  VEHICULOS: '🚗 Vehículos',
  CASAS: '🏠 Casas',
  HERRAMIENTAS: '🛠️ Herramientas',
  OBJETOS: '📦 Objetos',
  COSMETICOS: '🎨 Cosméticos',
  BOOSTS: '⚡ Boosts',
};

/** Recorta texto para respetar los límites de Discord. */
export const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`❌ Falta la variable de entorno obligatoria ${name}. Revisa tu archivo .env`);
    process.exit(1);
  }
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{15,25}$/.test(s));
}

export const env = {
  DISCORD_TOKEN: required('DISCORD_TOKEN'),
  CLIENT_ID: required('CLIENT_ID'),
  GUILD_ID: process.env.GUILD_ID?.trim() || '',
  DATABASE_URL: required('DATABASE_URL'),
  ADMIN_IDS: list('ADMIN_IDS'),
  LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID?.trim() || '',
} as const;

import { env } from '../config/env';
import { REST, Routes } from 'discord.js';
import { commands } from '../commands';

async function main() {
  const body = commands.map((c) => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  if (env.GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID), { body });
    console.log(`✅ ${body.length} comandos registrados en el servidor ${env.GUILD_ID} (disponibles al instante).`);
  } else {
    await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body });
    console.log(`✅ ${body.length} comandos registrados globalmente (pueden tardar hasta 1 hora en aparecer).`);
  }
}

main().catch((error) => {
  console.error('❌ Error registrando comandos:', error);
  process.exit(1);
});

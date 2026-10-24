import { baseEmbed } from '../../utils/embeds';
import type { Command } from '../../types';
import { EPHEMERAL, newCommand } from '../helpers';

export const ayuda: Command = {
  data: newCommand('ayuda', 'Lista de comandos de la economía.'),
  async execute(i) {
    const embed = baseEmbed()
      .setTitle('📖 Guía de la economía')
      .setDescription('Gana dinero, sube de nivel y construye tu imperio. Empieza con `/daily` y `/work`.')
      .addFields(
        { name: '💰 Dinero', value: '`/balance` `/daily` `/work` `/trabajo` `/pagar` `/ranking` `/cooldowns`' },
        { name: '🏦 Banco', value: '`/banco` `/depositar` `/retirar` — el banco protege tu dinero de robos y da intereses.' },
        { name: '🎣 Actividades', value: '`/pescar` `/minar` `/mendigar` `/crimen` `/robar`' },
        { name: '🛒 Tienda y objetos', value: '`/tienda` `/comprar` `/vender` `/usar` `/inventario`' },
        { name: '🎰 Casino', value: '`/casino` (reglas, stats, top) · `/coinflip` `/dados` `/ruleta` `/tragaperras` `/blackjack` `/buscaminas` `/hilo` `/crash`' },
        { name: '🏠 Propiedades y negocios', value: '`/casa` `/negocio` — más espacio, más bonus y dinero pasivo.' },
        { name: '💡 Consejos', value: 'Cantidades: `500`, `2k`, `1.5m`, `mitad`, `todo`.\nSube de nivel para desbloquear trabajos, casas, negocios y más límite bancario.' },
      );
    await i.reply({ embeds: [embed], flags: EPHEMERAL });
  },
};

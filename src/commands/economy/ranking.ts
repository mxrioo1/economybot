import { buildRankingView } from '../../views/ranking';
import type { Command } from '../../types';
import { newCommand } from '../helpers';

export const ranking: Command = {
  data: newCommand('ranking', 'Clasificaciones del servidor.')
    .addSubcommand((s) => s.setName('dinero').setDescription('Los jugadores con más dinero (efectivo + banco).'))
    .addSubcommand((s) => s.setName('nivel').setDescription('Los jugadores de mayor nivel.'))
    .addSubcommand((s) => s.setName('trabajo').setDescription('Los que más han trabajado.'))
    .addSubcommand((s) => s.setName('patrimonio').setDescription('Mayor patrimonio total (dinero + propiedades + negocios + objetos).')),
  async execute(i) {
    await i.deferReply();
    const type = i.options.getSubcommand() as 'dinero' | 'nivel' | 'trabajo' | 'patrimonio';
    await i.editReply(await buildRankingView(type, 0, i.user.id));
  },
};

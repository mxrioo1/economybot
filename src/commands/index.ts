import type { Command } from '../types';
import { economia } from './admin/economia';
import { mendigar, crimen, robar } from './activities/crime';
import { casino } from './casino/casino';
import { blackjack, buscaminas, coinflip, crash, dados, hilo, ruleta, tragaperras } from './casino/games';
import { minar, pescar } from './activities/gather';
import { ayuda } from './economy/ayuda';
import { balance } from './economy/balance';
import { banco, depositar, retirar } from './economy/bank';
import { cooldowns } from './economy/cooldowns';
import { daily } from './economy/daily';
import { pagar } from './economy/pagar';
import { ranking } from './economy/ranking';
import { trabajo } from './economy/trabajo';
import { work } from './economy/work';
import { casa, negocio } from './shop/property';
import { comprar, inventario, tienda, usar, vender } from './shop/shop';

export const commands: Command[] = [
  balance, daily, work, trabajo, pagar, ranking, cooldowns, ayuda,
  banco, depositar, retirar,
  pescar, minar, crimen, robar, mendigar,
  tienda, comprar, vender, usar, inventario,
  casa, negocio,
  casino, coinflip, dados, ruleta, tragaperras, blackjack, buscaminas, hilo, crash,
  economia,
];

export const commandMap = new Map(commands.map((c) => [c.data.name, c]));

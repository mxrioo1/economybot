import type { ComponentHandler } from '../types';
import { adminHandler } from './admin';
import { bankHandler, bankModalHandler } from './bank';
import { blackjackHandler, crashHandler, hiloHandler, minesHandler } from './casino';
import { inventoryHandler } from './inventory';
import { jobHandler } from './job';
import { rankHandler } from './rank';
import { shopHandler } from './shop';

export const componentHandlers: ComponentHandler[] = [
  adminHandler, bankHandler, bankModalHandler, inventoryHandler, jobHandler, rankHandler, shopHandler,
  minesHandler, blackjackHandler, hiloHandler, crashHandler,
];

export const componentMap = new Map(componentHandlers.map((h) => [h.prefix, h]));

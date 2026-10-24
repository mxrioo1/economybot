import type { ComponentHandler } from '../types';
import {
  blackjackAction, cashCrash, cashHilo, cashMines, hiloGuess, logCasino, pickMines, type Step,
} from '../services/casinoService';
import { blackjackView, crashView, hiloView, minesView } from '../views/casino';
import { UserError } from '../utils/errors';

async function report(userTag: string, name: string, r: Step<unknown>) {
  if (r.ended) await logCasino(userTag, name, r.game.bet, r.paid);
}

export const minesHandler: ComponentHandler = {
  prefix: 'mines',
  async execute(i, args) {
    if (!i.isButton()) return;
    const [gameId, action] = args;
    if (!gameId || !action) return;
    await i.deferUpdate();
    const r = action === 'cash' ? await cashMines(i.user.id, gameId) : await pickMines(i.user.id, gameId, Number(action));
    await i.editReply(minesView(r));
    await report(i.user.tag, 'Buscaminas', r);
  },
};

export const blackjackHandler: ComponentHandler = {
  prefix: 'bj',
  async execute(i, args) {
    if (!i.isButton()) return;
    const [gameId, action] = args;
    if (!gameId || (action !== 'hit' && action !== 'stand' && action !== 'double')) return;
    await i.deferUpdate();
    const r = await blackjackAction(i.user.id, gameId, action);
    await i.editReply(blackjackView(r));
    await report(i.user.tag, 'Blackjack', r);
  },
};

export const hiloHandler: ComponentHandler = {
  prefix: 'hilo',
  async execute(i, args) {
    if (!i.isButton()) return;
    const [gameId, action] = args;
    if (!gameId) return;
    await i.deferUpdate();
    let r;
    if (action === 'hi' || action === 'lo') r = await hiloGuess(i.user.id, gameId, action);
    else if (action === 'cash') r = await cashHilo(i.user.id, gameId);
    else throw new UserError('❌ Acción no válida.');
    await i.editReply(hiloView(r));
    await report(i.user.tag, 'Hi-Lo', r);
  },
};

export const crashHandler: ComponentHandler = {
  prefix: 'crash',
  async execute(i, args) {
    if (!i.isButton()) return;
    const [gameId] = args;
    if (!gameId) return;
    await i.deferUpdate();
    const r = await cashCrash(i.user.id, gameId);
    await i.editReply(crashView(r.game, r.state, r.mult, r.cash));
    await report(i.user.tag, 'Crash', r);
  },
};

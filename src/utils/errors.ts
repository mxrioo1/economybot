import { formatDuration } from './time';

/** Error "esperado": el mensaje se muestra tal cual al usuario. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export class CooldownError extends UserError {
  constructor(public readonly remainingMs: number, what = 'hacer eso') {
    super(`⏳ Aún no puedes ${what}. Vuelve en **${formatDuration(remainingMs)}**.`);
    this.name = 'CooldownError';
  }
}

export class InsufficientFundsError extends UserError {
  constructor(message = '💸 No tienes suficiente dinero para eso.') {
    super(message);
    this.name = 'InsufficientFundsError';
  }
}

import { lockUsers, runTx } from '../database/transaction';
import { TRANSFER } from '../config/economy';
import { UserError } from '../utils/errors';
import { formatMoney, parseAmount } from '../utils/money';
import { payWithTax } from './economyService';
import { getConfig } from './configService';

export async function payUser(fromId: string, toId: string, rawAmount: string) {
  if (fromId === toId) throw new UserError('🤦 No puedes pagarte a ti mismo.');
  const cfg = await getConfig();

  return runTx(async (tx) => {
    await lockUsers(tx, [fromId, toId]);
    const [from, to] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: fromId } }),
      tx.user.findUniqueOrThrow({ where: { id: toId } }),
    ]);
    if (from.level < TRANSFER.minLevel || to.level < TRANSFER.minLevel) {
      throw new UserError(`🔒 Ambos jugadores deben ser al menos **nivel ${TRANSFER.minLevel}** para transferir dinero.`);
    }
    if (from.cash <= 0n) throw new UserError('💸 No tienes efectivo para pagar.');

    const total = parseAmount(rawAmount, from.cash);
    if (total < TRANSFER.minAmount) throw new UserError(`❌ El pago mínimo es ${formatMoney(TRANSFER.minAmount)}.`);
    if (total > from.cash) throw new UserError('💸 No tienes tanto efectivo.');

    const { tax, net } = await payWithTax(tx, fromId, toId, total, cfg.transferTaxPct);
    return { total, tax, net, taxPct: cfg.transferTaxPct, cashLeft: from.cash - total };
  });
}

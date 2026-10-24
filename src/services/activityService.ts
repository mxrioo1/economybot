import type { Item, Job } from '@prisma/client';
import { lockUsers, runTx } from '../database/transaction';
import {
  BEG, COOLDOWNS, CRIME, DAILY, DEFAULT_JOB_ID, GATHER, LEVELS, MAX_TOTAL_MULTIPLIER, ROB,
} from '../config/economy';
import { FISH_LOOT, MINE_LOOT, RARITY_ORDER } from '../config/loot';
import { UserError } from '../utils/errors';
import { formatMoney, maxB, minB, pct, scale } from '../utils/money';
import { chance, randBig, randInt, weightedPick } from '../utils/random';
import { credit, currentBalance, debit, debitUpTo, transferCash } from './economyService';
import { acquire, remaining, setCooldown } from './cooldownService';
import { getConfig } from './configService';
import { grantXp, type XpResult } from './levelService';
import { applyRandomEvent, getModifiers, rollRandomEvent, type EventOutcome } from './eventService';
import { addItem, bestToolLuck, vehicleBonus } from './inventoryService';
import { getPropertyBonuses } from './propertyService';

const cap = (n: number) => Math.min(n, MAX_TOTAL_MULTIPLIER);
const xpWithMods = (base: number, mult: number, extra = 0) => Math.round(base * mult) + extra;

// ── /daily ───────────────────────────────────────────────────
export async function claimDaily(userId: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await acquire(tx, userId, 'daily', 'reclamar tu recompensa diaria');

    const now = Date.now();
    const keeps = user.lastDailyAt && now - user.lastDailyAt.getTime() < DAILY.streakResetHours * 3_600_000;
    const streak = keeps ? user.dailyStreak + 1 : 1;
    const streakBonus = 1 + Math.min(streak - 1, DAILY.streakMaxDays - 1) * DAILY.streakBonusPerDay;

    const mods = await getModifiers(tx, userId);
    const multiplier = cap(streakBonus * mods.money * cfg.rewardMultiplier);
    const reward = scale(BigInt(DAILY.base + user.level * DAILY.perLevel), multiplier);

    await credit(tx, userId, 'CASH', reward, 'DAILY', { note: `Recompensa diaria (racha ${streak})` });
    await tx.user.update({ where: { id: userId }, data: { dailyStreak: streak, lastDailyAt: new Date(now) } });
    const xp = await grantXp(tx, userId, xpWithMods(DAILY.xp, mods.xp));
    return { reward, streak, xp, notes: mods.notes, cash: await currentBalance(tx, userId, 'CASH') };
  });
}

// ── /work ────────────────────────────────────────────────────
export interface WorkResult {
  job: Job;
  gross: bigint;
  tax: bigint;
  net: bigint;
  multiplier: number;
  xp: XpResult;
  event: EventOutcome | null;
  notes: string[];
  cash: bigint;
}

export async function work(userId: string): Promise<WorkResult> {
  const cfg = await getConfig();
  const eventDef = await rollRandomEvent();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const job = await tx.job.findUnique({ where: { id: user.jobId ?? DEFAULT_JOB_ID } });
    if (!job) throw new UserError('💼 No tienes un trabajo válido. Usa `/trabajo` para elegir uno.');
    if (job.minLevel > user.level) {
      throw new UserError(`🔒 Tu trabajo de **${job.name}** requiere nivel ${job.minLevel}. Cámbialo con \`/trabajo\`.`);
    }
    await acquire(tx, userId, 'work', 'trabajar');

    const mods = await getModifiers(tx, userId);
    const [props, veh] = await Promise.all([getPropertyBonuses(tx, userId), vehicleBonus(tx, userId)]);
    const levelBonus = Math.min(user.level * LEVELS.workBonusPerLevel, LEVELS.workBonusMax);
    const multiplier = cap((1 + levelBonus + (props.workBonusPct + veh.pct) / 100) * mods.money * cfg.rewardMultiplier);
    const notes = [...mods.notes];
    if (veh.name) notes.push(`${veh.name} (+${veh.pct}%)`);

    const gross = scale(randBig(job.minPay, job.maxPay), multiplier);
    await credit(tx, userId, 'CASH', gross, 'WORK', { note: `Trabajo: ${job.name}` });
    const tax = pct(gross, cfg.incomeTaxPct);
    if (tax > 0n) await debit(tx, userId, 'CASH', tax, 'TAX', { note: 'Impuesto laboral' });

    const event = eventDef ? await applyRandomEvent(tx, userId, eventDef, gross - tax, mods.shield) : null;
    const xp = await grantXp(tx, userId, xpWithMods(randInt(job.xpMin, job.xpMax), mods.xp, event?.xp ?? 0));
    await tx.user.update({ where: { id: userId }, data: { workCount: { increment: 1 } } });
    return { job, gross, tax, net: gross - tax, multiplier, xp, event, notes, cash: await currentBalance(tx, userId, 'CASH') };
  });
}

// ── /pescar y /minar ─────────────────────────────────────────
export interface GatherResult {
  kind: 'fish' | 'mine';
  item: Item;
  quantity: number;
  cost: bigint;
  toolName: string | null;
  xp: XpResult;
  event: EventOutcome | null;
  cash: bigint;
}

export async function gather(userId: string, kind: 'fish' | 'mine'): Promise<GatherResult> {
  const table = kind === 'fish' ? FISH_LOOT : MINE_LOOT;
  const g = GATHER[kind];
  const eventDef = await rollRandomEvent();

  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await acquire(tx, userId, g.cooldown, kind === 'fish' ? 'pescar' : 'minar');

    const cost = BigInt(g.costBase + g.costPerLevel * user.level);
    if (user.cash < cost) {
      throw new UserError(`💸 Necesitas **${formatMoney(cost)}** para ${kind === 'fish' ? 'el cebo' : 'el equipo'}. Usa \`/work\` o \`/mendigar\`.`);
    }
    await debit(tx, userId, 'CASH', cost, 'COST', { note: kind === 'fish' ? 'Cebo' : 'Equipo de minería' });

    const tool = await bestToolLuck(tx, userId, kind === 'fish' ? 'fishing' : 'mining');
    const entry = weightedPick(table, (e) => e.weight * tool.luck ** RARITY_ORDER.indexOf(e.rarity));
    const quantity = randInt(entry.qty[0], entry.qty[1]);

    const item = await tx.item.findUnique({ where: { id: entry.id } });
    if (!item) throw new UserError('⚠️ Falta el objeto en la base de datos. Un admin debe ejecutar `npm run db:seed`.');
    await addItem(tx, userId, item.id, quantity);

    const mods = await getModifiers(tx, userId);
    const event = eventDef ? await applyRandomEvent(tx, userId, eventDef, item.sellValue * BigInt(quantity), mods.shield) : null;
    const xp = await grantXp(tx, userId, xpWithMods(randInt(g.xpMin, g.xpMax), mods.xp, event?.xp ?? 0));
    await tx.user.update({ where: { id: userId }, data: kind === 'fish' ? { fishCount: { increment: 1 } } : { mineCount: { increment: 1 } } });
    return { kind, item, quantity, cost, toolName: tool.name, xp, event, cash: await currentBalance(tx, userId, 'CASH') };
  });
}

// ── /crimen ──────────────────────────────────────────────────
export async function crime(userId: string) {
  const cfg = await getConfig();
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.level < CRIME.minLevel) throw new UserError(`🔒 El crimen se desbloquea en el **nivel ${CRIME.minLevel}**.`);
    await acquire(tx, userId, 'crime', 'cometer otro crimen');

    const mods = await getModifiers(tx, userId);
    const win = chance(CRIME.successChance);
    let amount = 0n;
    if (win) {
      const lvl = Math.min(1 + user.level * CRIME.rewardPerLevel, CRIME.rewardLevelMax);
      amount = scale(randBig(BigInt(CRIME.rewardMin), BigInt(CRIME.rewardMax)), cap(lvl * mods.money * cfg.rewardMultiplier));
      await credit(tx, userId, 'CASH', amount, 'CRIME', { note: 'Crimen exitoso' });
    } else {
      const wanted = minB(maxB(CRIME.fineMin, pct(user.cash, CRIME.finePct * 100)), CRIME.fineMax);
      amount = await debitUpTo(tx, userId, 'CASH', wanted, 'FINE', { note: 'Multa por crimen' });
    }
    const xp = await grantXp(tx, userId, xpWithMods(win ? CRIME.xpWin : CRIME.xpFail, mods.xp));
    await tx.user.update({
      where: { id: userId },
      data: { crimeCount: { increment: 1 }, ...(win ? { crimeWins: { increment: 1 } } : {}) },
    });
    return { win, amount, xp, notes: mods.notes, cash: await currentBalance(tx, userId, 'CASH') };
  });
}

// ── /robar ───────────────────────────────────────────────────
export async function rob(robberId: string, victimId: string) {
  if (robberId === victimId) throw new UserError('🤦 No puedes robarte a ti mismo.');

  return runTx(async (tx) => {
    await lockUsers(tx, [robberId, victimId]); // ambos bloqueados en orden estable
    const [robber, victim] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: robberId } }),
      tx.user.findUniqueOrThrow({ where: { id: victimId } }),
    ]);

    if (robber.level < ROB.minLevel) throw new UserError(`🔒 Robar se desbloquea en el **nivel ${ROB.minLevel}**.`);
    if (victim.level < ROB.minLevel) throw new UserError('🛡️ Esa persona es demasiado novata para ser robada.');
    await acquire(tx, robberId, 'rob', 'robar de nuevo');

    const protectedMs = await remaining(tx, victimId, 'robProtect');
    if (protectedMs > 0) throw new UserError('🛡️ Esa persona fue robada hace poco y está **protegida** un rato.');
    if ((await getModifiers(tx, victimId)).shield) throw new UserError('🛡️ Esa persona lleva un **escudo anti-robo** activo.');
    if (victim.cash < ROB.minVictimCash) {
      throw new UserError(`🤷 No vale la pena: lleva menos de **${formatMoney(ROB.minVictimCash)}** en efectivo.`);
    }
    if (robber.cash < ROB.minRobberCash) {
      throw new UserError(`💸 Necesitas al menos **${formatMoney(ROB.minRobberCash)}** en efectivo como fianza.`);
    }

    const win = chance(ROB.successChance);
    let amount: bigint;
    if (win) {
      const wanted = pct(victim.cash, randInt(Math.round(ROB.stealPctMin * 100), Math.round(ROB.stealPctMax * 100)));
      const limit = ROB.stealCapBase + ROB.stealCapPerLevel * BigInt(robber.level);
      amount = maxB(1n, minB(minB(wanted, limit), victim.cash));
      await transferCash(tx, victimId, robberId, amount, 'ROBBERY', 'Robo');
      await setCooldown(tx, victimId, 'robProtect', COOLDOWNS.robProtect);
      await tx.user.update({ where: { id: victimId }, data: { timesRobbed: { increment: 1 } } });
    } else {
      const wanted = maxB(ROB.failFineMin, pct(robber.cash, ROB.failFinePct * 100));
      amount = minB(wanted, robber.cash);
      await transferCash(tx, robberId, victimId, amount, 'ROBBERY', 'Compensación por robo fallido');
    }
    await tx.user.update({
      where: { id: robberId },
      data: { robCount: { increment: 1 }, ...(win ? { robWins: { increment: 1 } } : {}) },
    });
    const xp = await grantXp(tx, robberId, win ? ROB.xpWin : ROB.xpFail);
    return { win, amount, xp, cash: await currentBalance(tx, robberId, 'CASH') };
  });
}

// ── /mendigar ────────────────────────────────────────────────
export async function beg(userId: string) {
  return runTx(async (tx) => {
    await lockUsers(tx, [userId]);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await acquire(tx, userId, 'beg', 'mendigar');

    const nothing = chance(BEG.nothingChance);
    const amount = nothing ? 0n : BigInt(randInt(BEG.min, BEG.max) + Math.floor(user.level * BEG.perLevel));
    if (amount > 0n) await credit(tx, userId, 'CASH', amount, 'BEG', { note: 'Limosna' });
    const xp = await grantXp(tx, userId, BEG.xp);
    return { amount, xp, cash: await currentBalance(tx, userId, 'CASH') };
  });
}

// ── /pagar ───────────────────────────────────────────────────
export { payWithTax } from './economyService';

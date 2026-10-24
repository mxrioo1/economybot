import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, type ChatInputCommandInteraction,
} from 'discord.js';
import type { ItemCategory, Rarity } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { adminAdjust, economyStats, type AdminMode } from '../../services/adminService';
import { getConfig, updateConfig } from '../../services/configService';
import { listActiveServerEvents, startServerEvent, stopServerEvents } from '../../services/eventService';
import { logEvent } from '../../services/logService';
import { baseEmbed, CATEGORY_LABEL, COLORS, RARITY_LABEL, successEmbed } from '../../utils/embeds';
import { UserError } from '../../utils/errors';
import { formatMoney } from '../../utils/money';
import { isEconomyAdmin } from '../../utils/permissions';
import { discordTime } from '../../utils/time';
import { TX_LABEL } from '../../views/bank';
import type { Command } from '../../types';
import { assertHuman, EPHEMERAL, newCommand } from '../helpers';

const MAX_INT = 1_000_000_000_000_000; // = MAX_BALANCE, exacto en un double
const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;

const ACCOUNT_CHOICES = [
  { name: 'Efectivo', value: 'CASH' },
  { name: 'Banco', value: 'BANK' },
] as const;

const slugOrThrow = (id: string) => {
  if (!SLUG.test(id)) throw new UserError('❌ El ID debe ser un slug: minúsculas, números y guiones (2-40 caracteres), p. ej. `espada-de-oro`.');
  return id;
};

export const economia: Command = {
  data: newCommand('economia', 'Administración de la economía (solo staff).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s.setName('añadir').setDescription('Añade dinero a un usuario.')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addIntegerOption((o) => o.setName('cantidad').setDescription('Cantidad').setRequired(true).setMinValue(1).setMaxValue(MAX_INT))
        .addStringOption((o) => o.setName('cuenta').setDescription('Cuenta (por defecto efectivo)').addChoices(...ACCOUNT_CHOICES)),
    )
    .addSubcommand((s) =>
      s.setName('quitar').setDescription('Quita dinero a un usuario.')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addIntegerOption((o) => o.setName('cantidad').setDescription('Cantidad').setRequired(true).setMinValue(1).setMaxValue(MAX_INT))
        .addStringOption((o) => o.setName('cuenta').setDescription('Cuenta (por defecto efectivo)').addChoices(...ACCOUNT_CHOICES)),
    )
    .addSubcommand((s) =>
      s.setName('establecer').setDescription('Fija el saldo exacto de un usuario.')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addIntegerOption((o) => o.setName('cantidad').setDescription('Nuevo saldo').setRequired(true).setMinValue(0).setMaxValue(MAX_INT))
        .addStringOption((o) => o.setName('cuenta').setDescription('Cuenta (por defecto efectivo)').addChoices(...ACCOUNT_CHOICES)),
    )
    .addSubcommand((s) =>
      s.setName('reset').setDescription('Reinicia por completo la cuenta de un usuario.')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('crear-item').setDescription('Crea o actualiza un objeto de la tienda.')
        .addStringOption((o) => o.setName('id').setDescription('ID único (slug), p. ej. espada-de-oro').setRequired(true).setMaxLength(40))
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre visible').setRequired(true).setMaxLength(60))
        .addIntegerOption((o) => o.setName('precio').setDescription('Precio').setRequired(true).setMinValue(0).setMaxValue(1_000_000_000_000))
        .addStringOption((o) =>
          o.setName('categoria').setDescription('Categoría').setRequired(true)
            .addChoices(...(['VEHICULOS', 'HERRAMIENTAS', 'OBJETOS', 'COSMETICOS', 'BOOSTS'] as const).map((c) => ({ name: CATEGORY_LABEL[c]!, value: c }))),
        )
        .addStringOption((o) =>
          o.setName('rareza').setDescription('Rareza').addChoices(...(Object.keys(RARITY_LABEL) as Rarity[]).map((r) => ({ name: RARITY_LABEL[r]!, value: r }))),
        )
        .addStringOption((o) => o.setName('descripcion').setDescription('Descripción').setMaxLength(200))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji').setMaxLength(8))
        .addIntegerOption((o) => o.setName('nivel').setDescription('Nivel mínimo').setMinValue(1).setMaxValue(100))
        .addIntegerOption((o) => o.setName('stock').setDescription('Stock limitado (vacío = ilimitado)').setMinValue(0).setMaxValue(1_000_000))
        .addBooleanOption((o) => o.setName('vendible').setDescription('¿Se puede revender? (por defecto sí)')),
    )
    .addSubcommand((s) =>
      s.setName('crear-trabajo').setDescription('Crea o actualiza un trabajo.')
        .addStringOption((o) => o.setName('id').setDescription('ID único (slug)').setRequired(true).setMaxLength(40))
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre visible').setRequired(true).setMaxLength(40))
        .addIntegerOption((o) => o.setName('nivel').setDescription('Nivel mínimo').setRequired(true).setMinValue(0).setMaxValue(100))
        .addIntegerOption((o) => o.setName('pago-min').setDescription('Pago mínimo por turno').setRequired(true).setMinValue(1).setMaxValue(10_000_000))
        .addIntegerOption((o) => o.setName('pago-max').setDescription('Pago máximo por turno').setRequired(true).setMinValue(1).setMaxValue(10_000_000))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji').setMaxLength(8))
        .addStringOption((o) => o.setName('descripcion').setDescription('Descripción').setMaxLength(200)),
    )
    .addSubcommand((s) =>
      s.setName('evento').setDescription('Lanza o detiene un evento global con multiplicador.')
        .addStringOption((o) =>
          o.setName('tipo').setDescription('Tipo de evento').setRequired(true)
            .addChoices({ name: '💰 Dinero x', value: 'MONEY_MULT' }, { name: '✨ XP x', value: 'XP_MULT' }, { name: '🛑 Detener eventos activos', value: 'STOP' }),
        )
        .addNumberOption((o) => o.setName('multiplicador').setDescription('Multiplicador (1.1 – 5)').setMinValue(1.1).setMaxValue(5))
        .addIntegerOption((o) => o.setName('minutos').setDescription('Duración en minutos (1 – 1440)').setMinValue(1).setMaxValue(1440))
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre del evento').setMaxLength(60)),
    )
    .addSubcommand((s) =>
      s.setName('configuración').setDescription('Ver o cambiar la configuración (sin opciones = ver).')
        .addChannelOption((o) => o.setName('canal-logs').setDescription('Canal de logs').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addNumberOption((o) => o.setName('impuesto-trabajo').setDescription('% de impuesto sobre /work').setMinValue(0).setMaxValue(60))
        .addNumberOption((o) => o.setName('impuesto-transferencia').setDescription('% de impuesto en /pagar').setMinValue(0).setMaxValue(60))
        .addNumberOption((o) => o.setName('impuesto-compra').setDescription('% de IVA en compras').setMinValue(0).setMaxValue(60))
        .addNumberOption((o) => o.setName('comision-venta').setDescription('% de comisión al vender').setMinValue(0).setMaxValue(60))
        .addNumberOption((o) => o.setName('impuesto-negocios').setDescription('% sobre beneficios de negocios').setMinValue(0).setMaxValue(60))
        .addNumberOption((o) => o.setName('multiplicador').setDescription('Multiplicador global de recompensas').setMinValue(0.1).setMaxValue(5))
        .addNumberOption((o) => o.setName('prob-evento').setDescription('% de eventos aleatorios por actividad').setMinValue(0).setMaxValue(100))
        .addIntegerOption((o) => o.setName('minimo-log').setDescription('Importe mínimo para registrar en el canal').setMinValue(0).setMaxValue(MAX_INT))
        .addBooleanOption((o) => o.setName('casino').setDescription('Abrir (true) o cerrar (false) el casino'))
        .addIntegerOption((o) => o.setName('apuesta-minima').setDescription('Apuesta mínima del casino').setMinValue(1).setMaxValue(MAX_INT))
        .addIntegerOption((o) => o.setName('apuesta-maxima').setDescription('Apuesta máxima del casino').setMinValue(1).setMaxValue(MAX_INT))
        .addIntegerOption((o) => o.setName('pago-maximo').setDescription('Premio máximo por partida del casino').setMinValue(1).setMaxValue(MAX_INT)),
    )
    .addSubcommand((s) => s.setName('estadisticas').setDescription('Dinero creado y destruido en las últimas 24 h.')),

  async execute(i) {
    if (!isEconomyAdmin(i)) throw new UserError('🚫 No tienes permisos para administrar la economía.');
    const sub = i.options.getSubcommand();
    if (sub === 'añadir' || sub === 'quitar' || sub === 'establecer') return adjust(i, sub);
    if (sub === 'reset') return reset(i);
    if (sub === 'crear-item') return createItem(i);
    if (sub === 'crear-trabajo') return createJob(i);
    if (sub === 'evento') return event(i);
    if (sub === 'configuración') return config(i);
    return stats(i);
  },
};

async function adjust(i: ChatInputCommandInteraction, sub: 'añadir' | 'quitar' | 'establecer') {
  await i.deferReply({ flags: EPHEMERAL });
  const target = i.options.getUser('usuario', true);
  assertHuman(target);
  const account = (i.options.getString('cuenta') ?? 'CASH') as 'CASH' | 'BANK';
  const mode: AdminMode = sub === 'añadir' ? 'add' : sub === 'quitar' ? 'remove' : 'set';
  const amount = BigInt(i.options.getInteger('cantidad', true));

  const r = await adminAdjust(i.user.id, target.id, account, mode, amount);
  const where = account === 'CASH' ? 'efectivo' : 'banco';
  await i.editReply({ embeds: [successEmbed('Saldo actualizado', `${target} · ${where}: **${formatMoney(r.before)}** → **${formatMoney(r.after)}**`)] });
  await logEvent({
    category: 'ADMIN',
    title: `Economía: ${sub} (${where})`,
    description: `<@${i.user.id}> sobre <@${target.id}>`,
    fields: [{ name: 'Cambio', value: `${formatMoney(r.before)} → ${formatMoney(r.after)}` }],
    always: true,
  });
}

async function reset(i: ChatInputCommandInteraction) {
  const target = i.options.getUser('usuario', true);
  assertHuman(target);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`adm:${i.user.id}:reset:${target.id}:yes`).setLabel('Sí, reiniciar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`adm:${i.user.id}:reset:${target.id}:no`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
  );
  await i.reply({
    flags: EPHEMERAL,
    embeds: [baseEmbed(COLORS.warn).setTitle('⚠️ Confirmar reinicio').setDescription(`Se borrarán dinero, nivel, inventario, propiedades y negocios de ${target}. El historial se conserva. **No se puede deshacer.**`)],
    components: [row],
  });
}

async function createItem(i: ChatInputCommandInteraction) {
  await i.deferReply({ flags: EPHEMERAL });
  const id = slugOrThrow(i.options.getString('id', true));
  const price = BigInt(i.options.getInteger('precio', true));
  const sellable = i.options.getBoolean('vendible') ?? true;
  const data = {
    name: i.options.getString('nombre', true),
    description: i.options.getString('descripcion') ?? '',
    emoji: i.options.getString('emoji') ?? '📦',
    price,
    sellValue: sellable ? (price * 60n) / 100n : 0n,
    sellable,
    category: i.options.getString('categoria', true) as ItemCategory,
    rarity: (i.options.getString('rareza') ?? 'COMUN') as Rarity,
    minLevel: i.options.getInteger('nivel') ?? 1,
    stock: i.options.getInteger('stock'),
  };
  const item = await prisma.item.upsert({ where: { id }, update: data, create: { id, ...data } });
  await i.editReply({ embeds: [successEmbed('Objeto guardado', `${item.emoji} **${item.name}** (\`${item.id}\`) · ${formatMoney(item.price)} · ${CATEGORY_LABEL[item.category]}`)] });
  await logEvent({ category: 'ADMIN', title: 'Objeto creado/actualizado', description: `<@${i.user.id}>: ${item.name} (${item.id}) a ${formatMoney(item.price)}`, always: true });
}

async function createJob(i: ChatInputCommandInteraction) {
  await i.deferReply({ flags: EPHEMERAL });
  const id = slugOrThrow(i.options.getString('id', true));
  const minPay = BigInt(i.options.getInteger('pago-min', true));
  const maxPay = BigInt(i.options.getInteger('pago-max', true));
  if (minPay > maxPay) throw new UserError('❌ El pago mínimo no puede ser mayor que el máximo.');
  const level = i.options.getInteger('nivel', true);
  const data = {
    name: i.options.getString('nombre', true),
    emoji: i.options.getString('emoji') ?? '💼',
    description: i.options.getString('descripcion') ?? '',
    minLevel: level,
    minPay,
    maxPay,
    xpMin: 8 + level,
    xpMax: 16 + Math.round(level * 1.5),
  };
  const job = await prisma.job.upsert({ where: { id }, update: data, create: { id, ...data } });
  await i.editReply({ embeds: [successEmbed('Trabajo guardado', `${job.emoji} **${job.name}** (\`${job.id}\`) · nivel ${job.minLevel} · ${formatMoney(job.minPay)}–${formatMoney(job.maxPay)}`)] });
  await logEvent({ category: 'ADMIN', title: 'Trabajo creado/actualizado', description: `<@${i.user.id}>: ${job.name} (${job.id})`, always: true });
}

async function event(i: ChatInputCommandInteraction) {
  const type = i.options.getString('tipo', true);
  if (type === 'STOP') {
    await i.deferReply({ flags: EPHEMERAL });
    const n = await stopServerEvents();
    await i.editReply({ embeds: [successEmbed('Eventos detenidos', `Se detuvieron ${n} evento(s).`)] });
    await logEvent({ category: 'ADMIN', title: 'Eventos detenidos', description: `<@${i.user.id}> detuvo ${n} evento(s)`, always: true });
    return;
  }
  const kind = type as 'MONEY_MULT' | 'XP_MULT';
  const mult = i.options.getNumber('multiplicador') ?? 2;
  const minutes = i.options.getInteger('minutos') ?? 60;
  const name = i.options.getString('nombre') ?? (kind === 'MONEY_MULT' ? '¡Fiebre del dinero!' : '¡Hora de la experiencia!');
  const ev = await startServerEvent(name, kind, mult, minutes, i.user.id);
  await i.reply({
    embeds: [
      baseEmbed(COLORS.money)
        .setTitle(`🌍 ${ev.name}`)
        .setDescription(`${kind === 'MONEY_MULT' ? '💰 Todas las recompensas de dinero' : '✨ Toda la XP'} se multiplican por **x${mult}** hasta ${discordTime(ev.endsAt, 'f')} (${discordTime(ev.endsAt)}).`),
    ],
  });
  await logEvent({ category: 'ADMIN', title: 'Evento global iniciado', description: `<@${i.user.id}>: ${ev.name} x${mult} durante ${minutes} min`, always: true });
}

async function config(i: ChatInputCommandInteraction) {
  await i.deferReply({ flags: EPHEMERAL });
  const channel = i.options.getChannel('canal-logs');
  const map = {
    incomeTaxPct: i.options.getNumber('impuesto-trabajo'),
    transferTaxPct: i.options.getNumber('impuesto-transferencia'),
    purchaseTaxPct: i.options.getNumber('impuesto-compra'),
    sellFeePct: i.options.getNumber('comision-venta'),
    businessTaxPct: i.options.getNumber('impuesto-negocios'),
    rewardMultiplier: i.options.getNumber('multiplicador'),
    randomEventChance: i.options.getNumber('prob-evento'),
  };
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(map)) if (v !== null) data[k] = v;
  const minLog = i.options.getInteger('minimo-log');
  if (minLog !== null) data.logMinAmount = BigInt(minLog);
  if (channel) data.logChannelId = channel.id;
  const casinoOpen = i.options.getBoolean('casino');
  if (casinoOpen !== null) data.gamblingEnabled = casinoOpen;
  const minBet = i.options.getInteger('apuesta-minima');
  const maxBet = i.options.getInteger('apuesta-maxima');
  const maxPay = i.options.getInteger('pago-maximo');
  if (minBet !== null) data.gamblingMinBet = BigInt(minBet);
  if (maxBet !== null) data.gamblingMaxBet = BigInt(maxBet);
  if (maxPay !== null) data.gamblingMaxPayout = BigInt(maxPay);
  const current = await getConfig();
  const finalMin = (data.gamblingMinBet as bigint | undefined) ?? current.gamblingMinBet;
  const finalMax = (data.gamblingMaxBet as bigint | undefined) ?? current.gamblingMaxBet;
  if (finalMin > finalMax) throw new UserError('❌ La apuesta mínima no puede ser mayor que la máxima.');

  const changed = Object.keys(data).length > 0;
  const cfg = changed ? await updateConfig(data) : await getConfig();
  const events = await listActiveServerEvents();

  const embed = baseEmbed(changed ? COLORS.success : COLORS.info)
    .setTitle(changed ? '✅ Configuración actualizada' : '⚙️ Configuración actual')
    .addFields(
      { name: '🧾 Impuesto /work', value: `${cfg.incomeTaxPct}%`, inline: true },
      { name: '🔁 Impuesto /pagar', value: `${cfg.transferTaxPct}%`, inline: true },
      { name: '🛒 IVA compras', value: `${cfg.purchaseTaxPct}%`, inline: true },
      { name: '💱 Comisión venta', value: `${cfg.sellFeePct}%`, inline: true },
      { name: '🏢 Impuesto negocios', value: `${cfg.businessTaxPct}%`, inline: true },
      { name: '✖️ Multiplicador global', value: `x${cfg.rewardMultiplier}`, inline: true },
      { name: '🎲 Prob. evento aleatorio', value: `${cfg.randomEventChance}%`, inline: true },
      { name: '📝 Canal de logs', value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : 'No configurado', inline: true },
      { name: '🔔 Mínimo para loguear', value: formatMoney(cfg.logMinAmount), inline: true },
      { name: '🎰 Casino', value: `${cfg.gamblingEnabled ? '✅ Abierto' : '🔒 Cerrado'}\nApuesta ${formatMoney(cfg.gamblingMinBet)}–${formatMoney(cfg.gamblingMaxBet)}\nPremio máx. ${formatMoney(cfg.gamblingMaxPayout)}`, inline: true },
      { name: '🌍 Eventos activos', value: events.length ? events.map((e) => `${e.name} (x${e.multiplier}, termina ${discordTime(e.endsAt)})`).join('\n') : 'Ninguno' },
    );
  await i.editReply({ embeds: [embed] });
  if (changed) {
    await logEvent({ category: 'ADMIN', title: 'Configuración modificada', description: `<@${i.user.id}> cambió: ${Object.keys(data).join(', ')}`, always: true });
  }
}

async function stats(i: ChatInputCommandInteraction) {
  await i.deferReply({ flags: EPHEMERAL });
  const s = await economyStats(24);
  const fmt = (rows: { type: keyof typeof TX_LABEL; amount: bigint }[]) =>
    rows.length ? rows.slice(0, 8).map((r) => `${TX_LABEL[r.type]}: **${formatMoney(r.amount)}**`).join('\n') : '—';
  const net = s.totalMinted - s.totalBurned;
  await i.editReply({
    embeds: [
      baseEmbed(COLORS.info)
        .setTitle('📊 Salud de la economía (24 h)')
        .addFields(
          { name: '👥 Jugadores', value: String(s.users), inline: true },
          { name: '💵 Efectivo total', value: formatMoney(s.cash), inline: true },
          { name: '🏦 En bancos', value: formatMoney(s.bank), inline: true },
          { name: '🟢 Dinero creado', value: `**${formatMoney(s.totalMinted)}**\n${fmt(s.minted)}`, inline: true },
          { name: '🔥 Dinero destruido', value: `**${formatMoney(s.totalBurned)}**\n${fmt(s.burned)}`, inline: true },
          { name: '🎰 Casino (neto 24 h)', value: `Beneficio de la casa: **${s.casinoProfit >= 0n ? '+' : '-'}${formatMoney(s.casinoProfit >= 0n ? s.casinoProfit : -s.casinoProfit)}**\n*(Ya incluido abajo como dinero creado/destruido.)*`, inline: false },
          { name: net >= 0n ? '📈 Variación neta' : '📉 Variación neta', value: `**${net >= 0n ? '+' : ''}${formatMoney(net)}**\n*Si crece demasiado, sube impuestos o baja el multiplicador.*` },
        ),
    ],
  });
}

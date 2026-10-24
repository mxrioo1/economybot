import { buyProperty, listProperties, ownedProperties } from '../../services/propertyService';
import { buyBusiness, collectAll, listBusinesses, ownedBusinesses, pendingFor } from '../../services/businessService';
import { logEvent } from '../../services/logService';
import { businessChoices, propertyChoices } from '../../utils/autocomplete';
import { baseEmbed, COLORS, successEmbed } from '../../utils/embeds';
import { formatMoney, maxB } from '../../utils/money';
import { formatDuration } from '../../utils/time';
import type { Command } from '../../types';
import { newCommand } from '../helpers';

export const casa: Command = {
  data: newCommand('casa', 'Propiedades: más espacio, más bonus en /work y más límite bancario.')
    .addSubcommand((s) => s.setName('catalogo').setDescription('Casas disponibles.'))
    .addSubcommand((s) =>
      s.setName('comprar').setDescription('Compra una casa.').addStringOption((o) => o.setName('casa').setDescription('Casa a comprar').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName('mias').setDescription('Tus propiedades.')),
  async autocomplete(i) {
    await propertyChoices(i);
  },
  async execute(i) {
    await i.deferReply();
    const sub = i.options.getSubcommand();

    if (sub === 'catalogo') {
      const props = await listProperties();
      const lines = props.map(
        (p) => `${p.emoji} **${p.name}** — ${formatMoney(p.price)} · nivel ${p.minLevel}\n> 🎒 +${p.capacity} huecos · 💼 +${p.workBonusPct}% /work · 🏦 +${formatMoney(p.bankBonus)} de límite`,
      );
      await i.editReply({ embeds: [baseEmbed().setTitle('🏠 Propiedades en venta').setDescription(lines.join('\n\n') || 'No hay propiedades.').setFooter({ text: '💰 Economía • Compra con /casa comprar' })] });
    } else if (sub === 'comprar') {
      const r = await buyProperty(i.user.id, i.options.getString('casa', true));
      await i.editReply({ embeds: [successEmbed('¡Nueva propiedad!', `Ahora eres dueño de ${r.property.emoji} **${r.property.name}**.\nPrecio: **${formatMoney(r.price)}** · Impuestos: **${formatMoney(r.tax)}**`)] });
      await logEvent({ category: 'PURCHASE', title: `${i.user.tag} compró ${r.property.name}`, description: `Total: ${formatMoney(r.price + r.tax)}`, amount: r.price });
    } else {
      const owned = await ownedProperties(i.user.id);
      const lines = owned.map((o) => `${o.property.emoji} **${o.property.name}** — 🎒 +${o.property.capacity} · 💼 +${o.property.workBonusPct}% · 🏦 +${formatMoney(o.property.bankBonus)}`);
      await i.editReply({ embeds: [baseEmbed().setTitle('🏡 Tus propiedades').setDescription(lines.join('\n') || '*No tienes propiedades. Mira `/casa catalogo`.*')] });
    }
  },
};

export const negocio: Command = {
  data: newCommand('negocio', 'Negocios: ingresos pasivos con mantenimiento e impuestos.')
    .addSubcommand((s) => s.setName('catalogo').setDescription('Negocios disponibles.'))
    .addSubcommand((s) =>
      s.setName('comprar').setDescription('Compra un negocio.').addStringOption((o) => o.setName('negocio').setDescription('Negocio a comprar').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName('mios').setDescription('Estado de tus negocios.'))
    .addSubcommand((s) => s.setName('cobrar').setDescription('Cobra los beneficios acumulados.')),
  async autocomplete(i) {
    await businessChoices(i);
  },
  async execute(i) {
    await i.deferReply();
    const sub = i.options.getSubcommand();

    if (sub === 'catalogo') {
      const list = await listBusinesses();
      const lines = list.map(
        (b) => `${b.emoji} **${b.name}** — ${formatMoney(b.price)} · nivel ${b.minLevel}\n> 📈 ${formatMoney(b.incomePerHour)}/h · 🔧 -${formatMoney(b.upkeepPerHour)}/h · ⏱️ acumula hasta ${b.maxHours} h`,
      );
      await i.editReply({ embeds: [baseEmbed().setTitle('🏢 Negocios en venta').setDescription(lines.join('\n\n') || 'No hay negocios.').setFooter({ text: '💰 Economía • Cobra con /negocio cobrar antes de que se llene' })] });
    } else if (sub === 'comprar') {
      const r = await buyBusiness(i.user.id, i.options.getString('negocio', true));
      await i.editReply({ embeds: [successEmbed('¡Nuevo negocio!', `Ahora eres dueño de ${r.business.emoji} **${r.business.name}**.\nPrecio: **${formatMoney(r.price)}** · Impuestos: **${formatMoney(r.tax)}**`)] });
      await logEvent({ category: 'BUSINESS', title: `${i.user.tag} compró ${r.business.name}`, description: `Total: ${formatMoney(r.price + r.tax)}`, amount: r.price });
    } else if (sub === 'mios') {
      const owned = await ownedBusinesses(i.user.id);
      const lines = owned.map((ub) => {
        const p = pendingFor(ub);
        const net = maxB(0n, p.income - p.upkeep);
        return `${ub.business.emoji} **${ub.business.name}** — pendiente ~**${formatMoney(net)}** (${formatDuration(p.ms)})${p.full ? ' ⚠️ *lleno, cobra ya*' : ''}\n> Beneficio total: ${formatMoney(ub.totalProfit)}`;
      });
      await i.editReply({ embeds: [baseEmbed(COLORS.primary).setTitle('🏢 Tus negocios').setDescription(lines.join('\n\n') || '*No tienes negocios. Mira `/negocio catalogo`.*')] });
    } else {
      const r = await collectAll(i.user.id);
      const detail = r.lines.map((l) => `${l.emoji} **${l.name}** (${l.hours.toFixed(1)} h): +${formatMoney(l.income)} · -${formatMoney(l.upkeep)}${l.repair > 0n ? ` · 🛠️ avería -${formatMoney(l.repair)}` : ''}`);
      await i.editReply({
        embeds: [
          baseEmbed(r.net >= 0n ? COLORS.success : COLORS.warn)
            .setTitle('🏢 Cobro de negocios')
            .setDescription(detail.join('\n'))
            .addFields(
              { name: 'Ingresos', value: formatMoney(r.income), inline: true },
              { name: 'Gastos', value: `-${formatMoney(r.costs)}`, inline: true },
              { name: '🧾 Impuestos', value: `-${formatMoney(r.tax)}`, inline: true },
              { name: 'Beneficio neto', value: `**${formatMoney(r.net)}**` },
            ),
        ],
      });
      await logEvent({ category: 'BUSINESS', title: `${i.user.tag} cobró sus negocios`, description: `Neto: ${formatMoney(r.net)}`, amount: r.income });
    }
  },
};

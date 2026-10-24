import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { FISH_LOOT, MINE_LOOT } from '../config/loot';
import { logger } from '../utils/logger';

const sell = (price: number) => BigInt(Math.floor(price * 0.6)); // se revende al 60 %

export const JOBS: Prisma.JobCreateManyInput[] = [
  { id: 'desempleado', name: 'Desempleado', emoji: '🪫', description: 'Haces trabajillos sueltos para sobrevivir.', minLevel: 0, minPay: 30n, maxPay: 80n, xpMin: 6, xpMax: 12 },
  { id: 'repartidor', name: 'Repartidor', emoji: '🛵', description: 'Entregas pedidos por toda la ciudad.', minLevel: 1, minPay: 100n, maxPay: 200n, xpMin: 10, xpMax: 18 },
  { id: 'cajero', name: 'Cajero', emoji: '🧾', description: 'Atiendes la caja del supermercado.', minLevel: 3, minPay: 160n, maxPay: 300n, xpMin: 12, xpMax: 22 },
  { id: 'minero', name: 'Minero', emoji: '⛏️', description: 'Picas piedra bajo tierra.', minLevel: 5, minPay: 250n, maxPay: 450n, xpMin: 15, xpMax: 26 },
  { id: 'pescador', name: 'Pescador', emoji: '🎣', description: 'Faenas en alta mar.', minLevel: 5, minPay: 240n, maxPay: 420n, xpMin: 15, xpMax: 26 },
  { id: 'policia', name: 'Policía', emoji: '👮', description: 'Patrullas las calles de la ciudad.', minLevel: 8, minPay: 400n, maxPay: 650n, xpMin: 18, xpMax: 32 },
  { id: 'mecanico', name: 'Mecánico', emoji: '🔧', description: 'Reparas motores y cambias ruedas.', minLevel: 10, minPay: 550n, maxPay: 900n, xpMin: 22, xpMax: 38 },
  { id: 'programador', name: 'Programador', emoji: '💻', description: 'Picas código para startups.', minLevel: 15, minPay: 900n, maxPay: 1500n, xpMin: 28, xpMax: 48 },
  { id: 'medico', name: 'Médico', emoji: '🩺', description: 'Salvas vidas en el hospital.', minLevel: 20, minPay: 1400n, maxPay: 2200n, xpMin: 35, xpMax: 58 },
  { id: 'empresario', name: 'Empresario', emoji: '🏆', description: 'Diriges tu propia corporación.', minLevel: 30, minPay: 2500n, maxPay: 4000n, xpMin: 45, xpMax: 75 },
];

const tool = (id: string, name: string, emoji: string, price: number, minLevel: number, kind: 'fishing' | 'mining', luck: number, description: string): Prisma.ItemCreateManyInput => ({
  id, name, emoji, description, price: BigInt(price), sellValue: sell(price), category: 'HERRAMIENTAS', rarity: luck >= 1.6 ? 'EPICO' : luck >= 1.3 ? 'RARO' : 'POCO_COMUN', minLevel,
  meta: { kind: 'tool', tool: kind, luck },
});
const vehicle = (id: string, name: string, emoji: string, price: number, minLevel: number, bonus: number, rarity: Prisma.ItemCreateManyInput['rarity']): Prisma.ItemCreateManyInput => ({
  id, name, emoji, description: `Aumenta un ${bonus}% lo que ganas en /work.`, price: BigInt(price), sellValue: sell(price), category: 'VEHICULOS', rarity, minLevel,
  meta: { kind: 'vehicle', workBonusPct: bonus },
});
const thing = (id: string, name: string, emoji: string, price: number, minLevel: number, rarity: Prisma.ItemCreateManyInput['rarity'], description: string): Prisma.ItemCreateManyInput => ({
  id, name, emoji, description, price: BigInt(price), sellValue: sell(price), category: 'OBJETOS', rarity, minLevel,
});
const cosmetic = (id: string, name: string, emoji: string, price: number, minLevel: number, rarity: Prisma.ItemCreateManyInput['rarity'], description: string): Prisma.ItemCreateManyInput => ({
  id, name, emoji, description, price: BigInt(price), sellValue: 0n, sellable: false, category: 'COSMETICOS', rarity, minLevel,
  meta: { kind: 'cosmetic', badge: emoji },
});
const boost = (id: string, name: string, emoji: string, price: number, kind: 'MONEY' | 'XP' | 'SHIELD', multiplier: number, minutes: number, description: string): Prisma.ItemCreateManyInput => ({
  id, name, emoji, description, price: BigInt(price), sellValue: 0n, sellable: false, category: 'BOOSTS', rarity: 'RARO', minLevel: 1,
  meta: { kind: 'boost', boost: kind, multiplier, minutes },
});

export const SHOP_ITEMS: Prisma.ItemCreateManyInput[] = [
  vehicle('bicicleta', 'Bicicleta', '🚲', 3_000, 1, 2, 'COMUN'),
  vehicle('moto', 'Moto', '🏍️', 15_000, 5, 4, 'POCO_COMUN'),
  vehicle('coche', 'Coche', '🚗', 60_000, 12, 7, 'RARO'),
  vehicle('deportivo', 'Deportivo', '🏎️', 250_000, 25, 12, 'EPICO'),
  vehicle('helicoptero', 'Helicóptero', '🚁', 1_200_000, 40, 20, 'LEGENDARIO'),

  tool('cana-basica', 'Caña básica', '🎣', 500, 1, 'fishing', 1.15, 'Mejora un poco tu suerte al pescar.'),
  tool('cana-pro', 'Caña profesional', '🎣', 5_000, 8, 'fishing', 1.35, 'Más probabilidad de peces raros.'),
  tool('cana-maestra', 'Caña maestra', '🎣', 40_000, 20, 'fishing', 1.6, 'La favorita de los pescadores legendarios.'),
  tool('pico-hierro', 'Pico de hierro', '⛏️', 600, 1, 'mining', 1.15, 'Mejora un poco tu suerte al minar.'),
  tool('pico-acero', 'Pico de acero', '⛏️', 6_000, 8, 'mining', 1.35, 'Más probabilidad de minerales valiosos.'),
  tool('pico-diamante', 'Pico de diamante', '⛏️', 50_000, 20, 'mining', 1.6, 'Encuentra gemas con más frecuencia.'),

  thing('guitarra', 'Guitarra', '🎸', 4_500, 3, 'POCO_COMUN', 'Para tus tardes de inspiración.'),
  thing('reloj-oro', 'Reloj de oro', '⌚', 8_000, 5, 'RARO', 'Un clásico que conserva su valor.'),
  thing('consola', 'Consola', '🎮', 12_000, 5, 'POCO_COMUN', 'Para desconectar tras un duro día.'),
  thing('portatil', 'Portátil', '💻', 20_000, 8, 'RARO', 'Herramienta de trabajo y ocio.'),
  thing('anillo-diamante', 'Anillo de diamantes', '💍', 60_000, 15, 'EPICO', 'Brilla más que tu cuenta bancaria.'),

  cosmetic('gorra', 'Gorra', '🧢', 2_000, 1, 'COMUN', 'Insignia que se muestra en tu perfil.'),
  cosmetic('gafas-sol', 'Gafas de sol', '😎', 5_000, 3, 'POCO_COMUN', 'Insignia que se muestra en tu perfil.'),
  cosmetic('esmoquin', 'Esmoquin', '🤵', 30_000, 10, 'RARO', 'Insignia que se muestra en tu perfil.'),
  cosmetic('corona', 'Corona', '👑', 100_000, 20, 'LEGENDARIO', 'Insignia que se muestra en tu perfil.'),

  boost('boost-xp', 'Boost de XP x2', '📚', 2_000, 'XP', 2, 30, 'Duplica la XP ganada durante 30 minutos. Usa /usar.'),
  boost('boost-dinero', 'Boost de dinero x1.5', '💎', 5_000, 'MONEY', 1.5, 30, 'Gana 50% más en /work, /daily y /crimen durante 30 min.'),
  boost('escudo', 'Escudo anti-robo', '🛡️', 3_000, 'SHIELD', 1, 360, 'Nadie podrá robarte durante 6 horas. Usa /usar.'),
];

const lootToItems = (entries: typeof FISH_LOOT): Prisma.ItemCreateManyInput[] =>
  entries.map((e) => ({
    id: e.id, name: e.name, emoji: e.emoji, description: 'Objeto de recolección. Véndelo con /vender.',
    price: e.value * 2n, sellValue: e.value, category: 'OBJETOS', rarity: e.rarity, minLevel: 1,
    shopListed: false, sellable: true, meta: { kind: 'loot' },
  }));

export const PROPERTIES: Prisma.PropertyCreateManyInput[] = [
  { id: 'apartamento', name: 'Apartamento', emoji: '🏢', description: 'Un pequeño piso para empezar.', price: 2_500n, minLevel: 2, capacity: 25, workBonusPct: 1, bankBonus: 5_000n },
  { id: 'casa-pequena', name: 'Casa pequeña', emoji: '🏠', description: 'Acogedora y con jardín.', price: 10_000n, minLevel: 3, capacity: 60, workBonusPct: 2, bankBonus: 15_000n },
  { id: 'casa-mediana', name: 'Casa mediana', emoji: '🏡', description: 'Espaciosa, para toda la familia.', price: 50_000n, minLevel: 10, capacity: 150, workBonusPct: 4, bankBonus: 60_000n },
  { id: 'mansion', name: 'Mansión', emoji: '🏰', description: 'Lujo, piscina y personal de servicio.', price: 500_000n, minLevel: 25, capacity: 400, workBonusPct: 8, bankBonus: 400_000n },
  { id: 'castillo', name: 'Castillo', emoji: '👑', description: 'Solo para la élite del servidor.', price: 2_500_000n, minLevel: 40, capacity: 1000, workBonusPct: 12, bankBonus: 2_000_000n },
];

export const BUSINESSES: Prisma.BusinessCreateManyInput[] = [
  { id: 'tienda', name: 'Tienda', emoji: '🏪', description: 'Un pequeño comercio de barrio.', price: 25_000n, minLevel: 10, incomePerHour: 280n, upkeepPerHour: 100n },
  { id: 'restaurante', name: 'Restaurante', emoji: '🍽️', description: 'Cocina de autor y mucha clientela.', price: 80_000n, minLevel: 15, incomePerHour: 850n, upkeepPerHour: 320n },
  { id: 'gasolinera', name: 'Gasolinera', emoji: '⛽', description: 'Abierta las 24 horas.', price: 200_000n, minLevel: 20, incomePerHour: 2_000n, upkeepPerHour: 760n },
  { id: 'discoteca', name: 'Discoteca', emoji: '🪩', description: 'La fiesta nunca termina.', price: 500_000n, minLevel: 28, incomePerHour: 4_800n, upkeepPerHour: 1_900n },
  { id: 'tecnologica', name: 'Empresa tecnológica', emoji: '🖥️', description: 'Software que mueve millones.', price: 1_500_000n, minLevel: 40, incomePerHour: 13_500n, upkeepPerHour: 5_500n },
];

/** Inserta lo que falte SIN sobrescribir cambios hechos por administradores. */
export async function seedDatabase(): Promise<void> {
  await prisma.job.createMany({ data: JOBS, skipDuplicates: true });
  await prisma.item.createMany({ data: [...SHOP_ITEMS, ...lootToItems(FISH_LOOT), ...lootToItems(MINE_LOOT)], skipDuplicates: true });
  await prisma.property.createMany({ data: PROPERTIES, skipDuplicates: true });
  await prisma.business.createMany({ data: BUSINESSES, skipDuplicates: true });
  await prisma.config.upsert({ where: { id: 'global' }, update: {}, create: { id: 'global' } });
  logger.info('🌱 Datos iniciales comprobados (trabajos, objetos, casas, negocios).');
}

export async function ensureSeed(): Promise<void> {
  if ((await prisma.job.count()) === 0 || (await prisma.item.count()) === 0) await seedDatabase();
}

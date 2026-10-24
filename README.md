# 💰 Bot de Economía para Discord

Bot de economía completo en español: efectivo y banco, trabajos, pesca, minería, crimen, robos, tienda, inventario, casas, negocios, XP/niveles, eventos aleatorios, rankings, administración y logs.

**Stack:** Node.js 20+ · TypeScript · discord.js v14 · PostgreSQL · Prisma · comandos slash.

---

## 1. Arquitectura

```
src/
├── index.ts                 Arranque, conexión a BD, login y apagado limpio
├── commands/                Un archivo por grupo de comandos slash
│   ├── economy/             balance, daily, work, trabajo, pagar, ranking, banco, cooldowns, ayuda
│   ├── activities/          pescar, minar, crimen, robar, mendigar
│   ├── shop/                tienda, comprar, vender, usar, inventario, casa, negocio
│   ├── casino/              coinflip, dados, ruleta, tragaperras, blackjack, buscaminas, hilo, crash, casino
│   ├── admin/               /economia (solo staff)
│   └── index.ts             Registro explícito de todos los comandos
├── components/              Botones, menús y modales (router por prefijo de customId)
├── views/                   Constructores de mensajes (embeds + componentes + paginación)
├── events/                  ready, interactionCreate (rate-limit, errores, router)
├── services/                TODA la lógica de negocio
│   ├── economyService       Único punto que cambia saldos (+ libro mayor)
│   ├── cooldownService      Cooldowns atómicos
│   ├── levelService         XP y niveles
│   ├── inventoryService     Inventario y capacidad
│   ├── jobService           Trabajos
│   ├── bankService          Banco, límites, intereses, historial
│   ├── propertyService      Casas
│   ├── businessService      Negocios
│   ├── shopService          Compra, venta y uso de objetos
│   ├── activityService      daily, work, pescar, minar, crimen, robar, mendigar
│   ├── casinoService        Todos los juegos: apuestas, partidas con estado, liquidación
│   ├── casinoLogic          Lógica pura de los juegos (cartas, ruleta, multiplicadores…)
│   ├── eventService         Eventos aleatorios, eventos globales y boosts
│   ├── rankingService       Rankings y patrimonio
│   ├── transferService      /pagar
│   ├── adminService         Ajustes de admin, reset, estadísticas
│   ├── configService        Configuración en caliente (BD)
│   └── logService           Logs a consola y a un canal de Discord
├── database/                Cliente Prisma, transacciones/bloqueos, datos iniciales (seed)
├── config/                  env, economía (todos los números), eventos, botín
├── utils/                   dinero, embeds, aleatoriedad, rate-limit, errores, autocompletado…
├── types/                   Interfaces compartidas
└── scripts/                 deploy-commands (registrar slash) y seed
prisma/schema.prisma         Esquema de la base de datos
```

**Flujo de un comando:** `interactionCreate` → anti-spam → comando → **servicio** → `runTx` (transacción + bloqueo de filas) → `economyService` (saldo + libro mayor) → respuesta con embed → log.

---

## 2. Esquema de base de datos y relaciones

| Modelo | Qué guarda | Relaciones |
|---|---|---|
| **User** | Efectivo, banco (`BigInt`), nivel, XP, trabajo, racha, estadísticas | `Job?` · 1‑N `Inventory`, `Transaction`, `Cooldown`, `UserProperty`, `UserBusiness`, `ActiveBoost` |
| **Job** | Nivel mínimo, pago mín/máx, XP | 1‑N `User` |
| **Item** | Precio, valor de venta, categoría, rareza, stock, `meta` JSON (efecto) | 1‑N `Inventory` |
| **Inventory** | Cantidad de un objeto por usuario (PK compuesta) | N‑1 `User`, N‑1 `Item` |
| **Transaction** | **Libro mayor**: cada movimiento con importe con signo, saldo resultante, tipo y contraparte | N‑1 `User` |
| **Cooldown** | Caducidad por usuario y acción (PK compuesta) | N‑1 `User` |
| **Property** | Casas: precio, nivel, capacidad, bonus de trabajo y de banco | 1‑N `UserProperty` |
| **UserProperty** | Propiedad de un usuario (tabla puente) | N‑1 `User`, N‑1 `Property` |
| **Business** | Negocios: precio, ingreso/h, mantenimiento/h | 1‑N `UserBusiness` |
| **UserBusiness** | Negocio de un usuario + último cobro (tabla puente) | N‑1 `User`, N‑1 `Business` |
| **Game** | Partida de casino con estado **secreto** (minas, cartas del crupier, punto de explosión), apuesta, premio y estado | N‑1 `User` |
| **ActiveBoost** | Boost de dinero/XP o escudo anti‑robo activo | N‑1 `User` |
| **ServerEvent** | Evento global temporal (multiplicador) | — |
| **Config** | Impuestos, multiplicador global, canal de logs (fila `global`) | — |

Todos los importes son `BigInt` (int8): no hay desbordamientos de 32 bits.

---

## 3. Cómo funciona la economía

**Dinero que entra (fuentes):** `/daily`, `/work`, venta de objetos, `/crimen`, `/mendigar`, intereses del banco, negocios, eventos aleatorios.

**Dinero que sale (sumideros):**
- Impuesto laboral sobre `/work` (5 %), impuesto en `/pagar` (2 %), IVA en tienda/casas/negocios (5 %), comisión al vender (3 %), impuesto sobre beneficios de negocios (10 %)
- Multas de `/crimen` y eventos negativos, costes de actividad (cebo/equipo en `/pescar` y `/minar`)
- Mantenimiento y averías de negocios
- Cada compra: el dinero se destruye (no va a nadie)
- Revender un objeto da solo el 60 % de su precio

**Frenos a la inflación:** tope de interés diario, negocios que solo acumulan 12 h, multiplicador total máximo x4, límite bancario por nivel, `/pagar` desde nivel 2 (evita alts), recompensas escaladas por nivel de forma suave.

**Progresión:** la XP necesaria para subir crece como `50 + 25·nivel^1.5`. El nivel desbloquea trabajos, casas, negocios, objetos, mejor límite bancario y bonus de pago.

**Monitoriza la salud:** `/economia estadisticas` muestra el dinero creado y destruido en 24 h por categoría. Si crece demasiado, sube impuestos o baja el multiplicador con `/economia configuración`.

Todos los números (cooldowns, recompensas, probabilidades, precios) están en `src/config/economy.ts`, `src/config/events.ts`, `src/config/loot.ts` y `src/database/seed.ts`.

---

## 4. Seguridad implementada

- **Transacciones + bloqueo de filas:** toda operación financiera corre en `runTx`; `lockUsers` hace `SELECT … FOR UPDATE` en orden estable, así que dos comandos simultáneos no pueden duplicar dinero ni causar deadlocks.
- **Saldo imposible de falsear:** `economyService.adjust` valida *dentro del UPDATE* que no se quede negativo ni supere el máximo.
- **Cooldowns atómicos** dentro de la misma transacción: si la acción falla, el cooldown se revierte; no se puede saltar con comandos paralelos.
- **Cantidades:** se parsean como texto a `BigInt` (`500`, `2k`, `mitad`, `todo`); se rechazan negativos, cero, decimales sin sufijo, notación científica y valores gigantes.
- **IDs:** los IDs de objetos, trabajos o casas se validan siempre contra la BD; los botones/menús llevan el ID del dueño y solo él puede usarlos.
- **Anti‑spam:** máx. 8 interacciones por 10 s; si se supera, bloqueo de 15 s.
- **Admin:** `/economia` exige permiso *Administrador* de Discord o estar en `ADMIN_IDS`, comprobado también al pulsar sus botones.
- **Auditoría:** cada movimiento queda en el libro mayor (`Transaction`) con saldo resultante.
- **Robos:** solo se roba efectivo (el banco es seguro), con nivel mínimo, fianza, protección tras ser robado, escudo comprable y cooldown.

---

## 5. Instalación paso a paso

### 1) Crear el bot en Discord
1. Entra en <https://discord.com/developers/applications> → **New Application**.
2. En **Bot** pulsa *Reset Token* y copia el token (`DISCORD_TOKEN`). **No actives intents privilegiados**: no hacen falta.
3. En **General Information** copia el *Application ID* (`CLIENT_ID`).

### 2) Invitarlo al servidor
En **OAuth2 → URL Generator** marca los scopes `bot` y `applications.commands`, y los permisos *View Channels*, *Send Messages*, *Embed Links*. Abre la URL generada y elige tu servidor. Para `GUILD_ID`, activa el modo desarrollador en Discord, clic derecho al servidor → *Copiar ID*.

### 3) Crear PostgreSQL
- **Con Docker:** `docker compose up -d` (usuario/clave/BD `economy`). Tu `DATABASE_URL` será  
  `postgresql://economy:economy@localhost:5432/economy?schema=public`
- **Sin Docker:** instala PostgreSQL 14+, y crea la BD: `CREATE DATABASE economy;`

### 4) Configurar `.env`
```bash
cp .env.example .env
```
Rellena `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` y `DATABASE_URL`. Opcional: `ADMIN_IDS` (IDs separados por comas) y `LOG_CHANNEL_ID`.

### 5) Instalar dependencias
```bash
npm install
```

### 6) Crear las tablas con Prisma
```bash
npx prisma migrate dev --name init      # desarrollo: crea y aplica la migración
npm run db:seed                         # trabajos, objetos, casas y negocios iniciales
```
(El bot también siembra los datos al arrancar si la BD está vacía. Es seguro repetirlo: nunca sobrescribe lo que cambies.)

### 7) Registrar los slash commands
```bash
npm run deploy
```
Con `GUILD_ID` aparecen al instante en tu servidor; sin él se registran globalmente (hasta 1 h).

### 8) Iniciar el bot
```bash
npm run dev       # desarrollo con recarga automática
```

### 9) Producción
```bash
npm ci
npm run build                 # genera el cliente Prisma y compila a dist/
npm run db:deploy             # aplica las migraciones sin preguntar
npm run deploy:prod           # registra los comandos
npm start
```
Para mantenerlo vivo: `npm i -g pm2 && pm2 start dist/index.js --name economia && pm2 save && pm2 startup`.  
También puedes usar el `Dockerfile` incluido: `docker build -t economia . && docker run -d --env-file .env economia`.

---

## 5b. 🎰 Casino

Todo con **dinero virtual del servidor** (no hay dinero real). Los resultados se deciden **en el servidor** con aleatoriedad criptográfica antes de mostrar nada, y el estado secreto de cada partida (posición de las minas, carta oculta del crupier, punto de explosión del crash) nunca sale de la base de datos.

| Juego | Cómo se juega | Pago | Retorno al jugador |
|---|---|---|---|
| 🪙 `/coinflip` | Cara o cruz | x1,95 | 97,5 % |
| 🎲 `/dados` | Dado 1‑100, mayor/menor que un objetivo (5‑95) | x = 0,97 / probabilidad | 97 % |
| 🎡 `/ruleta` | Europea 0‑36: número, color, paridad, mitades, docenas, columnas | x36 · x2 · x3 | 97,3 % |
| 🎰 `/tragaperras` | 3 rodillos | tres iguales hasta x500 · 2 cerezas x1,8 · 1 cereza x0,4 | ~94,3 % |
| 🃏 `/blackjack` | Pedir, plantarse, doblar. Crupier se planta en 17 | blackjack 3:2 · victoria 1:1 | ~98 % con estrategia básica |
| 💣 `/buscaminas` | Tablero 4×5, 1‑10 minas, retírate cuando quieras | multiplicador creciente | 97 % |
| ⬆️ `/hilo` | ¿La siguiente carta es mayor o menor? (empate pierde) | multiplicador por racha | 97 % |
| 🚀 `/crash` | El cohete sube; retírate antes de que explote | hasta x100 | 97 % |

La casa siempre tiene ventaja, así que **el casino es un sumidero de dinero** para la economía. Los retornos de la tabla están verificados con simulaciones de millones de partidas.

**Protecciones del casino**
- La apuesta se cobra **antes** de decidir el resultado, dentro de la misma transacción; si algo falla se revierte todo.
- Límites configurables: apuesta mínima/máxima y **premio máximo por partida** (`/economia configuración`: `casino`, `apuesta-minima`, `apuesta-maxima`, `pago-maximo`).
- Pausa de 3 s entre apuestas y **una sola partida con estado** por jugador.
- Los botones solo funcionan para quien creó la partida; pulsar dos veces o desde dos dispositivos no puede cobrar doble (bloqueo de fila).
- En el **crash**, el multiplicador depende solo de la hora del servidor: pulsar tarde pierde, y no se puede "adelantar" ninguna información.
- **Partidas abandonadas:** cada 2 minutos el bot liquida las que llevan 10 min sin tocarse (buscaminas/hi‑lo: cobras lo acumulado o recuperas la apuesta si no abriste nada; blackjack: el crupier juega; crash: se pierde).
- `/economia estadisticas` muestra cuánto se ha quedado el casino en 24 h; `/casino stats` y `/casino top` muestran el balance de cada jugador.
- El canal de logs recibe las partidas cuyo importe supere el mínimo configurado.

> Si tu servidor no quiere apuestas, ciérralo con `/economia configuración casino:false`.

**Actualizar una instalación existente** (añade tablas y columnas, no borra nada):
```bash
npx prisma migrate dev --name casino
npm run deploy      # registra los comandos nuevos
npm run dev
```

---

## 6. Comandos

**Jugadores:** `/balance` `/daily` `/work` `/trabajo` `/pagar` `/ranking dinero|nivel|trabajo|patrimonio` `/cooldowns` `/ayuda`  
**Banco:** `/banco` (panel con botones y modales) `/depositar` `/retirar`  
**Actividades:** `/pescar` `/minar` `/mendigar` `/crimen` `/robar`  
**Tienda:** `/tienda` `/comprar` `/vender` `/usar` `/inventario`  
**Propiedades:** `/casa catalogo|comprar|mias` · `/negocio catalogo|comprar|mios|cobrar`  
**Casino:** `/casino reglas|stats|top` · `/coinflip` `/dados` `/ruleta` `/tragaperras` `/blackjack` `/buscaminas` `/hilo` `/crash`  
**Admin:** `/economia añadir|quitar|establecer|reset|crear-item|crear-trabajo|evento|configuración|estadisticas`

Cantidades aceptadas: `500`, `1,500`, `2k`, `1.5m`, `mitad`, `todo`.

> Nota: `/economia` se oculta a quien no sea administrador. Si quieres que usuarios de `ADMIN_IDS` sin permiso de Administrador lo vean, dales acceso en *Ajustes del servidor → Integraciones → tu bot*.

## 7. Personalización rápida

| Quiero… | Dónde |
|---|---|
| Cambiar cooldowns, recompensas, límites | `src/config/economy.ts` |
| Impuestos, multiplicador global, prob. de eventos | `/economia configuración` (en caliente) |
| Añadir/editar eventos aleatorios | `src/config/events.ts` |
| Cambiar el botín de pesca/minería | `src/config/loot.ts` |
| Nuevos objetos / trabajos | `/economia crear-item`, `/economia crear-trabajo` |
| Nuevas casas / negocios | `src/database/seed.ts` y `npm run db:seed` |
| Evento de dinero/XP x2 | `/economia evento` |
| Retornos, pagos, tragaperras, crash | `src/config/casino.ts` |

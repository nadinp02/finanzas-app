# Cuentas Claras

Finanzas personales mobile-first, instalable como PWA: ingresos, gastos, tarjetas de crédito, ahorro y
carga por voz. Next.js 16 · React 19 · TypeScript · Prisma 7 · PostgreSQL.

- Producto: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- Arquitectura y contratos de API: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Modelo de datos: [docs/DATABASE.md](docs/DATABASE.md)
- Reglas financieras: [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md)
- Plan y avance: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) · [docs/PROGRESS.md](docs/PROGRESS.md)

## Requisitos

Node.js ≥ 22.12 y npm. No hace falta instalar PostgreSQL ni Docker para desarrollar: el proyecto trae
un PostgreSQL embebido.

## Puesta en marcha local

```bash
npm install
cp .env.example .env            # completar las claves de voz si se van a usar
npm run db:dev                  # en otra terminal: PostgreSQL local (puerto 5433). Ctrl+C para detenerlo
npm run db:deploy               # aplica las migraciones
npm run user:create             # crea la cuenta de acceso (pide email, nombre y contraseña)
npm run dev                     # http://localhost:3000
```

Al primer ingreso se abre la configuración inicial (saldos de cuentas y deudas de tarjetas).

## Cuenta de acceso

No hay registro público. La cuenta se crea con `npm run user:create` y el acceso se recupera con:

```bash
npm run user:reset-password -- --email tu@email.com
```

Cambia la contraseña y cierra todas las sesiones abiertas. Requiere acceso a la base (`DATABASE_URL`),
así que solo puede hacerlo quien administra la app. Para automatizar, la contraseña puede pasarse en
la variable `NEW_PASSWORD`.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | `prisma generate` + `next build` + `serwist build` (service worker) |
| `npm start` | Sirve el build de producción |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript (app y service worker) |
| `npm test` | Pruebas unitarias e integración (levanta un PostgreSQL descartable) |
| `npm run test:unit` · `npm run test:integration` | Cada grupo por separado |
| `npm run test:e2e` | E2E con Playwright (Chromium, viewport iPhone) sobre el build de producción: correr `npm run build` antes. Levanta su propio PostgreSQL descartable y los puertos 3100 y 5435 |
| `npm run db:dev` | PostgreSQL local persistente en `.data/postgres` |
| `npm run db:migrate` · `npm run db:deploy` | Crear y aplicar migraciones (desarrollo) · aplicar (producción) |
| `npm run user:create` · `npm run user:reset-password` | Alta de la cuenta y recuperación de acceso |
| `npm run icons` | Regenera los íconos PNG de la PWA |

## Voz (en desarrollo: fase 4, ver PROGRESS)

La transcripción usará OpenAI (`gpt-transcribe`) y la interpretación, Claude. Se configuran con
`OPENAI_API_KEY` y `ANTHROPIC_API_KEY` en `.env` (ver `.env.example`). Las claves solo viven en el
servidor. Detalles en [docs/ARCHITECTURE.md §8](docs/ARCHITECTURE.md).

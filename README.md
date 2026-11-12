# Cuentas Claras

Finanzas personales mobile-first, instalable como PWA: ingresos, gastos, tarjetas de crédito, ahorro y
carga por voz. Next.js 16 · React 19 · TypeScript · Prisma 7 · PostgreSQL.

- Producto: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- Arquitectura y contratos de API: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Modelo de datos: [docs/DATABASE.md](docs/DATABASE.md)
- Reglas financieras: [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md)
- Carga por voz: [docs/VOICE.md](docs/VOICE.md)
- Despliegue en Vercel (gratis): [docs/DEPLOY.md](docs/DEPLOY.md)
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
npm run dev                     # http://localhost:3000 → «Creá una» para registrarte
```

Al primer ingreso se abre la configuración inicial (saldos de cuentas y deudas de tarjetas).

## Cuentas

Cualquiera puede crear su cuenta en `/registro`. Cada cuenta tiene sus propias cuentas, tarjetas,
categorías, comercios y movimientos: nadie ve los datos de otra persona.

- **Recuperar la contraseña**: «¿Olvidaste la contraseña?» manda un enlace por email (vence en 1 hora,
  sirve una vez, cierra las demás sesiones). Se envía con Brevo (`BREVO_API_KEY` y `EMAIL_FROM`, ver
  [docs/DEPLOY.md](docs/DEPLOY.md)). En desarrollo, sin clave, el email con el enlace se muestra en la
  consola de `npm run dev`.
- **Por línea de comandos** (con acceso a la base): `npm run user:create` crea una cuenta y
  `npm run user:reset-password -- --email tu@email.com` cambia la contraseña y cierra las sesiones
  (la contraseña puede pasarse en `NEW_PASSWORD`).

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
| `npm run user:create` · `npm run user:reset-password` | Alta de una cuenta y cambio de contraseña desde la terminal |
| `npm run voice:check` | Prueba la transcripción e interpretación reales configuradas en `.env` |
| `npm run icons` | Regenera los íconos PNG de la PWA |

## Voz

Un toque en el micrófono graba (hasta 60 s); también se puede escribir la frase. Se transcribe con OpenAI
(`gpt-transcribe`) o, **sin clave, gratis con el reconocimiento de voz del navegador**; se interpreta con
Claude (o OpenAI, o el intérprete local por reglas, gratis) y una validación
determinística verifica que cada importe, fecha, comercio y cuenta se haya dicho. Lo dudoso queda para
revisar antes de guardar. El audio no se guarda.

| Variable | Para qué |
|---|---|
| `OPENAI_API_KEY` | Transcripción del audio. Sin ella dicta el navegador (Chrome, Edge, Safari) y, si no puede, se escribe |
| `ANTHROPIC_API_KEY` | Interpretación con Claude. Sin ella se usa el intérprete local (siempre pide revisión) |
| `VOICE_INTERPRETER` | `auto` (por defecto), `anthropic`, `openai` o `local` |

Para probar los proveedores reales configurados (consume créditos):

```bash
npm run voice:check                                   # interpreta una frase de ejemplo
npm run voice:check -- --text "Farmacity 69.500 con la visa"
npm run voice:check -- --audio ./grabacion.m4a        # transcribe y después interpreta
```

Contrato y reglas: [docs/VOICE.md](docs/VOICE.md).

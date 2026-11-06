# Plan de implementación

Cada fase termina con `npm run lint`, `npm run typecheck` y las pruebas correspondientes en verde.
El avance real se registra en [PROGRESS.md](PROGRESS.md).

## Fase 0 — Análisis y planificación

- Inspección del entorno: Node 22.15, npm 11, sin PostgreSQL ni Docker, sin privilegios de administrador.
- Verificación de versiones y compatibilidades (ver ARCHITECTURE §2).
- Documentos: PRODUCT_SPEC, ARCHITECTURE (incluye contratos de API), DATABASE, BUSINESS_RULES.
- Esquema Prisma completo, migración inicial con restricciones `CHECK`, base local embebida.

**Verificación:** `prisma validate`, migración aplicada, sin divergencia del esquema.

## Fase 1 — Fundaciones

- Variables de entorno validadas con Zod (`src/server/env.ts`) y `.env.example`.
- Cliente Prisma con adaptador `pg` (singleton).
- Núcleo: `lib/money.ts`, `lib/dates.ts`, `AppError`, `route()` para Route Handlers.
- Autenticación: scrypt, sesiones, `requireUser`, login/logout, `proxy.ts`, scripts de alta y
  recuperación de usuaria, rate limiting.
- Datos iniciales por usuaria: categorías, subcategorías y comercios.
- Sistema de diseño: tokens de color y tipografía, componentes base, navegación inferior y lateral.
- PWA: manifest, íconos, service worker (Serwist), página offline, instrucciones de instalación.
- Infraestructura de pruebas: Vitest (unit + integración con PostgreSQL embebido) y Playwright.

**Verificación:** login funcional de punta a punta, pruebas de dinero/fechas/sesión.

## Fase 2 — Motor financiero

- Reglas puras: efectos de movimientos, saldos, ciclo y resúmenes de tarjeta, cuotas.
- Servicios: cuentas, tarjetas (incluida deuda inicial y fechas de resumen), categorías (con
  reasignación), comercios (aprendizaje), movimientos (alta idempotente, edición con versión, borrado,
  confirmación), ajustes de saldo, configuración inicial.
- Route Handlers y pantallas: configuración inicial, alta rápida, movimientos con filtros, cuentas,
  tarjetas y pago de resumen, categorías, comercios.

**Verificación:** casos financieros 1–9, 14 y 16 en pruebas de integración; ejemplo crítico de tarjeta.

## Fase 3 — Dashboard

- Servicio de informes: totales del mes, fijos/variables, por categoría, comparación, proyección,
  patrimonio, pendientes, próximos vencimientos, últimos movimientos.
- Pantalla de inicio con selector de mes y gráfico de gasto acumulado.

**Verificación:** casos 14 y 15; identidad de control del patrimonio.

## Fase 4 — Voz

- Analizador de números y fechas en español, intérprete local, validación determinística.
- Adaptadores: OpenAI (transcripción) y Claude (interpretación) detrás de interfaces.
- Servicio de voz: procesar audio o texto, revisar, confirmar, deshacer, descartar; idempotencia.
- UI: botón de micrófono, grabación con estados, revisión de borradores, escritura alternativa.

**Verificación:** caso 17 con proveedores falsos; pruebas unitarias del analizador.

## Fase 5 — Automatización

- Recurrentes: calendario, claves de período, generación idempotente, pendientes, UI de reglas.
- Cuotas en la UI de tarjetas; objetivos de ahorro y asignaciones; ahorro mensual y acumulado.
- Recordatorios en la app: vencimientos de tarjetas y recurrentes próximos.
- Cron diario.

**Verificación:** casos 10–13.

## Fase 6 — Offline y estabilización

- Outbox en IndexedDB, sincronización, estados y resolución de conflictos.
- E2E: flujo completo, tarjeta y pago, voz, offline.
- Seguridad (headers, revisión de endpoints), rendimiento, accesibilidad.
- Documentación de despliegue.

**Verificación:** caso 18; suite E2E en verde; build de producción con service worker.

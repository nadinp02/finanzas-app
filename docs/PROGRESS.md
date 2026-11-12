# Progreso

Última actualización: 2026-11-05 (tercera jornada). Fases 1 a 3 terminadas. **Fase 4 (voz) implementada y
verificada con proveedores falsos y el intérprete local; falta validarla con OpenAI y Anthropic reales y en
un iPhone físico** (ver «Fase 4: estado y validación pendiente»). No se avanzó a la fase 5. Compila, pasa
lint y todas las pruebas, y no hay procesos en ejecución.

## Estado por fase

| Fase | Estado | Resumen |
|---|---|---|
| 0 — Análisis y planificación | **Terminada** | Documentación, modelo de datos, migración inicial |
| 1 — Fundaciones | **Terminada** | Auth, sesiones, PWA, sistema de diseño, infraestructura de pruebas (Vitest + Playwright) |
| 2 — Motor financiero | **Terminada** | Motor, servicios, API y pantallas; integración + E2E de login, configuración inicial, carga manual, tarjeta y configuración |
| 3 — Dashboard | **Terminada** | Informes, `GET /api/dashboard` e inicio con selector de mes, gráfico, categorías, patrimonio y vencimientos. Los recurrentes se suman a proyección y vencimientos en la fase 5 |
| 4 — Voz | **Implementada, en revisión** | Todo el flujo funciona y está probado con transcripción falsa e intérprete local. Los adaptadores reales (OpenAI, Claude) tienen pruebas de contrato pero no se ejecutaron contra los servicios: no se marca terminada |
| 5 — Automatización | Pendiente | Esquema y tablas de idempotencia ya existen |
| 6 — Offline y estabilización | Adelantada en parte | Cola offline e IndexedDB hechas; faltan E2E, headers de seguridad, cron. Despliegue documentado (DEPLOY.md), sin ejecutar |
| Extra — Cuentas para varias personas | **Implementada** | Registro público, recuperación de contraseña por email (Brevo/Resend), guía de Vercel + Neon. Integración + E2E con el email escrito a un archivo; falta probar el envío real con Brevo |

Ninguna fase se marca terminada hasta recorrer sus flujos en el navegador y cubrirlos con E2E.

## Verificación al cierre de la jornada (2026-11-05)

| Chequeo | Resultado |
|---|---|
| `npx tsc --noEmit` (app) y `-p src/worker` (service worker) | Sin errores |
| `npx eslint` | 0 errores, 0 advertencias |
| `npx vitest run` | **227/227** pruebas en 16 archivos (175 unitarias, 52 de integración) |
| `npx playwright test` | **22/22** E2E en 7 archivos (build de producción + PostgreSQL embebido) |
| `npx next build` | Compila sin errores en el log. Rutas: shells estáticos, prerender parcial en páginas con sesión, API dinámica |
| `npx serwist build` | Genera `public/sw.js` con 42 URLs precacheadas (1,9 MB), incluye `/~offline` |
| `npm run voice:check` | Corre sin claves (intérprete local). Con claves prueba los proveedores reales: **no ejecutado** |
| Procesos | Ninguno en ejecución (el PostgreSQL de E2E se detiene con `pg_ctl` y su carpeta se borra) |
| Git | Repositorio inicializado, **sin commits**: todo está sin confirmar a la espera de revisión |

### Pruebas automatizadas

| Archivo | Pruebas | Cubre |
|---|---|---|
| `src/lib/money.test.ts` | 30 | Decimales exactos, entrada argentina, formato, cuotas con resto, redondeo |
| `src/lib/dates.test.ts` | 9 | Zona horaria Córdoba, aritmética de fechas, semanas ISO, formatos en español |
| `src/modules/cards/rules.test.ts` | 11 | Ciclo, períodos, fechas ajustadas, resúmenes, pago total/parcial, vencido, deuda inicial, cuotas, saldo a favor, límite |
| `src/modules/transactions/rules.test.ts` | 9 | Efectos por tipo, saldos agregados, ejemplo crítico, cuentas válidas por tipo |
| `src/components/money-input.test.tsx` | 6 | Escritura de importes con formato argentino (jsdom + Testing Library) |
| `src/lib/api-client.test.ts` | 2 | Solo una sesión vencida redirige al login; un 401 de credenciales vuelve al formulario |
| `tests/integration/auth.test.ts` | 7 | Alta, scrypt, autenticación, sesiones (hash, renovación, revocación), rate limiting |
| `src/modules/reports/rules.test.ts` | 18 | Totales, rangos, comparación a la misma altura, proyección (§8.2), gasto por categoría raíz, serie acumulada |
| `tests/integration/finance-engine.test.ts` | 21 | Casos financieros contra PostgreSQL real (ver tabla siguiente) y orden de cuentas |
| `tests/integration/reports.test.ts` | 7 | Casos 14 y 15, mes anterior al inicio, comparación, proyección con pendientes, vencimientos, identidad de control del patrimonio |
| `src/modules/voice/numbers.test.ts` | 35 | Importes en palabras, dígitos y jerga («lucas», «palo», «50k»), centavos con «con», varios importes, cuotas; fechas y horas que no son importes |
| `src/modules/voice/dates.test.ts` | 6 | Hoy, ayer, anteayer, días de la semana, «el 15», «15 de octubre», «3/11», «hace 3 días», expresiones vagas |
| `src/modules/voice/rules.test.ts` | 32 | Validación determinística: nada se inventa (importe, fecha, comercio, cuenta, cuotas), ambigüedades, tipo, confianza, avisos; intérprete local |
| `src/modules/voice/providers/providers.test.ts` | 14 | Contrato de los adaptadores con `fetch`/SDK simulados: forma de cada solicitud a OpenAI y Anthropic, rechazos, errores; selección de proveedores |
| `src/modules/voice/recording.test.ts` | 3 | Formato de grabación por navegador (Safari: mp4), errores de micrófono |
| `tests/integration/voice.test.ts` | 17 | Caso 17, reintentos sin duplicar, confirmación paralela, guardado automático y deshacer, importe inventado, duplicados, respaldo local, reproceso de fallidas y abandonadas, revisión parcial, errores del motor por ítem, descarte, aislamiento entre usuarias |

### E2E (Playwright, `tests/e2e`)

`tests/e2e/support/server.ts` (lanzado como `webServer`) levanta un PostgreSQL embebido en el puerto
5435, aplica las migraciones, siembra una usuaria por escenario con los servicios reales (`seed.ts`) y
arranca `next start` en el 3100 sobre el build de producción. `global-teardown.ts` apaga el cluster con
`pg_ctl`. `E2E_REUSE_SERVER=1` reutiliza un servidor ya levantado (solo para depurar: no reinicia datos).

| Archivo | Pruebas | Cubre |
|---|---|---|
| `login.spec.ts` | 3 | Redirección con `next`, credenciales incorrectas, cookie `__Host-` httpOnly/Lax, cierre de sesión |
| `onboarding.spec.ts` | 1 | Bienvenida obligatoria, cuentas con saldo, tarjeta con deuda previa, disponible/deuda/patrimonio, cuenta habitual |
| `manual-entry.spec.ts` | 5 | Gasto, ingreso, transferencia, validación de categoría, edición, borrado, «Deshacer», búsqueda, filtros, ajuste de saldo |
| `card.spec.ts` | 3 | Ejemplo crítico (compra 69.500 → pago desde el banco: 500.000 → 430.500, deuda 0, un solo gasto), cuotas, pago parcial |
| `settings.spec.ts` | 4 | Categoría con reasignación, comercio con categoría habitual sugerida, alta de cuenta y orden, cuenta habitual, cambio de contraseña |
| `dashboard.spec.ts` | 1 | Totales del mes, categorías, gráfico, vencimiento de tarjeta, patrimonio y ahorro acumulado, navegación entre meses, mes anterior al inicio |
| `voice.spec.ts` | 5 | Caso 17 con grabación real del navegador (micrófono simulado de Chromium), corrección y guardado; corte de conexión con reintento sin duplicar y aviso de duplicado; ingreso escrito con fecha y cuenta, guardar y deshacer; dudas, cierre y retomar desde el inicio; frase sin importes. Sin desborde horizontal |

### Casos financieros obligatorios

| # | Caso | Estado |
|---|---|---|
| 1 | Gasto en efectivo | ✅ Integración + E2E |
| 2 | Ingreso | ✅ Integración + E2E |
| 3 | Transferencia entre cuentas | ✅ Integración (no altera disponible ni gastos) + E2E |
| 4 | Compra con tarjeta | ✅ Integración + E2E |
| 5 | Pago del resumen | ✅ Integración + E2E (ejemplo crítico: banco 500.000 → 430.500, deuda 0, gasto 69.500 y no 139.000) |
| 6 | Pago parcial | ✅ Integración (remanente, arrastre y vencido) + E2E |
| 7 | Compra en cuotas | ✅ Integración (gasto total en la fecha de compra, una cuota por resumen) + E2E |
| 8 | Editar movimiento | ✅ Integración (recalcula saldos, control de versión, rehace cuotas) + E2E |
| 9 | Eliminar movimiento | ✅ Integración (restaura saldos, borra cuotas, audita) + E2E |
| 10 | Crear gasto recurrente | Pendiente (fase 5) |
| 11 | Evitar duplicación de recurrente | Pendiente (fase 5) |
| 12 | Crear objetivo de ahorro | Pendiente (fase 5) |
| 13 | Asignar dinero al objetivo | Pendiente (fase 5) |
| 14 | Consultar período anterior | ✅ Integración (informe del mes cerrado con saldos a su cierre) + E2E (navegación) |
| 15 | Ahorro mensual | ✅ Integración (transferencias, pagos y ajustes no cuentan) + E2E |
| 16 | Saldos | ✅ Integración (a distintas fechas, cuentas abiertas después, patrimonio) |
| 17 | Voz con varios movimientos | ✅ Integración + E2E con proveedores falsos e intérprete local. Falta con proveedores reales |
| 18 | Reintento offline sin duplicar | Parcial: idempotencia por `clientId` probada en el servicio; falta E2E offline |

Además: validaciones (fecha futura, anterior a la apertura, ingreso a tarjeta, categoría de otro tipo,
transferencia a tarjeta, cuotas sin tarjeta, cuentas de otra usuaria), `CHECK` de la base, borrado de
cuenta con historia, ajuste de saldo, aprendizaje de comercios, reasignación de categorías y
configuración inicial con deuda de tarjeta y cuotas previas.

## Qué está implementado

### Fase 0
- Docs: PRODUCT_SPEC, ARCHITECTURE (con contratos de API y registro de decisiones), DATABASE,
  BUSINESS_RULES, IMPLEMENTATION_PLAN.
- Esquema Prisma de 17 tablas y migración `init` con 20 restricciones `CHECK`. Prisma no las detecta como
  divergencia (verificado).

### Fase 1
- Entorno validado con Zod (`src/server/env.ts`), cliente Prisma perezoso con adaptador `pg`,
  `AppError` y wrapper de Route Handlers (`src/server/http.ts`): sesión, mismo origen, rate limit,
  límite de tamaño, mapeo de errores sin filtrar datos financieros a los logs.
- Autenticación: scrypt (parámetros OWASP), sesiones con token hasheado y renovación deslizante,
  `requireUser`/`requireOnboardedUser`, `proxy.ts`, login/logout, rate limit por IP y email en
  PostgreSQL, auditoría.
- CLI: `npm run user:create` y `npm run user:reset-password` (contraseña oculta o `NEW_PASSWORD`).
- Datos iniciales por usuaria: 39 categorías (14 de gasto con subcategorías, 6 de ingreso) y 32
  comercios argentinos con categoría habitual y variantes para la voz.
- Sistema de diseño: tokens OKLCH (papel cálido, tinta, verde para ingresos, bordó para alertas),
  Manrope, componentes shadcn/Base UI adaptados a 44 px táctiles, navegación inferior con micrófono
  central y barra lateral en escritorio.
- PWA: manifest con accesos directos, íconos 192/512/maskable/apple-touch, service worker Serwist
  (modo configurador, `/api/*` solo por red, fallback `/~offline`), página de instalación.
- Pruebas: Vitest con proyectos `unit` e `integration`; la integración levanta un PostgreSQL 18
  descartable y aplica las migraciones.

### Fase 2
- Reglas puras: efectos contables, saldos desde agregados, cuentas válidas por tipo, ciclo de tarjeta,
  resúmenes, pagos, cuotas, deuda inicial (`src/modules/*/rules.ts`).
- Servicios (`service.ts`): cuentas (saldos a fecha, alta, edición, borrado con protección, ajuste),
  tarjetas (alta con deuda inicial y cuotas previas, edición, fechas reales de resumen, estado
  completo), categorías (árbol de un nivel, borrado con reasignación), comercios (resolución por
  nombre/variante, aprendizaje), movimientos (alta idempotente, edición con versión, confirmación de
  pendientes, borrado, lista con filtros y cursor), configuración inicial y preferencias.
- API: 21 Route Handlers (ver ARCHITECTURE §13), incluido `GET /api/health`.
- Pantallas: configuración inicial (`/bienvenida`), movimientos con filtros y paginación, hoja de alta y
  edición rápida (importe → categoría → guardar, con comercio que sugiere su categoría habitual, cuotas,
  fechas rápidas y «Deshacer»), cuentas, detalle de cuenta con ajuste de saldo, detalle de tarjeta (a
  pagar, próximo resumen, cuotas futuras, límite, historial, pago, fechas del resumen), categorías,
  comercios, preferencias (cuenta habitual, guardado automático de voz, contraseña) y cierre de sesión
  que borra datos locales.

### Fase 3
- Reglas puras (`src/modules/reports/rules.ts`): totales (fijos/variables, ahorro, ajustes informativos),
  rango del informe (desde el inicio del registro; hasta hoy en el mes en curso), comparación con el
  mes anterior a la misma altura, proyección §8.2 con enteros y un solo redondeo, gasto por categoría
  raíz, gasto acumulado por día.
- Servicio (`service.ts`): `getDashboard` y `getNetWorthBreakdown` (patrimonio inicial + ahorro
  acumulado + ajustes = patrimonio). Los saldos de un mes cerrado se toman a su último día.
- `GET /api/dashboard?month=YYYY-MM` (un mes futuro responde 422).
- Inicio (`/` y `/?mes=YYYY-MM`): selector de mes (desde el mes de inicio hasta el actual), pendientes y
  resúmenes a pagar, gastos con apertura fijos/variables, ingresos, ahorro, comparación, proyección,
  gráfico de gasto acumulado contra el mes anterior (Recharts, con leyenda, línea punteada para el mes
  anterior y tooltip), categorías con enlace a los movimientos filtrados, patrimonio con ahorro
  acumulado y últimos movimientos. Un mes anterior al inicio muestra un estado vacío explicativo.

### Fase 4 (voz)
Contrato completo en [VOICE.md](VOICE.md).

- **Analizador de español** (`numbers.ts`, `dates.ts`): importes en palabras, dígitos y jerga; fechas
  relativas y absolutas; cuotas. Distingue importes de cantidades, fechas y horas.
- **Validación determinística** (`rules.ts`): cada importe, fecha, comercio, cuenta y cantidad de cuotas
  tiene que rastrearse hasta la transcripción; lo que no se dijo no se guarda. Las ambigüedades (cuenta
  ambigua o inexistente, fecha vaga, tipo contradictorio, baja confianza, posible duplicado) dejan la
  carga en revisión con el motivo.
- **Proveedores intercambiables** (`providers/`): interfaces `Transcriber` y `TransactionInterpreter`;
  OpenAI `gpt-transcribe` (multipart con `languages[]=es`, `keywords[]` y `prompt`, verificado contra la
  referencia oficial), Claude (`beta.messages.parse` + Zod, `effort: low`, `fallbacks: "default"`), OpenAI
  Responses API (`json_schema` estricto) e intérprete local. Prompt y formato comunes. `VOICE_INTERPRETER`
  elige; si el principal falla se usa el local.
- **Caso de uso** (`service.ts`): idempotencia por `clientRequestId` (con `attempts` como token para
  reprocesar fallidas o abandonadas sin carreras), guardado automático en una transacción si nada está en
  duda, confirmación idempotente con bloqueo de fila, deshacer (si nada se editó) y descartar.
- **API**: `GET/POST /api/voice`, `POST /api/voice/text`, `GET /api/voice/:id`,
  `POST /api/voice/:id/confirm|undo|discard`. Límite de 30 cargas cada 10 minutos; `maxDuration = 60`.
- **UI**: un toque en el micrófono graba (el permiso y el `AudioContext` se piden dentro del gesto, como
  exige iOS); estados listo, grabando (tiempo y nivel), procesando, revisión editable, guardado con
  «Deshacer» y error con reintentar, grabar de nuevo, escribir o carga manual; sin conexión ofrece la carga
  manual. Las cargas en revisión aparecen en el inicio y se retoman. Escritura alternativa.
- **Migración** `20261105180000_voice_attempts` (`attempts` y `started_at` en `voice_entries`).
- `npm run voice:check`: prueba los proveedores reales configurados, sin base de datos.

### Adelantado de la fase 6
- Cola offline en IndexedDB (`src/modules/offline`): si no hay red el alta se encola con su `clientId`,
  se sincroniza al abrir la app, al volver la conexión y al volver a primer plano (Web Locks entre
  pestañas, espera exponencial), muestra estados pendiente/sincronizando/error con reintentar y
  descartar. Datos de referencia cacheados para cargar sin conexión, también desde `/~offline`.

## Errores y pendientes conocidos

| # | Pendiente | Fase |
|---|---|---|
| 2 | `/ahorros` y `/recurrentes` están enlazadas desde «Más» y la barra lateral pero todavía no existen (404) | 5 |
| 5 | Headers de seguridad y CSP documentados en ARCHITECTURE §10 pero **no aplicados** en `next.config.ts` | 6 |
| 6 | `/api/cron/daily`, recurrentes, ahorros y recordatorios sin implementar | 5 |
| 7 | Confirmaciones de borrado con `window.confirm` (funciona en iOS; mejorable con `AlertDialog`) | 6 |
| 8 | Primitivas shadcn sin uso por ahora (dialog, alert-dialog, tabs, popover, dropdown-menu, badge, separator, toggle-group): revisar al terminar | 6 |
| 9 | Hay un `package-lock.json` en la carpeta padre `D:\Sistemas\htdocs`, ajeno al proyecto: Next lo ignora y avisa en el build. Si molesta, fijar `turbopack.root`/`outputFileTracingRoot` | — |
| 10 | La búsqueda de movimientos distingue acentos («almacen» no encuentra «Almacén»): `contains` + `insensitive` solo ignora mayúsculas. Evaluar `unaccent` o una columna normalizada | 6 |
| 11 | En E2E (`serviceWorkers: "block"`) Playwright hace que `register()` resuelva `undefined` y Serwist registra un error de consola. Es un artefacto de la prueba; en navegadores reales no ocurre | — |

Resuelto el 2026-11-04: `embedded-postgres` dejaba procesos `io_worker` de PostgreSQL 18 huérfanos en
Windows al detenerse; ahora pruebas y `db:dev` se detienen con `pg_ctl` (`scripts/lib/pg.ts`).

Resuelto el 2026-11-05 (encontrado al recorrer la app en el navegador):

- **El login con contraseña incorrecta no mostraba el error**: `readResponse` redirigía a `/login` ante
  cualquier 401 y recargaba la página, borrando el mensaje. Ahora solo redirige con `UNAUTHORIZED`
  (sesión vencida); `INVALID_CREDENTIALS` llega al formulario (`src/lib/api-client.ts`).
- **Orden de cuentas mezclado** («Efectivo, Visa, Banco»): las tarjetas y las cuentas creadas después se
  guardaban con `sortOrder` 0. Ahora las altas van al final (`nextSortOrder`) y los datos de referencia
  ponen las tarjetas después de las cuentas (`getBootstrap`).
- **Errores falsos en el log del build**: los wrappers de Route Handlers atrapaban el error interno con
  el que Next marca una ruta como dinámica durante el prerender y lo registraban como 500. Ahora lo
  relanzan con `unstable_rethrow` (`src/server/http.ts`).

Resuelto el 2026-11-05, tercera jornada (encontrado por las E2E y las capturas en viewport de iPhone):

- **La página quedaba más ancha que el celular** cuando una fila de movimiento tenía un subtítulo largo
  («Transporte › Combustible · Efectivo»). Las grillas del feed y del inicio dejaban crecer a sus ítems al
  ancho mínimo del texto sin truncar. En el celular eso corre toda la vista y los toques caen en otro lado.
  Era de la fase 2 y se notó con las categorías con subcategoría que asigna la voz. Ahora usan
  `grid-cols-1`, y las E2E de voz verifican que no haya desborde horizontal.
- **Lo mismo en el aviso de carga por voz pendiente** (transcripción truncada) y en las tarjetas de
  revisión (un `<fieldset>` tiene `min-inline-size: min-content` por defecto): `min-w-0`.
- **La suite E2E chocaba con el límite de intentos de login por IP** (20 cada 15 minutos) al pasar de 17 a
  22 pruebas. Era la protección funcionando: ahora cada usuaria entra por el formulario una vez y las
  pruebas siguientes reutilizan su sesión (`signIn`). El login se sigue probando completo en
  `login.spec.ts`.

## Fase 4: estado y validación pendiente

**Qué está verificado**: todo el flujo con la transcripción falsa (`VOICE_STT_PROVIDER=fake`) y el
intérprete local real: grabación con `MediaRecorder` en Chromium (micrófono simulado), envío, reintentos,
validación, revisión, guardado, deshacer, descarte y retomar. Los adaptadores reales tienen pruebas de
contrato (forma exacta de cada solicitud y manejo de respuestas y errores) con `fetch` y SDK simulados.

**Qué no está verificado** (por eso la fase no está terminada):

1. **Llamadas reales a OpenAI y Anthropic**: no hay claves configuradas. No se midió la calidad de la
   transcripción ni de la interpretación, ni la latencia o el costo. El modelo por defecto para interpretar
   con OpenAI (`gpt-6-luna`) sale de la documentación oficial, pero no se probó.
2. **Safari en un iPhone físico**: las E2E usan Chromium con viewport de iPhone. El formato `audio/mp4`,
   el permiso de micrófono, el modo PWA instalada y la interrupción por llamadas no se probaron en un
   dispositivo. El micrófono exige HTTPS: en el iPhone hace falta un despliegue o un túnel, porque
   `http://IP-local` no sirve.

**Limitaciones conocidas**

- El intérprete local es heurístico: separa por importe y usa palabras clave. Sin separadores puede asignar
  mal el texto de cada movimiento, y por eso siempre pide revisión.
- La detección de duplicados compara solo contra movimientos guardados, no contra otras cargas en revisión.
- Las transcripciones y los borradores se guardan sin límite de tiempo. Purgar las cargas resueltas
  antiguas queda para el cron de la fase 5/6.
- «Deshacer» no vence; se bloquea si alguno de los movimientos se editó.
- La voz necesita conexión: no hay cola offline para audio (sí para la carga manual).
- **Sin claves (gratis)**: sin `OPENAI_API_KEY` se dicta con el reconocimiento de voz del navegador
  (VOICE.md §9 bis) y sin `ANTHROPIC_API_KEY` interpreta el intérprete local. Probado con un
  `SpeechRecognition` simulado en Chromium (E2E) y pruebas del hook; falta probarlo hablando en un
  teléfono real (Chrome Android y Safari iOS, que exige tener Siri/dictado activado).
- Por voz solo se registran gastos e ingresos. Los pagos de tarjeta y las transferencias se avisan y se
  cargan a mano.

**Pasos para conectar los proveedores reales**

1. Crear las claves en https://platform.openai.com/api-keys y https://console.anthropic.com/ y cargarlas
   en `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`). En producción, como variables de entorno del
   hosting (nunca en el cliente).
2. Opcional: `ANTHROPIC_MODEL=claude-haiku-5-5` (más barato y rápido) o `VOICE_INTERPRETER=openai`.
3. `npm run voice:check`, y después `npm run voice:check -- --text "..."` con frases propias. Revisar que
   la validación no marque dudas en frases claras.
4. Grabar notas de voz en el iPhone (app Notas de voz, .m4a) y correr
   `npm run voice:check -- --audio archivo.m4a`: comprueba transcripción e interpretación con audio real.
5. Reiniciar `npm run dev` y probar en la app desde la computadora. En el iPhone, abrirla por HTTPS
   (despliegue de prueba o túnel), dar permiso al micrófono y repetir el caso 17, fechas relativas, cuentas
   mencionadas, una frase ambigua y el guardado automático (Más › Preferencias).
6. Si todo responde bien, marcar la fase 4 como terminada en este archivo.

## Decisiones técnicas tomadas

Detalle y justificación en ARCHITECTURE §14. Resumen de las que surgieron de verificar el entorno:

- **TypeScript 6.0.3** y **ESLint 9**: TS 7 y ESLint 10 todavía no son compatibles con
  `typescript-eslint` y los plugins de `eslint-config-next`.
- **Prisma 7.10.1**: la etiqueta `latest` del CLI apunta a una RC de la 8.
- **jsdom 27**: jsdom 30 exige Node ≥ 22.22 y este equipo tiene 22.15.
- **Cache Components activado** (modelo por defecto de Next 16.4): contenido con sesión dentro de
  `<Suspense>`, incluida la navegación.
- **Serwist en modo configurador**: `@serwist/turbopack` es incompatible con Cache Components.
- **CSP sin nonce**: el prerender parcial no admite nonces.
- **OpenAI `gpt-transcribe` por `fetch`**: los modelos `gpt-4o-*-transcribe` están deprecados y el SDK
  `openai` instala ~120 paquetes (AWS, Google) como dependencias obligatorias.
- **Interpretación con Claude** (`claude-opus-5-5`, configurable; `claude-haiku-5-5` como opción
  económica) + validación determinística + intérprete local de respaldo.
- **Cuentas y tarjetas en una tabla**, saldos derivados (nunca guardados), dinero como `NUMERIC(14,2)`
  ↔ string ↔ `bigint`.
- **Offline: solo altas** sin conexión; ediciones y borrados en línea con control de versión
  (BUSINESS_RULES §13). A confirmar con la usuaria; extenderlo implica cachear movimientos localmente.
- **Edición de movimientos en una hoja inferior** en lugar de la ruta `/movimientos/[id]`.
- **Proyección (fase 3)**: «meses con datos» = meses con al menos un movimiento confirmado, buscados
  hasta 12 meses atrás; los días de cada mes se cuentan desde el inicio del registro. En el mes en curso
  `d` son los días registrados (si el registro empezó este mes, no el día del mes). Los esperados son
  por ahora solo los pendientes del mes; las ocurrencias recurrentes se suman en la fase 5.
- **Deuda en el resumen de Cuentas** se muestra como «−$» (resta del patrimonio); en el inicio y en
  cada tarjeta, como monto adeudado sin signo.
- **Voz (fase 4)**: un toque en el micrófono ya graba (iOS exige pedir el micrófono dentro del gesto). Sin
  mención de cuenta se usa la cuenta habitual (BUSINESS_RULES §12.2) y se informa; sin fecha, hoy. La
  interpretación también puede hacerla OpenAI (`VOICE_INTERPRETER=openai`) con el mismo prompt. El
  intérprete local nunca guarda solo. Un importe que no se puede rastrear hasta lo dicho queda vacío en
  lugar de sugerido.

## Configuración externa necesaria

| Qué | Para qué | Estado |
|---|---|---|
| `OPENAI_API_KEY` | Transcripción de audio (y opcionalmente interpretación) | Opcional, pago por uso: sin ella dicta el navegador gratis |
| `ANTHROPIC_API_KEY` | Interpretación de la voz con Claude | Opcional, pago por uso (aparte de la suscripción a Claude): sin ella se usa el intérprete local, que siempre pide revisión |
| PostgreSQL administrado + `DATABASE_URL` | Producción | Falta elegir proveedor |
| Proyecto en Vercel | Despliegue | Pendiente |
| `CRON_SECRET` | Cron diario | Opcional |

## Entorno local

- `.env` (no versionado) apunta al PostgreSQL local: `postgresql://postgres:postgres@localhost:5433/finanzas`.
- La base local (`.data/postgres`, no versionada) tiene la migración aplicada y una cuenta de prueba
  `demo@cuentasclaras.local` sin configuración inicial. Su contraseña se puede redefinir con
  `npm run user:reset-password -- --email demo@cuentasclaras.local`.
- Playwright Chromium está instalado (se usa para E2E y para `npm run icons`).
- E2E: `npm run build` y después `npm run test:e2e`. El servidor de E2E usa transcripción falsa (caso 17)
  e intérprete local, y pisa las claves de `.env` con valores vacíos. Usa los puertos 3100 y 5435 y `.data/postgres-e2e`,
  que se borra al terminar. Playwright lo apaga bien solo; si se corta el servidor E2E desde afuera en
  Windows pueden quedar vivos `next start` o algún `postgres.exe` hijo: `taskkill /T /F` sobre el
  proceso padre y `taskkill /F` sobre el `postgres.exe` que quede.

## Próximos pasos (en orden)

1. **Revisión de la fase 4 por la usuaria** y validación con proveedores reales y un iPhone físico (pasos
   en «Fase 4: estado y validación pendiente»). Recién entonces se marca terminada.
2. Fase 5 (en pausa hasta validar la voz): recurrentes, ahorros y objetivos, recordatorios y cron. Casos 10
   a 13. Resuelve `/ahorros` y `/recurrentes` (hoy 404), suma las ocurrencias recurrentes a la proyección y
   a los vencimientos, y puede purgar cargas por voz resueltas antiguas.
3. Fase 6: headers de seguridad y CSP, E2E offline (caso 18), búsqueda sin acentos, `AlertDialog` en
   lugar de `window.confirm`, accesibilidad, rendimiento y guía de despliegue en Vercel.

## Cuentas para varias personas (2026-11-11)

- **Registro público** en `/registro` (antes solo por terminal). Cada cuenta arranca con sus propias
  categorías y comercios y pasa por la configuración inicial. Los datos ya estaban aislados por
  `user_id`; se sumó una prueba de que dos cuentas no comparten categorías.
- **Recuperación por email**: tabla `password_reset_tokens`, enlace de 1 hora y un solo uso. Pruebas de
  integración (hash, un solo uso con usos simultáneos, vencido, anulado por uno nuevo, otra usuaria) y
  E2E (pedir el enlace, leerlo del email, cambiar la contraseña, la anterior deja de servir, el enlace no
  se reusa, email sin cuenta no recibe nada).
- **Email**: Brevo por defecto porque permite enviar a cualquier dirección verificando solo el
  remitente; con un `*.vercel.app` no se puede verificar dominio (Resend lo exige).
- **Vercel**: `vercel-build` aplica las migraciones antes de compilar; `prisma.config.ts` usa
  `DATABASE_URL_UNPOOLED` (conexión directa de Neon) para migrar.

**Falta verificar**: el despliegue real en Vercel + Neon y la entrega de emails con Brevo (incluido si
llegan a spam con un remitente de Gmail).

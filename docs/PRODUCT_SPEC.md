# Especificación de producto — Cuentas Claras

Aplicación web de finanzas personales, mobile-first, instalable como PWA en iPhone y Android.
El nombre del producto es configurable (`APP_NAME` en `src/lib/app.ts`).

## 1. Objetivo

Registrar ingresos y gastos con tan poco esfuerzo que se pueda hacer todos los días, y entender con
claridad:

- cuánto ingresa y cuánto se gasta por mes, y en qué categorías;
- qué gastos son fijos y cuáles variables;
- cuánto dinero hay disponible, cuánto se debe en tarjetas y cuál es el patrimonio neto;
- cuánto se ahorra por mes y cuánto se acumuló desde que empezó el registro;
- cómo evolucionan las finanzas en el tiempo.

La carga por voz es la funcionalidad diferencial: decir *"Farmacity sesenta y nueve mil quinientos"*
registra un gasto de $ 69.500 en Salud › Farmacia con fecha de hoy.

## 2. Decisiones de producto (fijas)

| Característica | Decisión |
|---|---|
| Usuarios | Una única usuaria; el modelo ya es multiusuario (`user_id` en todas las tablas) |
| Moneda | ARS. El modelo guarda `currency` para habilitar otras monedas a futuro |
| Ingresos y gastos | Fijos y variables |
| Medios de pago | Efectivo, transferencias, débito, billeteras y tarjetas de crédito |
| Tarjetas de crédito | El gasto se registra en la fecha de compra (criterio de lo devengado) |
| Presupuestos | Fuera del MVP |
| Ahorros | Mensuales, acumulados y objetivos |
| Inicio del registro | Desde los saldos actuales (configuración inicial) |
| Plataforma | PWA, prioridad iPhone, diseño mobile-first |
| Idioma / región | Español de Argentina, zona horaria `America/Argentina/Cordoba` |
| Formato monetario | `$ 69.500` cuando no hay centavos, `$ 69.500,50` cuando los hay |

## 3. Principios de experiencia

1. **Cargar es más rápido que olvidarse.** Un gasto manual se registra con: importe → categoría →
   guardar. Cuenta, fecha y tipo vienen precargados con valores habituales.
2. **La voz es el camino principal.** El micrófono está siempre a un toque, en el centro de la
   navegación inferior.
3. **Nada se inventa.** Si la voz no deja claro el importe, la fecha, el tipo o el medio de pago, la
   app pide confirmación en lugar de suponer.
4. **Conceptos que no se mezclan.** Dinero disponible, deuda de tarjetas, patrimonio, ahorro del mes,
   ahorro acumulado y dinero asignado a objetivos se muestran por separado y con su definición.
5. **Funciona sin conexión** para cargas manuales; sincroniza sola al volver la conexión.

## 4. Módulos

### 4.1 Inicio (dashboard)

Muestra, para el mes seleccionado (por defecto el actual):

- Ingresos, gastos (con apertura fijos / variables) y ahorro del período.
- Proyección al cierre del mes de gastos y ahorro (solo en el mes en curso).
- Comparación con el mes anterior (a la misma altura del mes en el mes en curso).
- Distribución del gasto por categoría.
- Patrimonio: dinero disponible en cuentas, deuda de tarjetas y patrimonio neto, con saldos por cuenta.
- Movimientos pendientes de confirmar y próximos vencimientos (resúmenes de tarjeta y recurrentes).
- Últimos movimientos.

Se puede navegar a meses anteriores. Un mes anterior al inicio del registro muestra un estado vacío
explicativo.

**Aceptación:** los totales coinciden con la suma de movimientos confirmados del mes; las
transferencias, pagos de tarjeta, ajustes y asignaciones a objetivos no alteran ingresos ni gastos.

### 4.2 Movimientos

Tipos: ingreso, gasto, transferencia, pago de tarjeta y ajuste de saldo.

Campos: tipo, importe, fecha, descripción, categoría (ingresos y gastos), cuenta o tarjeta, cuenta
destino (transferencias y pagos), comercio, medio de pago, fijo/variable, notas, estado
(confirmado / pendiente), cuotas (compras con tarjeta).

Funciones: alta rápida, edición, eliminación con confirmación, confirmación de pendientes, filtros
por período, tipo, categoría, cuenta, medio de pago y comercio, y búsqueda por texto.

**Aceptación:** editar o eliminar un movimiento recalcula todos los saldos e informes que lo
involucran (los saldos se derivan, nunca se guardan).

### 4.3 Cuentas

Efectivo, billeteras (Mercado Pago), cuentas bancarias, cajas de ahorro y otras. Cada cuenta tiene
nombre, tipo, entidad, saldo inicial, fecha del saldo inicial, moneda y estado activo/inactivo.

Detalle de cuenta: saldo actual, movimientos y ajuste de saldo ("el saldo real hoy es…"), que genera
un movimiento de ajuste por la diferencia.

Una cuenta con movimientos no se elimina: se desactiva.

### 4.4 Tarjetas de crédito

Configuración: nombre, banco, límite, día de cierre, día de vencimiento, cuenta con la que se paga el
resumen y deuda inicial (saldo del último resumen impago, consumos sin facturar y cuotas pendientes de
compras anteriores).

Detalle de tarjeta:

- **A pagar:** saldo del último resumen cerrado menos lo ya pagado, con fecha de vencimiento.
- **Próximo resumen:** consumos y cuotas que entran en el resumen en curso (compras pendientes de cierre).
- **Cuotas futuras:** cuotas que se facturarán en resúmenes posteriores.
- **Deuda total** y límite disponible.
- Historial de resúmenes con estado (pagado, pago parcial, impago).
- Pago del resumen (total o parcial) desde la cuenta configurada.
- Ajuste de fechas de un resumen cuando el banco cambia el cierre o el vencimiento.

**Regla fundamental:** una compra de $ 69.500 con tarjeta registra un gasto de $ 69.500 en la fecha de
compra y aumenta la deuda. El pago del resumen reduce la cuenta bancaria y la deuda, y **no** es un
gasto.

### 4.5 Categorías y comercios

Categorías iniciales de gasto: Hogar, Supermercado, Compras, Salidas, Salud, Transporte,
Suscripciones, Cuidado personal, Educación, Entretenimiento, Regalos, Viajes, Impuestos y Otros, con
subcategorías habituales (p. ej. Salud › Farmacia, Transporte › Combustible). Categorías de ingreso:
Sueldo, Trabajo independiente, Ventas, Reintegros, Rendimientos y Otros ingresos.

Se pueden crear, editar (nombre, ícono, color, "fijo por defecto"), crear subcategorías y eliminar;
si una categoría tiene movimientos, la eliminación exige reasignarlos.

Comercios: nombre, variantes para el reconocimiento por voz y categoría habitual. La categoría
habitual se aprende de la última categoría confirmada para ese comercio.

### 4.6 Recurrentes

Reglas para servicios, suscripciones, alquiler, seguros, sueldos y otros movimientos periódicos.
Frecuencia semanal, mensual, anual o personalizada (cada N días, semanas, meses o años). Importe fijo o
variable, categoría, cuenta, primera fecha, fecha de fin opcional y estado activo.

Los movimientos se generan cuando llega su fecha (al abrir la app o por el cron diario), una sola vez
por período. Con importe variable (o si la regla lo pide) se generan como **pendientes** y se
confirman con el importe real. Editar un movimiento generado no modifica la regla ni otros períodos.

### 4.7 Ahorros

- Ahorro de cada mes (ingresos − gastos) y su evolución.
- Ahorro acumulado desde el inicio del registro.
- Objetivos (fondo de emergencia, auto, viajes, compras importantes, personalizados) con importe
  objetivo, asignado, progreso y fecha objetivo opcional.
- Asignar y liberar dinero de un objetivo. Asignar no es un gasto ni mueve dinero; no se puede asignar
  más que el patrimonio neto sin asignar.

### 4.8 Carga por voz

Flujo: tocar el micrófono → permiso → grabación con indicador de tiempo y nivel → envío → transcripción
→ interpretación → validación → revisión o guardado automático → actualización del dashboard.

Reconoce varios movimientos en una grabación (*"Nafta cincuenta mil, supermercado treinta y dos mil"*),
fechas relativas (*hoy, ayer, anteayer, el lunes*), ingresos (*"me ingresaron un pago de ciento
cincuenta mil"*), comercios conocidos y categorías habituales.

Estados visibles: listo, grabando, procesando, interpretación encontrada, requiere confirmación,
guardado, error.

Se pide confirmación cuando hay dudas sobre importe, fecha, tipo, cuenta o categoría, baja confianza o
posible duplicado. Con el guardado automático activado y todos los datos claros, se guarda directo y se
ofrece **Deshacer**. También se puede escribir la frase en lugar de dictarla.

La voz necesita conexión; sin conexión el botón lo explica y ofrece la carga manual.

### 4.9 Configuración inicial

Al primer ingreso: fecha de inicio del registro, cuentas con sus saldos actuales (efectivo, Mercado
Pago, bancos, cajas de ahorro), tarjetas con su deuda pendiente y cuenta habitual. Los saldos iniciales
quedan fechados y los informes no muestran nada anterior al inicio.

### 4.10 Sin conexión

Carga manual de movimientos sin conexión, guardados en el dispositivo y sincronizados al recuperar la
conexión o al volver a abrir la app. Cada movimiento local muestra su estado: pendiente, sincronizando o
con error. Los reintentos nunca duplican movimientos. Si el servidor rechaza un movimiento cargado sin
conexión (por ejemplo, porque su categoría se borró mientras tanto), queda marcado con el motivo y se
puede reintentar o descartar. Editar o borrar movimientos ya guardados requiere conexión; si el
movimiento cambió en otro dispositivo, la app avisa y muestra la versión actual.

### 4.11 Acceso

Inicio de sesión con email y contraseña; no hay registro público. La cuenta inicial se crea por línea de
comandos y el acceso se recupera de la misma forma (ver README).

## 5. Mapa de pantallas

| Ruta | Pantalla |
|---|---|
| `/` | Inicio |
| `/movimientos` | Lista con filtros; tocar un movimiento abre su edición en una hoja inferior |
| `/cuentas`, `/cuentas/[id]` | Cuentas y tarjetas, detalle de cuenta |
| `/tarjetas/[id]` | Detalle de tarjeta, resúmenes y pago |
| `/ahorros` | Ahorro mensual, acumulado y objetivos |
| `/recurrentes` | Reglas recurrentes |
| `/mas`, `/mas/categorias`, `/mas/comercios`, `/mas/preferencias`, `/mas/instalar` | Menú, categorías, comercios, preferencias, instalación y cierre de sesión |
| `/bienvenida` | Configuración inicial |
| `/login` | Inicio de sesión |
| `/~offline` | Página sin conexión |

Navegación inferior en el celular: Inicio · Movimientos · **Micrófono** · Cuentas · Más. En escritorio,
barra lateral con las mismas secciones.

## 6. Glosario

| Término | Definición |
|---|---|
| Dinero disponible | Suma de saldos de cuentas de activo (no incluye tarjetas). |
| Deuda de tarjetas | Lo que se debe en todas las tarjetas: resúmenes impagos, consumos sin facturar y cuotas futuras. |
| Patrimonio neto | Dinero disponible − deuda de tarjetas. |
| Ahorro del período | Ingresos − gastos del período. Excluye transferencias, pagos de tarjeta, ajustes y asignaciones. |
| Ahorro acumulado | Suma de los ahorros de cada período desde el inicio del registro. |
| Asignado a objetivos | Parte del patrimonio neto reservada para objetivos. No es dinero adicional. |
| Libre | Patrimonio neto − asignado a objetivos. |

## 7. Fuera del alcance del MVP

Presupuestos; multimoneda; gestión de varios usuarios desde la UI; importación de resúmenes o
extractos; notificaciones push; reintegros y devoluciones como tipo propio (se registran como ingreso
en "Reintegros"); adelantos en efectivo con tarjeta; cálculo automático de intereses de tarjeta (se
registran como gasto cuando aparecen en el resumen).

## 8. Definición de terminado (versión 1)

- Se instala en iPhone desde Safari.
- Permite cargar ingresos y gastos manualmente y por voz.
- Gestiona cuentas, tarjetas, gastos fijos y recurrentes.
- Permite consultar movimientos, gasto por categoría, dinero disponible, ahorro del mes y ahorro
  acumulado.
- Los pagos de tarjeta no duplican gastos y las transferencias no alteran ingresos ni gastos.
- La información persiste; las funcionalidades principales tienen pruebas automatizadas.
- Las cargas manuales funcionan sin conexión y se sincronizan después.
- No hay errores críticos conocidos.

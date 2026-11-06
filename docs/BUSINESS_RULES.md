# Reglas de negocio

Este documento es la referencia de los cálculos financieros. Toda regla aquí descrita está
implementada en funciones puras (`src/modules/*/rules.ts`, `src/lib/money.ts`, `src/lib/dates.ts`) y
cubierta por pruebas. Si el código y este documento difieren, es un error.

## 1. Dinero

- Los importes se guardan en PostgreSQL como `NUMERIC(14,2)`: hasta 999.999.999.999,99.
- Viajan en la API como **string decimal** con punto y dos decimales: `"69500.00"`.
- En TypeScript se operan como **centavos enteros (`bigint`)**. Nunca se usa `number` para dinero.
- Redondeo: solo hay divisiones en cuotas, proyecciones y porcentajes.
  - Cuotas: `total / n` truncado a centavos; el resto se suma a la **primera** cuota. La suma de las
    cuotas siempre es exactamente el total.
  - Proyecciones: redondeo a centavos, mitad hacia arriba.
  - Porcentajes: se calculan al final, solo para mostrar.
- Formato: `$ 69.500` si no hay centavos, `$ 69.500,50` si los hay; negativos con `−`.

## 2. Tipos de movimiento y sus efectos

Cada movimiento tiene una cuenta principal (`account`) y, si corresponde, una cuenta destino (`to`).
El saldo de una cuenta de activo es dinero; el saldo de una tarjeta es **menos su deuda**.

| Tipo | Cuentas válidas | Efecto en saldos | Ingreso | Gasto |
|---|---|---|---|---|
| Ingreso | `account`: activo | `account` + importe | sí | — |
| Gasto | `account`: activo o tarjeta | `account` − importe | — | sí |
| Transferencia | `account` y `to`: activos distintos | `account` − importe, `to` + importe | — | — |
| Pago de tarjeta | `account`: activo; `to`: tarjeta | `account` − importe, `to` + importe (baja la deuda) | — | — |
| Ajuste | `account`: activo o tarjeta | `account` + importe con signo | — | — |

Consecuencias que las pruebas verifican:

- Una compra con tarjeta es gasto y aumenta la deuda; la cuenta bancaria no cambia.
- El pago del resumen reduce la cuenta bancaria y la deuda, y **no** es gasto.
- Una transferencia entre cuentas propias no es ingreso ni gasto.
- Un ajuste corrige un saldo sin contaminar ingresos ni gastos; se informa aparte.
- Una asignación a un objetivo de ahorro no es un movimiento: no cambia ningún saldo.

## 3. Estados

- `CONFIRMED`: hecho cierto. Es la única fuente de saldos e informes.
- `PENDING`: esperado pero no confirmado (recurrentes con importe variable o que piden confirmación).
  No afecta saldos ni informes; se muestra en "Pendientes de confirmar".

## 4. Validaciones de un movimiento

- Importe > 0 (en ajustes ≠ 0). Máximo 999.999.999.999,99.
- Fecha ≤ hoy (zona horaria de la usuaria). No se registran hechos futuros.
- Fecha ≥ fecha de apertura de cada cuenta involucrada: el saldo inicial ya contiene todo lo anterior.
- Las cuentas deben ser de la usuaria, estar activas (al crear) y respetar la tabla de la sección 2.
- Ingresos y gastos requieren categoría del mismo tipo (gasto/ingreso); los demás tipos no llevan
  categoría.
- Cuotas solo en gastos con tarjeta, de 2 a 72.
- La base de datos refuerza estas reglas con restricciones `CHECK` (ver DATABASE.md).

## 5. Saldos de cuentas

```
saldo(cuenta, al día D) = saldo_inicial(cuenta)
                        + Σ efecto(m, cuenta) para todo m CONFIRMED con fecha ≤ D
```

- `saldo_inicial` de una cuenta de activo: el informado en la configuración, a su `fecha de apertura`.
- `saldo_inicial` de una tarjeta: `−(saldo del último resumen impago + consumos sin facturar + cuotas
  pendientes de compras anteriores)`.
- Los saldos **no se guardan**: se derivan siempre de los movimientos. Por eso editar o eliminar un
  movimiento nunca deja saldos inconsistentes.

## 6. Tarjetas de crédito

### 6.1 Ciclo y período

- Un **resumen** se identifica por el mes de su cierre: `período = 'YYYY-MM'`.
- `cierre(P)`: la fecha cargada para ese resumen si existe un ajuste de fechas; si no, el día de cierre
  de la tarjeta en el mes P (si el mes es más corto, el último día del mes).
- `vencimiento(P)`: la fecha ajustada si existe; si no, el día de vencimiento en el mes P cuando
  `día de vencimiento > día de cierre`, o en el mes siguiente en caso contrario.
- `período(fecha)`: el mes de la fecha si `fecha ≤ cierre(mes)`; si no, el mes siguiente. Las compras
  del día del cierre entran en ese resumen.

### 6.2 Cargos y créditos de un resumen

```
cargos(P) = [P = P0] saldo del último resumen impago al inicio
          + [P = P1] consumos sin facturar al inicio
          + Σ gastos en un pago con período(fecha) = P
          + Σ cuotas cuyo período = P            (compras registradas y cuotas previas al inicio)
          − Σ ajustes con período(fecha) = P     (un ajuste positivo baja la deuda)

créditos(P) = Σ pagos de tarjeta con período(fecha) = P
```

`P1 = período(fecha de inicio de la tarjeta)` y `P0 = P1 − 1`.

Una compra en `n` cuotas genera un gasto por el total en la fecha de compra y `n` cuotas: la cuota `k`
se factura en `período(fecha de compra) + (k − 1)` meses.

### 6.3 Saldo de resumen, a pagar y deuda

```
saldo_resumen(P) = Σ_{Q ≤ P} cargos(Q) − Σ_{Q ≤ P} créditos(Q)

P_abierto = período(hoy)            P_cerrado = P_abierto − 1

a_pagar        = máx(0, saldo_resumen(P_cerrado) − créditos(P_abierto))
próximo_resumen = cargos(P_abierto)                         (compras pendientes de cierre)
cuotas_futuras  = Σ cuotas con período > P_abierto
deuda_total     = −saldo(tarjeta, hoy)
```

Se cumple `deuda_total = saldo_resumen(P_cerrado) − créditos(P_abierto) + próximo_resumen +
cuotas_futuras`. Si el primer término es negativo hay **saldo a favor**.

- **Pago total:** pagar `a_pagar`; queda en cero.
- **Pago parcial:** el remanente sigue en `a_pagar` y se arrastra al próximo resumen (la suma
  acumulada lo incluye). Los intereses que cobre el banco se registran como gasto con la tarjeta.
- **Estado de un resumen P:** pagado si `créditos(P+1) ≥ saldo_resumen(P)`, parcial si hubo pagos y no
  alcanzan, impago si no hubo pagos. Vencido si pasó `vencimiento(P)` y `a_pagar > 0`.
- **Límite disponible:** `límite − deuda_total`.

### 6.4 Ejemplo crítico (cubierto por pruebas)

| Paso | Banco | Deuda tarjeta | Gasto del mes |
|---|---|---|---|
| Saldo inicial | 500.000 | 0 | 0 |
| Compra con tarjeta 69.500 | 500.000 | 69.500 | 69.500 |
| Pago del resumen 69.500 | 430.500 | 0 | 69.500 (no 139.000) |

## 7. Inicio del registro

- La configuración inicial fija `fecha de inicio`. Las cuentas creadas allí tienen esa fecha de
  apertura; las cuentas agregadas después, la fecha que se indique (≥ fecha de inicio).
- Los informes de meses completamente anteriores al inicio quedan vacíos. En el mes del inicio solo
  cuentan los movimientos desde la fecha de inicio.
- La deuda inicial de una tarjeta no es gasto (ocurrió antes del registro) pero sí es deuda.

## 8. Métricas

Para un período `[desde, hasta]` y solo movimientos `CONFIRMED`:

| Métrica | Definición |
|---|---|
| Ingresos | Σ ingresos |
| Gastos | Σ gastos (incluye compras con tarjeta y en cuotas por su total, en la fecha de compra) |
| Gastos fijos / variables | Σ gastos con `fijo = sí` / `fijo = no` |
| Ahorro del período | Ingresos − Gastos |
| Ajustes | Σ ajustes (informativo; no es ingreso ni gasto) |
| Gasto por categoría | Σ gastos agrupados por categoría raíz (las subcategorías suman en su padre) |
| Dinero disponible | Σ saldos de cuentas de activo al cierre del período (o hoy) |
| Deuda de tarjetas | Σ deudas de tarjetas al cierre del período (o hoy) |
| Patrimonio neto | Disponible − Deuda |
| Ahorro acumulado | Σ ahorro de cada período desde la fecha de inicio |
| Asignado a objetivos | Σ asignaciones netas de objetivos activos |
| Libre | Patrimonio neto − Asignado |

**Identidad de control** (verificada en pruebas):

```
patrimonio(hoy) = patrimonio_inicial + ahorro_acumulado + Σ ajustes
```

donde `patrimonio_inicial = Σ saldos iniciales de activos − Σ deudas iniciales de tarjetas`.

### 8.1 Comparación con el mes anterior

- Mes cerrado: totales del mes contra el mes anterior completo.
- Mes en curso: totales hasta hoy contra el mes anterior **hasta el mismo día** (si el mes anterior es
  más corto, hasta su último día). Se muestra la diferencia absoluta y porcentual.

### 8.2 Proyección al cierre del mes en curso

```
d = días transcurridos (incluido hoy)      N = días del mes      w = d / N

ritmo_actual    = gastos_variables_hasta_hoy / d
ritmo_histórico = promedio de gastos variables diarios de los 3 meses anteriores con datos
ritmo           = w · ritmo_actual + (1 − w) · ritmo_histórico    (sin historia: ritmo_actual)

gastos_proyectados   = gastos_hasta_hoy + ritmo · (N − d) + fijos_esperados
ingresos_proyectados = ingresos_hasta_hoy + ingresos_esperados
ahorro_proyectado    = ingresos_proyectados − gastos_proyectados
```

`fijos_esperados` e `ingresos_esperados`: importes de movimientos pendientes del mes y de las
ocurrencias recurrentes que faltan hasta fin de mes. La mezcla con la historia evita que una compra
grande del día 2 dispare la proyección.

## 9. Recurrentes

- Calendario: ocurrencia `k` = `inicio + k · intervalo` en la unidad de la regla (día, semana, mes,
  año). En reglas mensuales y anuales el día ancla es el del inicio; si el mes no lo tiene, se usa el
  último día del mes, sin desplazar los meses siguientes.
- Se generan las ocurrencias con fecha ≤ hoy, ≥ inicio, ≤ fin y ≥ fecha de apertura de la cuenta.
- **Clave de período:** `YYYY-MM-DD` (unidad día), semana ISO `YYYY-Www` (semana), `YYYY-MM` (mes),
  `YYYY` (año). Única por regla en `recurring_occurrences`: ejecutar la generación varias veces, o en
  paralelo, nunca duplica.
- Importe fijo sin confirmación requerida → movimiento `CONFIRMED`. Importe variable o confirmación
  requerida → `PENDING` con el importe fijo o estimado.
- El movimiento generado es independiente: editarlo no cambia la regla ni otros períodos. Editar la
  regla solo afecta ocurrencias futuras.
- Si se elimina un movimiento generado, la ocurrencia queda `SKIPPED` y no se regenera.

## 10. Ahorros y objetivos

- Las asignaciones clasifican parte del patrimonio; no son gastos ni transferencias.
- Asignar requiere `importe ≤ libre` (patrimonio neto − asignado a todos los objetivos activos).
- Liberar requiere `importe ≤ asignado al objetivo`.
- Si el patrimonio baja por debajo de lo asignado, **libre** queda negativo y se muestra una alerta
  ("tenés asignado más de lo que tenés").
- Progreso = asignado / objetivo, acotado a 100 % para la barra (el importe real se muestra igual).
- Archivar un objetivo libera su asignación del cálculo de "libre".

## 11. Comercios

- Se identifican por nombre normalizado (minúsculas, sin acentos ni espacios repetidos).
- Al confirmar un movimiento con comercio y categoría, la categoría pasa a ser la habitual del
  comercio y se incrementa su uso. Los comercios más usados se envían como palabras clave al
  reconocimiento de voz.

## 12. Voz

### 12.1 Interpretación

El modelo devuelve, por cada movimiento detectado: tipo (gasto/ingreso), descripción, comercio,
importe como texto decimal, fecha ISO, categoría sugerida (de la lista existente o nula), mención de
cuenta o medio de pago (literal o nula), cuotas y confianza 0–1.

### 12.2 Validación determinística (no se confía en el modelo)

| Chequeo | Regla | Si falla |
|---|---|---|
| Importe | Decimal válido, > 0, ≤ 100.000.000 y presente entre los importes que el analizador de números en español encuentra en la transcripción | Revisar importe |
| Fecha | ISO válida, ≤ hoy, ≥ hoy − 60 días; si difiere de hoy, la transcripción debe contener una expresión de fecha | Revisar fecha |
| Tipo | Coherente con verbos detectados (*gasté, pagué, compré* / *cobré, me pagaron, me ingresó*) | Revisar tipo |
| Categoría | Debe existir y ser del tipo correcto; si no, se usa la habitual del comercio | Elegir categoría |
| Cuenta | Coincidencia con una cuenta o tarjeta mencionada; si no hubo mención, la cuenta habitual configurada | Elegir cuenta |
| Confianza | ≥ 0,8 | Revisar |
| Duplicado | Mismo importe y comercio/descripción en ±1 día | Posible duplicado |

Nunca se inventa un medio de pago: sin mención y sin cuenta habitual, la cuenta queda sin elegir.

### 12.3 Guardado

- Si todos los ítems pasan los chequeos y el guardado automático está activado, se guardan juntos en
  una transacción de base de datos y se ofrece **Deshacer** (elimina esos movimientos mientras no se
  hayan editado).
- Si no, quedan como borrador de revisión (`NEEDS_REVIEW`); la revisión puede retomarse más tarde.
- Confirmar un borrador es idempotente (cada ítem lleva su `clientId`).
- El audio se procesa en memoria y se descarta; solo se guarda la transcripción y metadatos.

## 13. Sin conexión

- Cada alta lleva un `clientId` (UUID generado en el dispositivo). El servidor garantiza unicidad por
  usuaria: reintentar devuelve el movimiento existente en lugar de crear otro.
- Sin conexión solo se **crean** movimientos. Una operación encolada que el servidor rechaza
  (validación o conflicto) queda con error visible para reintentarla o descartarla.
- Las ediciones y borrados (en línea) llevan la `version` sobre la que se hicieron. Si en el servidor
  la versión cambió, se responde `VERSION_CONFLICT` con la versión actual y no se pisa nada.

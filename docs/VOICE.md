# Carga por voz: contrato y funcionamiento

Complementa ARCHITECTURE §8 y BUSINESS_RULES §12. Código en `src/modules/voice/`.

## 1. Flujo

```
audio (o texto) ──► Transcriber ──► transcripción ──► TransactionInterpreter ──► ítems (sin validar)
                                                                                    │
            ┌───────────────────────────────────────────────────────────────────────┘
            ▼
   Zod (forma, ítem por ítem) ──► validación determinística (rules.ts) ──► duplicados (base)
            │
            ├─ todo claro + guardado automático + intérprete no local ──► SAVED (una transacción de BD)
            ├─ algún dato en duda ──────────────────────────────────────► NEEDS_REVIEW (borradores)
            └─ ningún movimiento / falla ────────────────────────────────► FAILED (con código)
```

El caso de uso (`service.ts`) solo conoce las interfaces `Transcriber` y `TransactionInterpreter`
(`providers/types.ts`). El único lugar que conoce las implementaciones es `providers/index.ts`.

## 2. Proveedores

| Rol | Implementación | Se elige con | Sin credenciales |
|---|---|---|---|
| Transcripción | `OpenAITranscriber` (`gpt-transcribe`, `fetch` multipart) | `OPENAI_API_KEY` | Sin transcripción: el audio responde 503 `PROVIDER_NOT_CONFIGURED`; se puede escribir |
| Transcripción (pruebas) | `FakeTranscriber`: devuelve `VOICE_FAKE_TRANSCRIPT` | `VOICE_STT_PROVIDER=fake` | — |
| Transcripción (navegador, gratis) | Web Speech API en el cliente (`use-speech-dictation.ts`); el texto va a `POST /api/voice/text` | Sin transcripción en el servidor (`/api/bootstrap` → `voice.transcription: "browser"`) | Navegador sin soporte (Firefox): se ofrece escribir con el micrófono del teclado |
| Interpretación | `AnthropicInterpreter` (`beta.messages.parse` + Zod, `effort: low`, `fallbacks: "default"`) | `VOICE_INTERPRETER=auto` (por defecto) o `anthropic` + `ANTHROPIC_API_KEY` | Intérprete local |
| Interpretación | `OpenAIInterpreter` (Responses API, `json_schema` estricto, `fetch`) | `VOICE_INTERPRETER=openai` + `OPENAI_API_KEY` | Intérprete local |
| Interpretación | `LocalInterpreter` (reglas, sin servicios externos) | `VOICE_INTERPRETER=local`, o como respaldo | — |

- Claude y OpenAI usan **el mismo prompt y el mismo formato de salida** (`providers/prompt.ts`): cambiar de
  proveedor no cambia el comportamiento esperado ni el caso de uso.
- Si el intérprete principal falla (red, tiempo, límite, rechazo, formato inválido), se usa el local y la
  carga queda en revisión con `interpreter.fallback = true`.
- Los errores de proveedor se registran sin transcripción ni datos financieros: proveedor, tipo de falla y
  código HTTP.
- Modelos configurables: `ANTHROPIC_MODEL` (por defecto `claude-opus-5-5`; `claude-haiku-5-5` es más barato y
  rápido), `OPENAI_TRANSCRIBE_MODEL` (`gpt-transcribe`), `OPENAI_INTERPRETER_MODEL` (`gpt-6-luna`).

## 3. Entrada

### `POST /api/voice`: audio

`multipart/form-data`:

| Campo | Tipo | Regla |
|---|---|---|
| `audio` | archivo | ≤ 3 MB; `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/x-m4a` (se ignoran parámetros como `;codecs=opus`) |
| `clientRequestId` | UUID | Lo genera el dispositivo **por grabación**; reintentar con el mismo id no duplica |
| `durationMs` | entero | 400 a 65 000 (la grabación se corta sola a los 60 s) |

Errores: 413 (pesado), 415 (formato), 422 (campos), 429 (30 cargas cada 10 minutos), 503 (sin transcripción).

### `POST /api/voice/text`: escrito en lugar de dictado

```json
{ "clientRequestId": "uuid", "text": "Nafta 50 mil, súper 32 mil con débito" }
```

`text`: de 2 a 500 caracteres. Mismo proceso, sin transcripción.

## 4. Salida del intérprete (cualquier proveedor)

```json
{
  "items": [
    {
      "type": "EXPENSE",
      "amount": "50000.00",
      "date": "2026-11-05",
      "description": "Nafta",
      "merchant": null,
      "category": "Transporte › Combustible",
      "accountMention": null,
      "installments": null,
      "quote": "Nafta cincuenta mil",
      "confidence": 0.95
    }
  ]
}
```

Se valida con `interpretedItemSchema` (Zod, estricto) **ítem por ítem**. Uno mal formado se descarta y se
avisa, sin perder los demás. Solo se ajustan rangos numéricos: la confianza se acota a 0–1 y «1 cuota»
se toma como sin cuotas. Máximo 10 ítems.

## 5. Validación determinística (`rules.ts`)

Nada de lo que devuelve el intérprete se guarda sin rastrearlo hasta la transcripción:

| Dato | Regla | Si no se cumple |
|---|---|---|
| Importe | Tiene que estar entre los que el analizador de números en español encuentra en la transcripción («sesenta y nueve mil quinientos», «$ 32.000», «50 lucas», «1,5 millones», «mil doscientos con cincuenta»). Cada importe dicho se usa una vez | Queda **vacío** (`NOT_SAID`), repetido (`REPEATED`) o fuera de su fragmento (`OUT_OF_QUOTE`) |
| Fecha | Distinta de hoy solo si se dijo («ayer», «el lunes», «el 15», «hace 3 días», «15 de octubre», «3/11»); ≤ hoy; ≥ hoy − 60 días; no antes del inicio del registro | Vuelve a la fecha dicha o a hoy (`NOT_SAID`, `OTHER_DATE`, `FUTURE`, `TOO_OLD`, `BEFORE_START`). Una fecha vaga («la semana pasada») pide el día (`VAGUE`) |
| Tipo | Coherente con lo dicho («gasté», «pagué», «me cobraron» → gasto; «cobré», «me pagaron», «sueldo» → ingreso) | `LOOKS_INCOME`, `UNCLEAR_INCOME`, `CONFLICT` |
| Comercio | Tiene que aparecer en lo dicho (por nombre o variante; los que son palabras comunes, como «Claro» o «Personal», necesitan «en/a/de/pagué» antes). Una categoría («supermercado») pasa a descripción | Se quita y se informa |
| Categoría | La sugerida si existe y es del tipo; si no, la habitual del comercio; si no, por palabra clave («nafta» → Combustible) | `MISSING`: hay que elegirla |
| Cuenta | La mencionada (por nombre propio o medio de pago: «con la visa», «en efectivo», «con débito», «mercado pago»). Una mención fuera de todo fragmento («con la visa: nafta… y súper…») se preselecciona y pide confirmar. **Sin mención, la cuenta habitual**; sin cuenta habitual, queda sin elegir. Un ingreso no va a una tarjeta | `AMBIGUOUS` («con tarjeta» y hay dos), `NOT_FOUND`, `SHARED_MENTION`, `MISSING`, `INCOME_TO_CARD` |
| Cuotas | Solo si se dijeron («en 6 cuotas») y con tarjeta de crédito | `NOT_SAID`, `NEEDS_CARD` |
| Confianza | ≥ 0,8. El intérprete local **siempre** pide revisión | `LOW`, `LOCAL` |
| Cita | `quote` tiene que salir de la transcripción (se toleran mayúsculas, acentos y puntuación) | `QUOTE_NOT_FOUND` |
| Duplicado | Mismo importe y comercio, descripción o categoría en ±1 día | `SIMILAR`, con el movimiento parecido |

Avisos de toda la carga (`notices`): importes dichos que no quedaron en ningún movimiento (salvo «me
quedan…», «tengo…»), pagos de tarjeta o transferencias mencionados (se cargan a mano) y ítems descartados.

**Guardado automático**: solo si la preferencia está activada, el intérprete no es el local, no hay avisos y
ningún borrador tiene dudas. Si el motor rechaza algo (por ejemplo, una fecha anterior a la apertura de la
cuenta), la carga pasa a revisión.

## 6. Respuesta: `{ entry }`

```ts
interface VoiceEntryDTO {
  id: string;
  clientRequestId: string;
  inputType: "AUDIO" | "TEXT";
  status: "PROCESSING" | "NEEDS_REVIEW" | "SAVED" | "UNDONE" | "DISCARDED" | "FAILED";
  transcript: string | null;
  drafts: VoiceDraft[];            // ver abajo
  notices: string[];
  interpreter: { model: string; local: boolean; fallback: boolean } | null;
  error: { code: string; message: string } | null;   // NO_MOVEMENTS, EMPTY_TRANSCRIPT, STT_FAILED, INTERNAL_ERROR
  transactions: TransactionDTO[];  // los creados (SAVED)
  canUndo: boolean;                // SAVED y ninguno editado
  autoSaved: boolean;
  createdAt: string; processedAt: string | null; resolvedAt: string | null;
}

interface VoiceDraft {
  key: string;                     // UUID: al confirmar es el clientId del movimiento
  type: "EXPENSE" | "INCOME";
  amount: string | null;           // null si no se pudo rastrear
  date: string;
  description: string | null; merchantName: string | null;
  categoryId: string | null; accountId: string | null; installments: number | null;
  quote: string | null; confidence: number;
  issues: { field: string; code: string; message: string }[];   // bloquean el guardado automático
  notes: string[];                                              // aclaraciones
  similar: { id: string; description: string; amount: string; date: string } | null;
}
```

## 7. Revisión

| Método y ruta | Cuerpo | Efecto |
|---|---|---|
| `GET /api/voice` | — | `{ items }`: cargas en revisión (se retoman desde el inicio) |
| `GET /api/voice/:id` | — | `{ entry }` |
| `POST /api/voice/:id/confirm` | `{ items: [{ key, type, amount, date, accountId, categoryId, merchantName?, description?, installments? }] }` | Guarda los enviados en **una** transacción de BD; los no enviados se descartan. Idempotente: si ya estaba guardada devuelve lo guardado. Errores del motor por ítem: `items.N.campo` |
| `POST /api/voice/:id/undo` | — | Borra los movimientos creados si ninguno se editó (`409 VOICE_EDITED`). Idempotente |
| `POST /api/voice/:id/discard` | — | Descarta una carga en revisión o fallida. Idempotente |

## 8. Idempotencia y reintentos

- **Grabación**: `(user_id, client_request_id)` es único. Un reintento devuelve la carga existente sin
  volver a llamar a los proveedores. Solo se reprocesa si quedó `FAILED` o `PROCESSING` hace más de 2
  minutos; `attempts` funciona como token de versión para que dos reintentos simultáneos no procesen dos
  veces. Si otro intento todavía está en curso, el cliente consulta `GET /api/voice/:id` hasta que termine.
- **Confirmación**: la carga se bloquea con `SELECT … FOR UPDATE`; cada borrador lleva su `key` como
  `clientId` del movimiento (único por usuaria). Confirmar dos veces, o en paralelo, crea los movimientos
  una sola vez.
- **Cliente**: conserva lo grabado (solo en memoria) para reintentar con el mismo id ante una falla de red;
  lo descarta al obtener la interpretación o al cerrar.

## 9. Grabación en el navegador (Safari en iPhone)

- `MediaRecorder` con el primer formato soportado: `audio/webm;codecs=opus` (Chrome/Android) o `audio/mp4`
  (Safari ≥ 14.3). Fragmentos de 1 s (`timeslice`), 32 kbps, corte automático a los 60 s.
- El micrófono y el `AudioContext` del medidor de nivel se piden **dentro del toque** del botón (iOS no los
  da después). Un toque en el micrófono ya empieza a grabar.
- Al terminar o cancelar se detienen las pistas y se apaga el indicador de micrófono del sistema. Si la
  pista se corta (llamada entrante), se procesa lo grabado.
- Errores con mensaje propio: permiso denegado (con la ruta de Ajustes en iPhone), sin micrófono, micrófono
  ocupado, navegador sin soporte, conexión no segura, grabación demasiado corta. Sin conexión, la hoja lo
  explica y ofrece la carga manual.
- Estados visibles: listo → grabando (tiempo y nivel) → procesando → revisión → guardado (con «Deshacer»),
  o error (reintentar, grabar de nuevo, escribir, carga manual).

## 9 bis. Dictado con el navegador (sin clave de OpenAI)

- `GET /api/bootstrap` informa `voice.transcription`: `"server"` si hay transcripción en el servidor,
  `"browser"` si no. Mientras no llegan esos datos se graba audio como siempre.
- En modo `"browser"` el micrófono usa `SpeechRecognition` / `webkitSpeechRecognition` (`es-AR`,
  continuo, con resultados intermedios que se muestran mientras se habla). Se pide dentro del toque.
- Corta a los 60 s o a los 500 caracteres. Si el navegador corta solo (silencio), se procesa lo entendido.
  Chrome en Android repite lo acumulado en cada resultado: `mergeSpeechSegments` lo une sin duplicar.
- Lo dictado se envía como texto: `inputType = TEXT` y lo interpreta el intérprete configurado (sin clave
  de Anthropic, el local). En la revisión se muestra como «Escuchamos».
- Errores propios: no se escuchó nada, sin conexión (el reconocimiento de Chrome usa la red), permiso
  denegado, sin micrófono. Sin soporte, la hoja abre el campo de texto y sugiere el micrófono del teclado.
- Privacidad: Chrome envía el audio a Google para reconocerlo; Safari usa el reconocimiento de Apple. El
  servidor de la app no recibe audio en este modo.

## 10. Privacidad

- El audio se lee en memoria en el Route Handler, se envía a la transcripción y se descarta: **no se
  guarda** en la base, en disco ni en logs. De la grabación solo quedan duración, tipo y tamaño.
- Se guardan la transcripción (hasta 2000 caracteres) y los borradores, para poder retomar la revisión.
- Las claves de API viven solo en el servidor. OpenAI recibe el audio y, si interpreta, la transcripción con
  las categorías, cuentas y comercios de la usuaria (`store: false`); Anthropic, lo mismo para interpretar.

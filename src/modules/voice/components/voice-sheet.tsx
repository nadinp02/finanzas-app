"use client";

import { cn } from "cn";
import { CheckCircle2, Keyboard, Loader2, Mic, PenLine, RotateCcw, Square, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { toast } from "sonner";
import { useReferenceData } from "@/components/app-shell/reference-data";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, errorMessage, NetworkError } from "@/lib/api-client";
import { formatMoney, parseDecimal } from "@/lib/money";
import { discardVoice, fetchVoiceEntry, sendVoiceAudio, sendVoiceText, undoVoice } from "../client";
import { formatElapsed, RECORDING_ERROR_MESSAGES } from "../recording";
import { VOICE_LIMITS, type VoiceEntryDTO } from "../schema";
import { isSpeechDictationSupported, useSpeechDictation } from "./use-speech-dictation";
import { useVoiceRecorder, type Recording } from "./use-voice-recorder";
import { VoiceReview } from "./voice-review";

/** Lo enviado, para reintentar con el mismo `clientRequestId` (el servidor no duplica). */
type PendingRequest =
  | { kind: "audio"; clientRequestId: string; recording: Recording }
  | { kind: "text"; clientRequestId: string; text: string; /** Dictado con el navegador, no escrito. */ dictated?: boolean };

type Phase =
  | { name: "idle" }
  | { name: "typing"; /** El navegador no puede dictar: se sugiere el micrófono del teclado. */ noDictation?: boolean }
  | { name: "processing"; kind: "audio" | "text" }
  | { name: "loading" }
  | { name: "review"; entry: VoiceEntryDTO; dictated?: boolean }
  | { name: "saved"; entry: VoiceEntryDTO }
  | { name: "error"; message: string; canRetry: boolean; transcript?: string | null; written?: boolean }
  | { name: "offline" };

const POLL_INTERVAL_MS = 1500;
const POLL_ATTEMPTS = 40;

const EXAMPLES = ["«Nafta cincuenta mil, supermercado treinta y dos mil»", "«Ayer me pagaron ciento cincuenta mil»", "«Farmacity sesenta y nueve mil con la visa»"];

function newId() {
  return crypto.randomUUID();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface VoiceSheetHandle {
  /** Abre y empieza a grabar. Llamar dentro del toque (iOS). */
  openAndRecord: () => void;
  /** Abre una carga existente (pendiente de revisión). */
  openEntry: (id: string) => void;
  /** Abre sin grabar (acceso directo del ícono). */
  open: () => void;
}

interface VoiceSheetProps {
  /** Acciones para que la navegación las dispare dentro del gesto del usuario. */
  ref: Ref<VoiceSheetHandle>;
  onManualEntry: () => void;
}

export function VoiceSheet({ ref, onManualEntry }: VoiceSheetProps) {
  const router = useRouter();
  const { data, refresh } = useReferenceData();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [text, setText] = useState("");
  const [undoing, setUndoing] = useState(false);
  const pending = useRef<PendingRequest | null>(null);
  const generation = useRef(0);

  const recorder = useVoiceRecorder({
    onComplete: (recording) => {
      pending.current = { kind: "audio", clientRequestId: newId(), recording };
      void submit();
    },
    onError: (kind) => setPhase({ name: "error", message: RECORDING_ERROR_MESSAGES[kind], canRetry: false }),
  });

  // Sin transcripción en el servidor (sin clave de OpenAI): dicta el navegador y se envía como texto.
  const dictation = useSpeechDictation({
    onComplete: (dictated) => {
      pending.current = { kind: "text", clientRequestId: newId(), text: dictated, dictated: true };
      void submit();
    },
    onError: (kind) => setPhase({ name: "error", message: RECORDING_ERROR_MESSAGES[kind], canRetry: false }),
  });

  function show(entry: VoiceEntryDTO) {
    const dictated = pending.current?.kind === "text" && pending.current.dictated === true;
    switch (entry.status) {
      case "NEEDS_REVIEW":
        pending.current = null; // el audio ya no hace falta
        setPhase({ name: "review", entry, dictated });
        break;
      case "SAVED":
        pending.current = null;
        setPhase({ name: "saved", entry });
        router.refresh();
        break;
      case "FAILED": {
        const retryable = entry.error?.code === "STT_FAILED" || entry.error?.code === "INTERNAL_ERROR";
        if (!retryable) pending.current = null;
        setPhase({ name: "error", message: entry.error?.message ?? "No se pudo procesar.", canRetry: retryable, transcript: entry.transcript, written: entry.inputType === "TEXT" && !dictated });
        break;
      }
      case "PROCESSING":
        setPhase({ name: "error", message: "La carga sigue procesándose. Probá de nuevo en unos segundos.", canRetry: pending.current !== null });
        break;
      default:
        pending.current = null;
        setPhase({ name: "error", message: "Esta carga ya no está pendiente.", canRetry: false });
    }
  }

  async function submit() {
    const request = pending.current;
    if (!request) return;
    const run = ++generation.current;
    setPhase({ name: "processing", kind: request.kind });
    try {
      let entry =
        request.kind === "audio"
          ? await sendVoiceAudio(request.recording.blob, request.clientRequestId, request.recording.durationMs)
          : await sendVoiceText(request.text, request.clientRequestId);
      // Otro intento con el mismo id todavía se está procesando: se espera su resultado.
      for (let attempt = 0; entry.status === "PROCESSING" && attempt < POLL_ATTEMPTS; attempt++) {
        await sleep(POLL_INTERVAL_MS);
        if (run !== generation.current) return;
        entry = await fetchVoiceEntry(entry.id);
      }
      if (run !== generation.current) return;
      show(entry);
    } catch (error) {
      if (run !== generation.current) return;
      if (error instanceof NetworkError) {
        setPhase({ name: "error", message: "No hay conexión con el servidor. Lo grabado se conserva: reintentá cuando vuelva la señal.", canRetry: true });
      } else if (error instanceof ApiError && error.status === 422 && request.kind === "text") {
        setText(request.text);
        setPhase({ name: "typing" });
        toast.error(Object.values(error.fields ?? {})[0] ?? error.message);
      } else {
        const retryable =
          !(error instanceof ApiError) || ((error.status >= 500 || error.status === 429) && error.code !== "PROVIDER_NOT_CONFIGURED");
        if (!retryable) pending.current = null;
        setPhase({ name: "error", message: errorMessage(error), canRetry: retryable });
      }
    }
  }

  function startRecording() {
    if (!navigator.onLine) {
      setPhase({ name: "offline" });
      return;
    }
    pending.current = null;
    // Sin datos del servidor todavía (llegan en milisegundos), se graba audio como siempre.
    const mode = data?.voice?.transcription ?? "server";
    if (mode === "browser") {
      if (!isSpeechDictationSupported()) {
        setPhase({ name: "typing", noDictation: true });
        return;
      }
      setPhase({ name: "idle" });
      dictation.start();
      return;
    }
    setPhase({ name: "idle" });
    recorder.start();
  }

  useImperativeHandle(ref, () => ({
    openAndRecord: () => {
      setOpen(true);
      startRecording();
    },
    open: () => {
      setOpen(true);
      setPhase(navigator.onLine ? { name: "idle" } : { name: "offline" });
    },
    openEntry: (id: string) => {
      setOpen(true);
      setPhase({ name: "loading" });
      const run = ++generation.current;
      fetchVoiceEntry(id)
        .then((entry) => {
          if (run === generation.current) show(entry);
        })
        .catch((error: unknown) => {
          if (run === generation.current) setPhase({ name: "error", message: errorMessage(error), canRetry: false });
        });
    },
  }));

  function close() {
    generation.current += 1;
    recorder.cancel();
    dictation.cancel();
    pending.current = null; // se descarta el audio en memoria
    setOpen(false);
    setText("");
    setPhase({ name: "idle" });
  }

  const dictating = dictation.status === "recording" || dictation.status === "stopping";
  const recording = recorder.status === "recording" || recorder.status === "stopping" || dictating;
  const requesting = recorder.status === "requesting" || dictation.status === "requesting";
  const stopping = recorder.status === "stopping" || dictation.status === "stopping";
  const elapsedMs = dictation.status === "idle" ? recorder.elapsedMs : dictation.elapsedMs;

  let title = "Cargar por voz";
  if (recording) title = "Te escucho…";
  else if (phase.name === "processing") title = "Procesando";
  else if (phase.name === "review") title = phase.entry.drafts.length === 1 ? "Revisá el movimiento" : `Revisá los ${phase.entry.drafts.length} movimientos`;
  else if (phase.name === "saved") title = "Guardado";
  else if (phase.name === "typing") title = "Escribí el movimiento";
  else if (phase.name === "error") title = "No se pudo cargar";
  else if (phase.name === "offline") title = "Sin conexión";

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <SheetHeader className="mb-4 p-0 pr-10">
          <SheetTitle className="text-xl font-bold">{title}</SheetTitle>
          <SheetDescription className="sr-only">Dictá o escribí tus gastos e ingresos; vas a poder revisarlos antes de guardar.</SheetDescription>
        </SheetHeader>

        <div aria-live="polite" className="sr-only">
          {recording ? "Grabando" : phase.name === "processing" ? "Procesando" : phase.name === "review" ? "Interpretación lista para revisar" : phase.name === "saved" ? "Guardado" : ""}
        </div>

        {(recording || requesting) && (
          <div className="grid justify-items-center gap-5 py-4">
            <div className="relative flex size-28 items-center justify-center">
              <span
                aria-hidden="true"
                className={cn("absolute inset-0 rounded-full bg-negative/15 transition-transform duration-100", dictating && "animate-pulse")}
                style={{ transform: `scale(${dictating ? 1.2 : 1 + recorder.level * 0.45})` }}
              />
              <span className="relative flex size-20 items-center justify-center rounded-full bg-negative text-white">
                {requesting ? <Loader2 className="size-8 animate-spin" /> : <Mic className="size-9" />}
              </span>
            </div>
            <p className="text-[15px] font-semibold tabular-nums" role="timer" aria-label="Tiempo de grabación">
              {requesting ? "Pidiendo permiso para el micrófono…" : `Grabando ${formatElapsed(elapsedMs)} / ${formatElapsed(VOICE_LIMITS.maxDurationMs)}`}
            </p>
            {dictating && dictation.transcript ? (
              <p className="w-full rounded-2xl bg-secondary px-4 py-3 text-[15px] leading-snug" aria-label="Lo que vamos entendiendo">
                «{dictation.transcript}»
              </p>
            ) : (
              <p className="text-center text-[14px] text-muted-foreground">Podés decir varios movimientos seguidos.</p>
            )}
            <div className="grid w-full gap-2">
              <Button size="lg" onClick={dictating ? dictation.stop : recorder.stop} disabled={!recording || stopping}>
                <Square className="fill-current" /> Listo, procesar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  recorder.cancel();
                  dictation.cancel();
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {!recording && !requesting && phase.name === "idle" && (
          <div className="grid justify-items-center gap-5 py-2">
            <button
              type="button"
              onClick={startRecording}
              aria-label="Empezar a grabar"
              className="flex size-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
            >
              <Mic className="size-10" />
            </button>
            <div className="grid gap-1 text-center text-[14px] text-muted-foreground">
              <p>Tocá y contá qué gastaste o cobraste. Por ejemplo:</p>
              {EXAMPLES.map((example) => (
                <p key={example} className="italic">
                  {example}
                </p>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setPhase({ name: "typing" })}>
              <Keyboard /> Escribir en lugar de dictar
            </Button>
          </div>
        )}

        {!recording && phase.name === "typing" && (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const value = text.trim();
              if (value.length < 2) return;
              if (!navigator.onLine) {
                setPhase({ name: "offline" });
                return;
              }
              pending.current = { kind: "text", clientRequestId: newId(), text: value };
              void submit();
            }}
          >
            {phase.noDictation && (
              <p className="text-[14px] text-muted-foreground">
                Este navegador no permite dictar dentro de la app. Podés usar el micrófono del teclado para dictar acá.
              </p>
            )}
            <label htmlFor="voice-text" className="text-[13px] font-semibold text-muted-foreground">
              Escribilo como lo dirías
            </label>
            <Textarea
              id="voice-text"
              autoFocus
              rows={3}
              maxLength={VOICE_LIMITS.maxTextLength}
              placeholder="Nafta 50 mil, súper 32 mil con débito"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <Button type="submit" size="lg" disabled={text.trim().length < 2}>
              Interpretar
            </Button>
            {!phase.noDictation && (
              <Button type="button" variant="ghost" onClick={() => setPhase({ name: "idle" })}>
                <Mic /> Mejor dictarlo
              </Button>
            )}
          </form>
        )}

        {!recording && (phase.name === "processing" || phase.name === "loading") && (
          <div className="grid justify-items-center gap-3 py-10 text-center">
            <Loader2 className="size-9 animate-spin text-muted-foreground" />
            <p className="text-[15px] font-semibold">
              {phase.name === "loading" ? "Abriendo la carga…" : phase.kind === "audio" ? "Transcribiendo e interpretando…" : "Interpretando…"}
            </p>
            <p className="text-[13px] text-muted-foreground">Nada se guarda sin que lo revises.</p>
          </div>
        )}

        {!recording && phase.name === "review" && (
          <VoiceReview
            key={phase.entry.id}
            entry={phase.entry}
            dictated={phase.dictated}
            onSaved={(entry) => {
              show(entry);
              void refresh().catch(() => {});
            }}
            onDiscard={async () => {
              try {
                await discardVoice(phase.entry.id);
                toast("Carga descartada");
                close();
                router.refresh();
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          />
        )}

        {!recording && phase.name === "saved" && (
          <div className="grid gap-4">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-positive">
              <CheckCircle2 className="size-5" />
              {phase.entry.transactions.length === 1 ? "Se guardó 1 movimiento" : `Se guardaron ${phase.entry.transactions.length} movimientos`}
              {phase.entry.autoSaved && " (guardado automático)"}
            </p>
            <ul className="divide-y rounded-2xl border bg-card" aria-label="Movimientos guardados">
              {phase.entry.transactions.map((transaction) => (
                <li key={transaction.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{transaction.description}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {transaction.category?.name} · {transaction.account.name}
                    </span>
                  </span>
                  <span className={cn("shrink-0 font-semibold tabular-nums", transaction.type === "INCOME" && "text-positive")}>
                    {formatMoney(parseDecimal(transaction.amount), { sign: transaction.type === "INCOME" ? "always" : "auto" })}
                  </span>
                </li>
              ))}
            </ul>
            <div className="grid gap-2">
              <Button size="lg" onClick={close}>
                Listo
              </Button>
              {phase.entry.canUndo && (
                <Button
                  variant="ghost"
                  disabled={undoing}
                  onClick={async () => {
                    setUndoing(true);
                    try {
                      await undoVoice(phase.entry.id);
                      toast("Carga deshecha: no se guardó nada");
                      close();
                      router.refresh();
                    } catch (error) {
                      toast.error(errorMessage(error));
                    } finally {
                      setUndoing(false);
                    }
                  }}
                >
                  {undoing ? <Loader2 className="animate-spin" /> : <RotateCcw />} Deshacer
                </Button>
              )}
            </div>
          </div>
        )}

        {!recording && phase.name === "error" && (
          <div className="grid gap-4">
            <p role="alert" className="text-[15px]">
              {phase.message}
            </p>
            {phase.transcript && (
              <figure className="rounded-2xl bg-secondary px-4 py-3">
                <figcaption className="mb-1 text-[12px] font-semibold text-muted-foreground">{phase.written ? "Escribiste" : "Escuchamos"}</figcaption>
                <blockquote className="text-[15px]">«{phase.transcript}»</blockquote>
              </figure>
            )}
            <div className="grid gap-2">
              {phase.canRetry && (
                <Button size="lg" onClick={() => void submit()}>
                  <RotateCcw /> Reintentar
                </Button>
              )}
              <Button size={phase.canRetry ? "default" : "lg"} variant={phase.canRetry ? "outline" : "default"} onClick={startRecording}>
                <Mic /> Grabar de nuevo
              </Button>
              <Button variant="outline" onClick={() => setPhase({ name: "typing" })}>
                <Keyboard /> Escribirlo
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  close();
                  onManualEntry();
                }}
              >
                <PenLine /> Carga manual
              </Button>
            </div>
          </div>
        )}

        {!recording && phase.name === "offline" && (
          <div className="grid gap-4">
            <p className="flex gap-2 text-[15px]">
              <WifiOff className="mt-0.5 size-5 shrink-0" /> La carga por voz necesita conexión. La carga manual funciona sin conexión y se sincroniza sola.
            </p>
            <Button
              size="lg"
              onClick={() => {
                close();
                onManualEntry();
              }}
            >
              <PenLine /> Carga manual
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

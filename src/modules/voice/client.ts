"use client";

import { api, apiUpload } from "@/lib/api-client";
import type { ConfirmVoiceInput, VoiceEntryDTO } from "./schema";

interface EntryResponse {
  entry: VoiceEntryDTO;
}

export async function sendVoiceAudio(audio: Blob, clientRequestId: string, durationMs: number, signal?: AbortSignal) {
  const form = new FormData();
  form.append("clientRequestId", clientRequestId);
  form.append("durationMs", String(Math.round(durationMs)));
  // El nombre ayuda a algunos navegadores a mandar el tipo correcto.
  form.append("audio", audio, audio.type.includes("mp4") ? "dictado.mp4" : "dictado.webm");
  return (await apiUpload<EntryResponse>("/api/voice", form, signal)).entry;
}

export async function sendVoiceText(text: string, clientRequestId: string) {
  return (await api<EntryResponse>("/api/voice/text", { method: "POST", body: { clientRequestId, text } })).entry;
}

export async function fetchVoiceEntry(id: string) {
  return (await api<EntryResponse>(`/api/voice/${id}`)).entry;
}

export async function confirmVoice(id: string, input: ConfirmVoiceInput) {
  return (await api<EntryResponse>(`/api/voice/${id}/confirm`, { method: "POST", body: input })).entry;
}

export async function undoVoice(id: string) {
  return (await api<EntryResponse>(`/api/voice/${id}/undo`, { method: "POST" })).entry;
}

export async function discardVoice(id: string) {
  return (await api<EntryResponse>(`/api/voice/${id}/discard`, { method: "POST" })).entry;
}

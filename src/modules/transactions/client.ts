"use client";

import { api } from "@/lib/api-client";
import type { TransactionDTO, TransactionInput } from "./schema";

export function newClientId(): string {
  return crypto.randomUUID();
}

export function createTransactionRequest(input: TransactionInput, clientId: string = newClientId()) {
  return api<TransactionDTO>("/api/transactions", { method: "POST", body: { ...input, clientId } });
}

export function updateTransactionRequest(id: string, version: number, data: TransactionInput) {
  return api<TransactionDTO>(`/api/transactions/${id}`, { method: "PATCH", body: { version, data } });
}

export function deleteTransactionRequest(id: string, version?: number) {
  const query = version === undefined ? "" : `?version=${version}`;
  return api<void>(`/api/transactions/${id}${query}`, { method: "DELETE" });
}

export function confirmTransactionRequest(id: string, version: number, amount?: string) {
  return api<TransactionDTO>(`/api/transactions/${id}/confirm`, { method: "POST", body: { version, amount } });
}

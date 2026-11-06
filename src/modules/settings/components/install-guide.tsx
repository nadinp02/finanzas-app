"use client";

import { CheckCircle2, Download, Share, SquarePlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS se presenta como Mac: se detecta por pantalla táctil.
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios ? "ios" : /Android/.test(ua) ? "android" : "other";
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

const noSubscription = () => () => {};

export function InstallGuide() {
  // Valores del navegador sin desajuste de hidratación: el servidor siempre ve "other".
  const platform = useSyncExternalStore(noSubscription, detectPlatform, () => "other" as Platform);
  const standalone = useSyncExternalStore(noSubscription, isStandalone, () => false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-4 text-[15px] font-semibold">
        <CheckCircle2 className="text-positive" /> Ya estás usando la app instalada.
      </p>
    );
  }

  if (platform === "ios") {
    return (
      <ol className="grid gap-3 text-[15px]">
        <li className="flex gap-3 rounded-2xl border bg-card p-4">
          <span className="font-bold">1.</span>
          <span>
            Abrí esta página en <strong>Safari</strong> y tocá <Share className="inline size-4 align-text-bottom" aria-label="Compartir" /> <strong>Compartir</strong>.
          </span>
        </li>
        <li className="flex gap-3 rounded-2xl border bg-card p-4">
          <span className="font-bold">2.</span>
          <span>
            Elegí <SquarePlus className="inline size-4 align-text-bottom" aria-hidden /> <strong>Agregar a inicio</strong> y confirmá.
          </span>
        </li>
        <li className="flex gap-3 rounded-2xl border bg-card p-4">
          <span className="font-bold">3.</span>
          <span>Abrila desde el ícono: funciona a pantalla completa y permite cargar sin conexión.</span>
        </li>
      </ol>
    );
  }

  return (
    <div className="grid gap-3 text-[15px]">
      {promptEvent ? (
        <Button
          size="lg"
          onClick={async () => {
            await promptEvent.prompt();
            await promptEvent.userChoice;
            setPromptEvent(null);
          }}
        >
          <Download /> Instalar Cuentas Claras
        </Button>
      ) : (
        <p className="rounded-2xl border bg-card p-4">
          En Chrome, abrí el menú <strong>⋮</strong> y elegí <strong>Instalar app</strong> o <strong>Agregar a la pantalla principal</strong>.
        </p>
      )}
    </div>
  );
}

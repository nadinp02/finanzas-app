// Modo configurador de Serwist: `serwist build` corre después de `next build` y genera
// public/sw.js con el precache de /_next/static. Ver docs/ARCHITECTURE.md §9.
import { randomUUID } from "node:crypto";
import { serwist } from "@serwist/next/config";

const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID();

export default serwist({
  swSrc: "src/worker/sw.ts",
  swDest: "public/sw.js",
  // Con PPR el contenido dinámico llega en la misma respuesta: un shell precacheado quedaría vacío.
  precachePrerendered: false,
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
});

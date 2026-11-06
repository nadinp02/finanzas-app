/**
 * Genera los PNG de la PWA a partir de la marca vectorial. Se ejecuta a mano cuando cambia el
 * diseño (`npm run icons`); los PNG resultantes se versionan.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const INK = "#1c1e23";
const PAPER = "#f6f5f1";
const GREEN = "#3fa174";
const outDir = path.resolve("public/icons");

// Sin esquinas redondeadas: iOS y Android aplican su propia máscara. La marca ocupa el círculo
// central del 60 %, dentro de la zona segura de los íconos "maskable" (80 %).
const mark = (size: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${INK}"/>
  <path d="M341 171a120 120 0 1 0 0 170" fill="none" stroke="${PAPER}" stroke-width="56" stroke-linecap="round"/>
  <circle cx="356" cy="256" r="30" fill="${GREEN}"/>
</svg>`;

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { file, size } of targets) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0">${mark(size)}</body></html>`);
    await page.locator("svg").screenshot({ path: path.join(outDir, file), omitBackground: false });
    console.log(`✔ ${file}`);
  }
} finally {
  await browser.close();
}
await fs.access(path.join(outDir, "icon.svg"));

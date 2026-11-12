import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_FAKE_TRANSCRIPT } from "./support/constants";
import { accountLink, expectNoHorizontalOverflow, pesos, signIn, today, transactionRow } from "./support/fixtures";

/**
 * Carga por voz con el micrófono simulado de Chromium (graba de verdad con MediaRecorder), la
 * transcripción falsa del servidor (devuelve el caso 17) y el intérprete local real. Sin claves de
 * OpenAI ni de Anthropic: no prueba esos proveedores, sí todo el resto del flujo.
 */

function voiceSheet(page: Page): Locator {
  return page.getByRole("dialog");
}

function draft(sheet: Locator, index: number): Locator {
  return sheet.getByRole("group", { name: `Movimiento ${index}`, exact: true });
}

function daysAgo(days: number): string {
  const [year, month, day] = today().split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

/** Toca el micrófono, deja grabar un momento y procesa. */
async function dictate(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Cargar por voz" }).click();
  const sheet = voiceSheet(page);
  await expect(sheet.getByRole("heading", { name: "Te escucho…" })).toBeVisible();
  await expect(sheet.getByRole("timer")).toContainText(/Grabando 0:0[1-9] \/ 1:00/);
  await sheet.getByRole("button", { name: "Listo, procesar" }).click();
  return sheet;
}

/** Abre la voz y elige escribir en lugar de dictar. */
async function write(page: Page, text: string): Promise<Locator> {
  await page.getByRole("button", { name: "Cargar por voz" }).click();
  const sheet = voiceSheet(page);
  await sheet.getByRole("button", { name: "Cancelar" }).click();
  await sheet.getByRole("button", { name: "Escribir en lugar de dictar" }).click();
  await sheet.getByLabel("Escribilo como lo dirías").fill(text);
  await sheet.getByRole("button", { name: "Interpretar" }).click();
  return sheet;
}

test.describe.serial("voz: dictado", () => {
  test("caso 17: dictar dos movimientos, revisarlos y guardarlos", async ({ page }) => {
    await signIn(page, "voice");
    const sheet = await dictate(page);

    await expect(sheet.getByRole("heading", { name: "Revisá los 2 movimientos" })).toBeVisible();
    await expect(sheet.getByText(`«${E2E_FAKE_TRANSCRIPT}»`)).toBeVisible();

    const nafta = draft(sheet, 1);
    await expect(nafta.getByLabel("Importe")).toHaveValue("50.000");
    await expect(nafta.getByLabel("Descripción")).toHaveValue("Nafta");
    await expect(nafta.getByLabel("Categoría").locator("option:checked")).toHaveText("Combustible");
    await expect(nafta.getByRole("radio", { name: "Efectivo", exact: true })).toBeChecked();
    await expect(nafta.getByText("No dijiste con qué pagaste: queda Efectivo, tu cuenta habitual.")).toBeVisible();
    // El intérprete local siempre pide revisión.
    await expect(nafta.getByRole("list", { name: "Para revisar" })).toContainText("Interpretación automática básica");
    await expectNoHorizontalOverflow(page);

    const super_ = draft(sheet, 2);
    await expect(super_.getByLabel("Importe")).toHaveValue("32.000");
    await expect(super_.getByLabel("Categoría").locator("option:checked")).toHaveText("Supermercado");
    // Se corrige la cuenta del segundo antes de guardar.
    await super_.getByRole("radio", { name: "Banco", exact: true }).click();

    await sheet.getByRole("button", { name: "Guardar 2 movimientos" }).click();
    await expect(sheet.getByText("Se guardaron 2 movimientos")).toBeVisible();
    const saved = sheet.getByRole("list", { name: "Movimientos guardados" });
    await expect(saved.getByRole("listitem")).toHaveCount(2);
    await expect(saved).toContainText("Combustible · Efectivo");
    await expect(saved).toContainText("Supermercado · Banco");
    await sheet.getByRole("button", { name: "Listo" }).click();
    await expect(sheet).toBeHidden();

    await page.goto("/cuentas");
    await expect(accountLink(page, "Efectivo")).toContainText(pesos(0));
    await expect(accountLink(page, "Banco")).toContainText(pesos(468_000));
    await page.goto("/movimientos");
    await expect(transactionRow(page, "Nafta")).toContainText(pesos(-50_000));
    await expect(transactionRow(page, "Supermercado")).toContainText(pesos(-32_000));
    // Las categorías con subcategoría ("Transporte › Combustible") no ensanchan la lista ni el inicio.
    await expectNoHorizontalOverflow(page);
    await page.goto("/");
    await expect(page.getByRole("main").getByText("Nafta", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("si se corta la conexión, reintentar no duplica; un movimiento parecido se avisa", async ({ page }) => {
    await signIn(page, "voice");
    // El servidor procesa la primera grabación pero la respuesta no llega (conexión cortada).
    let dropped = false;
    await page.route("**/api/voice", async (route) => {
      if (route.request().method() === "POST" && !dropped) {
        dropped = true;
        await route.fetch();
        await route.abort("connectionreset");
        return;
      }
      await route.continue();
    });
    const sheet = await dictate(page);
    await expect(sheet.getByRole("alert")).toContainText("No hay conexión con el servidor");
    await sheet.getByRole("button", { name: "Reintentar" }).click();

    // El reintento devuelve la misma carga: sigue habiendo una sola pendiente.
    await expect(sheet.getByRole("heading", { name: "Revisá los 2 movimientos" })).toBeVisible();
    const pending = await page.evaluate(async () => (await (await fetch("/api/voice")).json()).items.length);
    expect(pending).toBe(1);

    // Lo mismo ya se cargó en la prueba anterior: posible duplicado.
    await expect(draft(sheet, 1).getByRole("list", { name: "Para revisar" })).toContainText("Ya hay un movimiento parecido: Nafta");
    await sheet.getByRole("button", { name: "Descartar todo" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText("Carga descartada")).toBeVisible();
    const after = await page.evaluate(async () => (await (await fetch("/api/voice")).json()).items.length);
    expect(after).toBe(0);
  });
});

test.describe.serial("voz: escrito", () => {
  test("ingreso con fecha y cuenta dichas; guardar y deshacer", async ({ page }) => {
    await signIn(page, "voiceText");
    const sheet = await write(page, "Ayer me pagaron ciento cincuenta mil de sueldo en el banco");

    await expect(sheet.getByRole("heading", { name: "Revisá el movimiento" })).toBeVisible();
    const income = draft(sheet, 1);
    await expect(income.getByRole("radio", { name: "Ingreso" })).toBeChecked();
    await expect(income.getByLabel("Importe")).toHaveValue("150.000");
    await expect(income.getByLabel("Categoría").locator("option:checked")).toHaveText("Sueldo");
    await expect(income.getByRole("radio", { name: "Banco", exact: true })).toBeChecked();
    await expect(income.getByLabel("Fecha")).toHaveValue(daysAgo(1));

    await sheet.getByRole("button", { name: "Guardar 1 movimiento" }).click();
    await expect(sheet.getByText("Se guardó 1 movimiento")).toBeVisible();
    await expect(sheet.getByRole("list", { name: "Movimientos guardados" })).toContainText(pesos(150_000));
    await sheet.getByRole("button", { name: "Deshacer" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText("Carga deshecha: no se guardó nada")).toBeVisible();

    await page.goto("/movimientos");
    await expect(page.getByRole("main").getByText("Sueldo", { exact: true })).toHaveCount(0);
  });

  test("con dudas pide confirmar; la revisión se retoma desde el inicio", async ({ page }) => {
    await signIn(page, "voiceText");
    const sheet = await write(page, "La semana pasada gasté 15 mil en el super con mercado pago");

    const purchase = draft(sheet, 1);
    const doubts = purchase.getByRole("list", { name: "Para revisar" });
    await expect(doubts).toContainText("Dijiste «La semana pasada»: elegí el día exacto.");
    await expect(doubts).toContainText("No encontramos «mercado pago» entre tus cuentas: elegí una.");
    await expect(purchase.getByRole("radiogroup", { name: "Cuenta del movimiento 1" }).getByRole("radio", { checked: true })).toHaveCount(0);

    // Se cierra sin decidir: queda pendiente en el inicio.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await page.goto("/");
    const resume = page.getByRole("button", { name: /Carga por voz para revisar/ });
    await expect(resume).toContainText("La semana pasada gasté 15 mil");
    await expectNoHorizontalOverflow(page);
    await resume.click();

    const reopened = draft(voiceSheet(page), 1);
    await voiceSheet(page).getByRole("button", { name: "Guardar 1 movimiento" }).click();
    await expect(voiceSheet(page).getByText("Completá los datos marcados.")).toBeVisible();
    await expect(reopened.getByText("Elegí con qué pagaste.")).toBeVisible();

    await reopened.getByRole("radio", { name: "Efectivo", exact: true }).click();
    await reopened.getByLabel("Fecha").fill(daysAgo(6));
    await voiceSheet(page).getByRole("button", { name: "Guardar 1 movimiento" }).click();
    await expect(voiceSheet(page).getByText("Se guardó 1 movimiento")).toBeVisible();
    await voiceSheet(page).getByRole("button", { name: "Listo" }).click();

    await expect(page.getByRole("button", { name: /Carga por voz para revisar/ })).toHaveCount(0);
    await page.goto("/movimientos");
    await expect(transactionRow(page, "Super")).toContainText(pesos(-15_000));
  });

  test("si no se dice ningún importe, lo explica y ofrece escribirlo", async ({ page }) => {
    await signIn(page, "voiceText");
    const sheet = await write(page, "Cargué nafta");
    await expect(sheet.getByRole("heading", { name: "No se pudo cargar" })).toBeVisible();
    await expect(sheet.getByRole("alert")).toHaveText("No encontramos ningún gasto ni ingreso en lo que dijiste.");
    await expect(sheet.getByText("«Cargué nafta»")).toBeVisible();
    await sheet.getByRole("button", { name: "Escribirlo" }).click();
    await expect(sheet.getByLabel("Escribilo como lo dirías")).toBeVisible();
  });
});

/**
 * Sin clave de OpenAI el micrófono usa el reconocimiento de voz del navegador. Playwright no puede
 * hablarle a Chromium: se reemplaza `SpeechRecognition` por uno que «escucha» una frase fija, y se
 * fuerza el modo en `/api/bootstrap` (el servidor E2E tiene transcripción falsa). El resto es real:
 * el texto va a `POST /api/voice/text` y lo interpreta el intérprete local.
 */
test.describe.serial("voz: dictado con el navegador", () => {
  const SAID = "Nafta $50.000 supermercado $32.000";

  async function useBrowserDictation(page: Page, phrase: string | null) {
    await page.addInitScript((heard) => {
      class FakeRecognition {
        lang = "";
        continuous = false;
        interimResults = false;
        maxAlternatives = 1;
        onstart: (() => void) | null = null;
        onresult: ((event: unknown) => void) | null = null;
        onerror: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          setTimeout(() => {
            this.onstart?.();
            if (heard) this.onresult?.({ results: [Object.assign([{ transcript: heard, confidence: 0.9 }], { isFinal: true })] });
          }, 50);
        }
        stop() {
          setTimeout(() => {
            if (!heard) this.onerror?.({ error: "no-speech" });
            this.onend?.();
          }, 20);
        }
        abort() {
          setTimeout(() => this.onend?.(), 0);
        }
      }
      Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
    }, phrase);
    await page.route("**/api/bootstrap", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({ response, json: { ...body, voice: { transcription: "browser" } } });
    });
  }

  test("lo dictado se ve mientras se habla y se interpreta como texto", async ({ page }) => {
    await useBrowserDictation(page, SAID);
    let audioPosted = false;
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/voice") audioPosted = true;
    });
    const bootstrap = page.waitForResponse("**/api/bootstrap");
    await signIn(page, "voiceBrowser");
    await bootstrap;

    await page.getByRole("button", { name: "Cargar por voz" }).click();
    const sheet = voiceSheet(page);
    await expect(sheet.getByRole("heading", { name: "Te escucho…" })).toBeVisible();
    await expect(sheet.getByLabel("Lo que vamos entendiendo")).toHaveText(`«${SAID}»`);
    await sheet.getByRole("button", { name: "Listo, procesar" }).click();

    await expect(sheet.getByRole("heading", { name: "Revisá los 2 movimientos" })).toBeVisible();
    await expect(sheet.getByText("Escuchamos")).toBeVisible();
    await expect(sheet.getByText(`«${SAID}»`)).toBeVisible();
    await expect(draft(sheet, 1).getByLabel("Importe")).toHaveValue("50.000");
    await expect(draft(sheet, 1).getByLabel("Categoría").locator("option:checked")).toHaveText("Combustible");
    await expect(draft(sheet, 2).getByLabel("Importe")).toHaveValue("32.000");
    expect(audioPosted).toBe(false);

    await sheet.getByRole("button", { name: "Guardar 2 movimientos" }).click();
    await expect(sheet.getByText("Se guardaron 2 movimientos")).toBeVisible();
    await sheet.getByRole("button", { name: "Listo" }).click();
    await page.goto("/movimientos");
    await expect(transactionRow(page, "Nafta")).toContainText(pesos(-50_000));
  });

  test("si no se escucha nada, lo dice y ofrece escribirlo", async ({ page }) => {
    await useBrowserDictation(page, null);
    const bootstrap = page.waitForResponse("**/api/bootstrap");
    await signIn(page, "voiceBrowser");
    await bootstrap;

    await page.getByRole("button", { name: "Cargar por voz" }).click();
    const sheet = voiceSheet(page);
    await expect(sheet.getByRole("heading", { name: "Te escucho…" })).toBeVisible();
    await sheet.getByRole("button", { name: "Listo, procesar" }).click();
    await expect(sheet.getByRole("alert")).toHaveText("No te escuchamos. Tocá el micrófono y contá qué gastaste o cobraste.");
    await sheet.getByRole("button", { name: "Escribirlo" }).click();
    await expect(sheet.getByLabel("Escribilo como lo dirías")).toBeVisible();
  });

  test("un navegador sin dictado ofrece el micrófono del teclado", async ({ page }) => {
    await page.addInitScript(() => Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined }));
    await page.route("**/api/bootstrap", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({ response, json: { ...body, voice: { transcription: "browser" } } });
    });
    const bootstrap = page.waitForResponse("**/api/bootstrap");
    await signIn(page, "voiceBrowser");
    await bootstrap;

    await page.getByRole("button", { name: "Cargar por voz" }).click();
    const sheet = voiceSheet(page);
    await expect(sheet.getByText("Este navegador no permite dictar dentro de la app.")).toBeVisible();
    await expect(sheet.getByLabel("Escribilo como lo dirías")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Mejor dictarlo" })).toHaveCount(0);
  });
});

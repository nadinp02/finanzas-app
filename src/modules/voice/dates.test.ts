import { describe, expect, it } from "vitest";
import { findDateMentions } from "./dates";

// Jueves 5 de noviembre de 2026.
const TODAY = "2026-11-05";
const dates = (text: string) => findDateMentions(text, TODAY).map((m) => m.date);

describe("fechas dichas", () => {
  it("relativas", () => {
    expect(dates("hoy")).toEqual(["2026-11-05"]);
    expect(dates("ayer")).toEqual(["2026-11-04"]);
    expect(dates("anoche")).toEqual(["2026-11-04"]);
    expect(dates("anteayer")).toEqual(["2026-11-03"]);
    expect(dates("antes de ayer")).toEqual(["2026-11-03"]);
    expect(dates("hace 3 días")).toEqual(["2026-11-02"]);
    expect(dates("hace una semana")).toEqual(["2026-10-29"]);
  });

  it("días de la semana: el último antes de hoy", () => {
    expect(dates("el lunes")).toEqual(["2026-11-02"]);
    expect(dates("el miércoles")).toEqual(["2026-11-04"]);
    // Hoy es jueves: "el jueves" es el de la semana pasada.
    expect(dates("el jueves")).toEqual(["2026-10-29"]);
    expect(dates("el sábado pasado")).toEqual(["2026-10-31"]);
  });

  it("días del mes, con o sin mes", () => {
    expect(dates("el 3")).toEqual(["2026-11-03"]);
    // El 28 todavía no llegó este mes: es el de octubre.
    expect(dates("el 28")).toEqual(["2026-10-28"]);
    expect(dates("el día quince")).toEqual(["2026-10-15"]);
    expect(dates("el 15 de octubre")).toEqual(["2026-10-15"]);
    expect(dates("15 de diciembre")).toEqual(["2025-12-15"]);
    expect(dates("el primero de noviembre")).toEqual(["2026-11-01"]);
    expect(dates("3/11")).toEqual(["2026-11-03"]);
    expect(dates("el 31 de septiembre")).toEqual([null]);
  });

  it("vagas: se devuelven sin fecha para pedir confirmación", () => {
    expect(dates("la semana pasada")).toEqual([null]);
    expect(dates("el otro día")).toEqual([null]);
  });

  it("no confunde importes con fechas", () => {
    expect(dates("gasté 15 mil en el super")).toEqual([]);
    expect(dates("el 50 mil")).toEqual([]);
    expect(dates("ayer nafta 50 mil y el lunes super 30 mil")).toEqual(["2026-11-04", "2026-11-02"]);
  });

  it("devuelve el texto original", () => {
    const [mention] = findDateMentions("Pagué el Miércoles", TODAY);
    expect(mention?.text).toBe("el Miércoles");
  });
});

import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dateInMonth,
  daysInMonth,
  diffDays,
  diffMonths,
  formatDayHeading,
  formatMonth,
  formatShortDate,
  fromDbDate,
  isLocalDate,
  isoWeekKey,
  todayIn,
  toDbDate,
} from "./dates";

describe("todayIn", () => {
  it("usa la zona horaria de Córdoba (UTC−3)", () => {
    // 02:30 UTC del 5 de noviembre son las 23:30 del 4 en Argentina.
    expect(todayIn("America/Argentina/Cordoba", new Date("2026-11-05T02:30:00Z"))).toBe("2026-11-04");
    expect(todayIn("America/Argentina/Cordoba", new Date("2026-11-05T03:00:00Z"))).toBe("2026-11-05");
  });
});

describe("validación", () => {
  it("acepta solo fechas de calendario reales", () => {
    expect(isLocalDate("2026-02-28")).toBe(true);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2026-13-01")).toBe(false);
    expect(isLocalDate("2026-1-01")).toBe(false);
  });
});

describe("aritmética de fechas", () => {
  it("suma días cruzando meses y años", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-11-04", "2026-10-30")).toBe(5);
  });

  it("suma meses", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(diffMonths("2027-02", "2026-11")).toBe(3);
  });

  it("acota días al largo del mes", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(dateInMonth("2026-02", 31)).toBe("2026-02-28");
    expect(dateInMonth("2026-04", 31)).toBe("2026-04-30");
  });

  it("calcula semanas ISO", () => {
    expect(isoWeekKey("2026-11-04")).toBe("2026-W45");
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2024-12-30")).toBe("2025-W01");
  });

  it("convierte desde y hacia DATE de Prisma sin corrimientos", () => {
    expect(fromDbDate(toDbDate("2026-11-04"))).toBe("2026-11-04");
  });
});

describe("formatos en español", () => {
  it("encabezados de día", () => {
    expect(formatDayHeading("2026-11-04", "2026-11-04")).toBe("Hoy");
    expect(formatDayHeading("2026-11-03", "2026-11-04")).toBe("Ayer");
    expect(formatDayHeading("2026-11-02", "2026-11-04")).toBe("lunes 2 de noviembre");
    expect(formatDayHeading("2025-11-03", "2026-11-04")).toBe("lunes 3 de noviembre de 2025");
  });

  it("fechas cortas y meses", () => {
    expect(formatShortDate("2026-11-03", "2026-11-04")).toBe("3 nov");
    expect(formatShortDate("2025-11-03", "2026-11-04")).toBe("3 nov 2025");
    expect(formatMonth("2026-11", 2026)).toBe("noviembre");
    expect(formatMonth("2025-12", 2026)).toBe("diciembre 2025");
  });
});

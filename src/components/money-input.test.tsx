// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { displayFromDecimal, MoneyInput, parseTyping } from "./money-input";

describe("parseTyping", () => {
  it("agrupa miles mientras se escribe", () => {
    expect(parseTyping("69500", "6950", false)).toEqual({ display: "69.500", value: "69500.00" });
    expect(parseTyping("1234567", "", false)).toEqual({ display: "1.234.567", value: "1234567.00" });
  });

  it("usa coma decimal y limita a dos decimales", () => {
    expect(parseTyping("69.500,505", "69.500,50", false)).toEqual({ display: "69.500,50", value: "69500.50" });
    expect(parseTyping("0,5", "0,", false)).toEqual({ display: "0,5", value: "0.50" });
  });

  it("toma un punto recién tecleado como coma", () => {
    expect(parseTyping("12.", "12", false)).toEqual({ display: "12,", value: "12.00" });
  });

  it("ignora el signo salvo que se permita", () => {
    expect(parseTyping("-500", "", false).value).toBe("500.00");
    expect(parseTyping("-500", "", true).value).toBe("-500.00");
  });

  it("formatea valores existentes", () => {
    expect(displayFromDecimal("69500.00")).toBe("69.500");
    expect(displayFromDecimal("69500.50")).toBe("69.500,50");
  });
});

function Harness() {
  const [value, setValue] = useState("");
  return (
    <>
      <MoneyInput aria-label="Importe" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("MoneyInput", () => {
  it("emite el valor decimal normalizado", async () => {
    render(<Harness />);
    const input = screen.getByLabelText("Importe");
    await userEvent.type(input, "69500,5");
    expect(input).toHaveValue("69.500,5");
    expect(screen.getByTestId("value")).toHaveTextContent("69500.50");
  });
});

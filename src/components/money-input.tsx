"use client";

import { cn } from "cn";
import { useState, type ComponentProps } from "react";
import { parseDecimal, toDecimal } from "@/lib/money";

const MAX_INTEGER_DIGITS = 12;

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "69500.50" → "69.500,50"; "69500.00" → "69.500". */
export function displayFromDecimal(value: string): string {
  if (!value) return "";
  const cents = parseDecimal(value);
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const fraction = abs % 100n;
  const text = group((abs / 100n).toString()) + (fraction ? `,${fraction.toString().padStart(2, "0")}` : "");
  return negative ? `-${text}` : text;
}

/**
 * Interpreta lo que se va escribiendo con formato argentino (miles con punto, decimales con coma).
 * Un punto recién tecleado sin coma previa se toma como coma: algunos teclados solo tienen punto.
 */
export function parseTyping(next: string, previous: string, allowNegative: boolean): { display: string; value: string } {
  let raw = next;
  if (raw.length === previous.length + 1 && raw.endsWith(".") && !previous.includes(",")) {
    raw = `${raw.slice(0, -1)},`;
  }
  const negative = allowNegative && raw.trim().startsWith("-");
  const [integerRaw = "", ...rest] = raw.split(",");
  const integer = integerRaw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, MAX_INTEGER_DIGITS);
  const fraction = rest.join("").replace(/\D/g, "").slice(0, 2);
  const hasComma = raw.includes(",");
  const shownInteger = integer ? group(integer) : hasComma ? "0" : "";
  const display = `${negative ? "-" : ""}${shownInteger}${hasComma ? `,${fraction}` : ""}`;
  if (!integer && !fraction) return { display, value: "" };
  const cents = BigInt(integer || "0") * 100n + BigInt(fraction.padEnd(2, "0"));
  return { display, value: toDecimal(negative ? -cents : cents) };
}

interface MoneyInputProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "size"> {
  /** String decimal ("69500.50") o vacío. */
  value: string;
  onChange: (value: string) => void;
  allowNegative?: boolean;
  size?: "default" | "hero";
}

export function MoneyInput({ value, onChange, allowNegative = false, size = "default", className, ...props }: MoneyInputProps) {
  const [display, setDisplay] = useState(() => displayFromDecimal(value));
  const [lastValue, setLastValue] = useState(value);

  // Si el valor cambia desde afuera (reset, edición), se vuelve a formatear.
  if (value !== lastValue) {
    setLastValue(value);
    if (parseTyping(display, display, allowNegative).value !== value) setDisplay(displayFromDecimal(value));
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-3.5 font-semibold text-muted-foreground",
          size === "hero" ? "left-0 text-[28px]" : "text-base",
        )}
      >
        $
      </span>
      <input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        data-amount
        value={display}
        onChange={(event) => {
          const parsed = parseTyping(event.target.value, display, allowNegative);
          setDisplay(parsed.display);
          setLastValue(parsed.value);
          onChange(parsed.value);
        }}
        placeholder="0"
        className={cn(
          "w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/50",
          size === "hero"
            ? "h-14 pl-7 text-[40px] leading-none font-bold tracking-tight"
            : "h-11 rounded-xl border border-input bg-card pr-3.5 pl-8 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 aria-invalid:border-destructive md:text-[15px]",
        )}
      />
    </div>
  );
}

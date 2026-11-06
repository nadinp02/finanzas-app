import { cn } from "cn";
import { formatMoney, parseDecimal, type Cents, type FormatMoneyOptions } from "@/lib/money";

type Tone = "default" | "positive" | "negative" | "muted";

const TONES: Record<Tone, string> = {
  default: "text-foreground",
  positive: "text-positive",
  negative: "text-negative",
  muted: "text-muted-foreground",
};

interface AmountProps extends FormatMoneyOptions {
  value: Cents | string;
  tone?: Tone;
  className?: string;
}

/** Importe con formato argentino y dígitos tabulares. Acepta centavos o string decimal. */
export function Amount({ value, tone = "default", className, ...options }: AmountProps) {
  const cents = typeof value === "bigint" ? value : parseDecimal(value);
  return (
    <span data-amount className={cn("whitespace-nowrap", TONES[tone], className)}>
      {formatMoney(cents, options)}
    </span>
  );
}

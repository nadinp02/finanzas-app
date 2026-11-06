import { Banknote, CreditCard, Landmark, PiggyBank, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import type { AccountType } from "@/generated/prisma/enums";

const ICONS: Record<AccountType, LucideIcon> = {
  CASH: Banknote,
  DIGITAL_WALLET: Smartphone,
  BANK: Landmark,
  SAVINGS: PiggyBank,
  CREDIT_CARD: CreditCard,
  OTHER: Wallet,
};

export function AccountIcon({ type }: { type: AccountType | string }) {
  const Icon = ICONS[type as AccountType] ?? Wallet;
  return (
    <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
      <Icon className="size-[1.1rem]" />
    </span>
  );
}

import "server-only";
import { todayIn, toDbDate } from "@/lib/dates";
import { errors } from "@/lib/errors";
import { audit } from "@/server/audit";
import { transaction } from "@/server/db";
import { createCardInTx } from "@/modules/cards/service";
import type { OnboardingInput } from "./schema";

/**
 * Configuración inicial: fecha de inicio del registro, cuentas con sus saldos actuales y tarjetas con
 * su deuda pendiente, todo en una transacción. Los informes no muestran nada anterior al inicio.
 */
export async function completeOnboarding(userId: string, input: OnboardingInput, today = todayIn()): Promise<void> {
  if (input.trackingStartDate > today) {
    throw errors.validation({ trackingStartDate: "La fecha de inicio no puede ser futura." });
  }
  await transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { onboardedAt: true } });
    if (user.onboardedAt) throw errors.conflict("ALREADY_ONBOARDED", "La configuración inicial ya se completó.");

    const refs = new Map<string, string>();
    for (const [index, account] of input.accounts.entries()) {
      const created = await tx.account.create({
        data: {
          userId,
          name: account.name,
          type: account.type,
          institution: account.institution ?? null,
          openingBalance: account.openingBalance,
          openingDate: toDbDate(input.trackingStartDate),
          sortOrder: index,
        },
        select: { id: true },
      });
      refs.set(account.ref, created.id);
    }

    for (const card of input.cards) {
      const paymentAccountId = card.paymentAccountRef ? refs.get(card.paymentAccountRef) : undefined;
      if (card.paymentAccountRef && !paymentAccountId) {
        throw errors.validation({ cards: `La cuenta de pago de ${card.name} no existe.` });
      }
      const created = await createCardInTx(tx, userId, {
        name: card.name,
        institution: card.institution,
        creditLimit: card.creditLimit,
        closingDay: card.closingDay,
        dueDay: card.dueDay,
        paymentAccountId,
        openingDate: input.trackingStartDate,
        openingStatementBalance: card.openingStatementBalance,
        openingUnbilledBalance: card.openingUnbilledBalance,
        preexistingPlans: card.preexistingPlans,
      });
      refs.set(card.ref, created.id);
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        trackingStartDate: toDbDate(input.trackingStartDate),
        onboardedAt: new Date(),
        defaultAccountId: input.defaultAccountRef ? (refs.get(input.defaultAccountRef) ?? null) : null,
        voiceAutoSave: input.voiceAutoSave,
      },
    });
    await audit({ userId, action: "ONBOARDING_COMPLETED", metadata: { accounts: input.accounts.length, cards: input.cards.length } }, tx);
  });
}

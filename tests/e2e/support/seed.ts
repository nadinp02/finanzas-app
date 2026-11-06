/**
 * Datos iniciales de las pruebas E2E. Corre con `tsx --conditions=react-server` contra la base E2E
 * (lo invoca server.ts) usando los mismos servicios que la app: alta real y configuración inicial.
 */
import { addMonths, firstDayOfMonth, monthOf, todayIn } from "@/lib/dates";
import { createUser } from "@/modules/auth/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import { prisma } from "@/server/db";
import { E2E_PASSWORD, E2E_USERS } from "./constants";

// Dos meses antes: hay al menos un resumen de la Visa cerrado para poder cargar compras y pagarlo.
const trackingStartDate = firstDayOfMonth(addMonths(monthOf(todayIn()), -2));

try {
  for (const user of Object.values(E2E_USERS)) {
    const created = await createUser({ email: user.email, name: user.name, password: E2E_PASSWORD });
    if (!user.onboarded) continue;
    await completeOnboarding(created.id, {
      trackingStartDate,
      accounts: [
        { ref: "cash", name: "Efectivo", type: "CASH", openingBalance: "50000" },
        { ref: "bank", name: "Banco", type: "BANK", openingBalance: "500000" },
      ],
      cards: [
        {
          ref: "visa",
          name: "Visa",
          closingDay: 26,
          dueDay: 7,
          paymentAccountRef: "bank",
          openingStatementBalance: "0",
          openingUnbilledBalance: "0",
          preexistingPlans: [],
        },
      ],
      defaultAccountRef: "cash",
      voiceAutoSave: false,
    });
  }
  console.log(`Datos E2E listos (inicio del registro: ${trackingStartDate}).`);
} finally {
  await prisma.$disconnect();
}

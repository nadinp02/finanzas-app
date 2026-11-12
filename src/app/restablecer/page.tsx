import type { Metadata } from "next";
import { AuthPage } from "@/modules/auth/components/auth-page";
import { PasswordResetConfirmForm } from "@/modules/auth/components/password-reset-forms";

// El token viaja en la URL: que no se filtre a otros sitios por el encabezado Referer.
export const metadata: Metadata = { title: "Contraseña nueva", referrer: "no-referrer" };

export default function ResetPage() {
  return (
    <AuthPage title="Elegí una contraseña nueva" subtitle="Al guardarla se cierran las sesiones abiertas en otros dispositivos.">
      <PasswordResetConfirmForm />
    </AuthPage>
  );
}

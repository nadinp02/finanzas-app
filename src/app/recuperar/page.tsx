import type { Metadata } from "next";
import { AuthLink, AuthPage } from "@/modules/auth/components/auth-page";
import { PasswordResetRequestForm } from "@/modules/auth/components/password-reset-forms";

export const metadata: Metadata = { title: "Recuperar la contraseña" };

export default function RecoverPage() {
  return (
    <AuthPage
      title="¿Olvidaste la contraseña?"
      subtitle="Te mandamos un enlace por email para elegir una nueva."
      footer={<AuthLink href="/login">Volver a ingresar</AuthLink>}
    >
      <PasswordResetRequestForm />
    </AuthPage>
  );
}

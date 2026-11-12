import type { Metadata } from "next";
import { APP_NAME } from "@/lib/app";
import { AuthLink, AuthPage } from "@/modules/auth/components/auth-page";
import { RegisterForm } from "@/modules/auth/components/register-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <AuthPage
      title="Creá tu cuenta"
      subtitle={`Tus gastos e ingresos en ${APP_NAME}. Solo vos ves tus datos.`}
      footer={
        <p className="text-muted-foreground">
          ¿Ya tenés cuenta? <AuthLink href="/login">Ingresá</AuthLink>
        </p>
      }
    >
      <RegisterForm />
    </AuthPage>
  );
}

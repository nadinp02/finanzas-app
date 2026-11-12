import type { Metadata } from "next";
import { APP_NAME } from "@/lib/app";
import { AuthLink, AuthPage } from "@/modules/auth/components/auth-page";
import { LoginForm } from "@/modules/auth/components/login-form";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <AuthPage
      title="Hola de nuevo"
      subtitle={`Ingresá a ${APP_NAME} para ver tus números.`}
      footer={
        <>
          <AuthLink href="/recuperar">¿Olvidaste la contraseña?</AuthLink>
          <p className="text-muted-foreground">
            ¿No tenés cuenta? <AuthLink href="/registro">Creá una</AuthLink>
          </p>
        </>
      }
    >
      <LoginForm />
    </AuthPage>
  );
}

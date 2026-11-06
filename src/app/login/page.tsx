import type { Metadata } from "next";
import { BrandMark } from "@/components/brand-mark";
import { APP_NAME } from "@/lib/app";
import { LoginForm } from "@/modules/auth/components/login-form";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 pt-safe pb-safe">
      <div className="mb-10">
        <BrandMark className="size-12" />
        <h1 className="mt-6 text-[28px] leading-tight font-bold">Hola de nuevo</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">Ingresá a {APP_NAME} para ver tus números.</p>
      </div>
      <LoginForm />
      <p className="mt-10 text-[13px] leading-relaxed text-muted-foreground">
        ¿Olvidaste la contraseña? Se restablece con <code className="font-mono text-xs">npm run user:reset-password</code>{" "}
        (ver README).
      </p>
    </main>
  );
}

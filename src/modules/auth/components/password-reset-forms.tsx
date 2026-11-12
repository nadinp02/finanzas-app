"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api-client";
import { z } from "@/lib/validation";
import { PASSWORD_MIN_LENGTH, passwordResetRequestSchema, passwordSchema, type PasswordResetRequestInput } from "../schema";
import { AuthLink, FormAlert } from "./auth-page";

/** Pide el enlace por email. La respuesta es la misma exista o no la cuenta. */
export function PasswordResetRequestForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api("/api/auth/password-reset", { method: "POST", body: values });
      setSentTo(values.email);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  if (sentTo) {
    return (
      <div className="grid gap-4">
        <FormAlert tone="success">
          Si hay una cuenta con {sentTo}, te mandamos un enlace para elegir una contraseña nueva. Vence en una hora. Si no
          lo ves, revisá la carpeta de spam.
        </FormAlert>
        <Button variant="outline" onClick={() => setSentTo(null)}>
          Mandarlo de nuevo
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField id="email" label="Email de tu cuenta" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          aria-invalid={!!errors.email}
          {...form.register("email")}
        />
      </FormField>
      {formError && <FormAlert>{formError}</FormAlert>}
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Mandarme el enlace
      </Button>
    </form>
  );
}

const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((values) => values.password === values.confirm, { path: ["confirm"], error: "Las contraseñas no coinciden." });

type NewPasswordInput = z.infer<typeof newPasswordSchema>;

/** Elige la contraseña nueva con el token del enlace (se lee de la URL y se quita de la barra). */
export function PasswordResetConfirmForm() {
  const router = useRouter();
  // undefined: todavía no se leyó la URL; null: el enlace no trae token.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token");
    // Que el token no quede en el historial ni se comparta al copiar la dirección.
    if (value) window.history.replaceState(null, "", window.location.pathname);
    const timer = window.setTimeout(() => setToken(value), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!token) return;
    setFormError(null);
    try {
      await api("/api/auth/password-reset/confirm", { method: "POST", body: { token, password: values.password } });
      router.replace("/");
      router.refresh();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  if (token === undefined) return null;
  if (token === null) {
    return (
      <div className="grid gap-4">
        <FormAlert>Este enlace no es válido. Pedí uno nuevo.</FormAlert>
        <AuthLink href="/recuperar">Pedir un enlace nuevo</AuthLink>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField id="password" label="Contraseña nueva" error={errors.password?.message} hint={`Al menos ${PASSWORD_MIN_LENGTH} caracteres.`}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </FormField>
      <FormField id="confirm" label="Repetí la contraseña" error={errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={!!errors.confirm} {...form.register("confirm")} />
      </FormField>
      {formError && (
        <div className="grid gap-2">
          <FormAlert>{formError}</FormAlert>
          <AuthLink href="/recuperar">Pedir un enlace nuevo</AuthLink>
        </div>
      )}
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Guardar e ingresar
      </Button>
    </form>
  );
}

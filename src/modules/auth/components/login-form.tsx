"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api-client";
import { loginSchema, type LoginInput } from "../schema";

/** Solo rutas internas: evita redirecciones abiertas con ?next=https://… */
function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: values });
      router.replace(safeNext());
      router.refresh();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField id="email" label="Email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          aria-invalid={!!errors.email}
          {...form.register("email")}
        />
      </FormField>
      <FormField id="password" label="Contraseña" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          {...form.register("password")}
        />
      </FormField>
      {formError && (
        <p role="alert" className="rounded-xl bg-negative-soft px-3.5 py-3 text-sm font-medium text-negative">
          {formError}
        </p>
      )}
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Ingresar
      </Button>
    </form>
  );
}

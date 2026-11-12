"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { PASSWORD_MIN_LENGTH, registerSchema, type RegisterInput } from "../schema";
import { FormAlert } from "./auth-page";

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api("/api/auth/register", { method: "POST", body: values });
      router.replace("/bienvenida");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        for (const [field, message] of Object.entries(error.fields)) {
          if (field === "name" || field === "email" || field === "password") form.setError(field, { message });
        }
      }
      setFormError(errorMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormField id="name" label="Nombre" error={errors.name?.message}>
        <Input id="name" autoComplete="given-name" aria-invalid={!!errors.name} {...form.register("name")} />
      </FormField>
      <FormField id="email" label="Email" error={errors.email?.message}>
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
      <FormField id="password" label="Contraseña" error={errors.password?.message} hint={`Al menos ${PASSWORD_MIN_LENGTH} caracteres.`}>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register("password")} />
      </FormField>
      {formError && <FormAlert>{formError}</FormAlert>}
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" />}
        Crear cuenta
      </Button>
    </form>
  );
}

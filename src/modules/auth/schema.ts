import { z } from "@/lib/validation";

export const PASSWORD_MIN_LENGTH = 10;

export const loginSchema = z.object({
  email: z.email({ error: "Ingresá un email válido." }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Ingresá tu contraseña." }).max(200),
});

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `Usá al menos ${PASSWORD_MIN_LENGTH} caracteres.` })
  .max(200, { error: "Máximo 200 caracteres." });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { error: "Ingresá tu contraseña actual." }),
  newPassword: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;

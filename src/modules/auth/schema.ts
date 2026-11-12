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

export const registerSchema = z.object({
  name: z.string({ error: "Ingresá tu nombre." }).trim().min(1, { error: "Ingresá tu nombre." }).max(80, { error: "Máximo 80 caracteres." }),
  email: z.email({ error: "Ingresá un email válido." }).trim().toLowerCase().max(254),
  password: passwordSchema,
});

export const passwordResetRequestSchema = z.object({
  email: z.email({ error: "Ingresá un email válido." }).trim().toLowerCase().max(254),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(20, { error: "El enlace no es válido." }).max(200, { error: "El enlace no es válido." }),
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;

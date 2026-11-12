# Despliegue en Vercel

Todo en planes gratuitos: **Vercel** (app, dominio `*.vercel.app`), **Neon** (PostgreSQL) y **Brevo**
(emails de recuperación de contraseña). Cada persona crea su cuenta en `/registro` y solo ve sus datos.

## 1. Subir el código a GitHub

Crear un repositorio (puede ser privado) y subir el proyecto. `.env` no se sube (está en `.gitignore`).

## 2. Crear el proyecto en Vercel

1. En https://vercel.com → **Add New… › Project** → importar el repositorio. Framework: Next.js (se
   detecta solo). No hace falta cambiar comandos: Vercel corre `npm run vercel-build`, que aplica las
   migraciones (`prisma migrate deploy`) y compila.
2. El primer despliegue va a fallar porque todavía no hay base: es esperable.

## 3. Base de datos (Neon)

1. En el proyecto de Vercel → **Storage › Create Database › Neon** (plan Free) y conectarla al proyecto
   para todos los entornos.
2. Vercel agrega solas `DATABASE_URL` (con pooler, la usa la app) y `DATABASE_URL_UNPOOLED` (directa, la
   usan las migraciones). No hay que copiar nada.

> Los despliegues de vista previa (ramas) comparten la misma base y también aplican migraciones. Para un
> grupo de amigos alcanza; si más adelante se quiere separar, Neon permite una rama de base por entorno.

## 4. Emails de recuperación (Brevo)

Resend y la mayoría de los servicios exigen un dominio propio verificado para enviar a cualquier
dirección; un `*.vercel.app` no se puede verificar. Brevo permite verificar **solo la dirección del
remitente** (por ejemplo, tu Gmail).

1. Crear una cuenta gratis en https://www.brevo.com (300 emails por día).
2. **Senders, Domains & Dedicated IPs › Senders › Add a sender**: tu nombre y tu email. Confirmar el email
   que llega a esa casilla.
3. **SMTP & API › API Keys › Generate a new API key**. Copiarla.

Con una dirección de Gmail como remitente, algunos emails pueden ir a spam (el remitente no coincide con
el servidor que envía). La pantalla de recuperación ya avisa que revisen esa carpeta. Con un dominio
propio, verificarlo en Brevo (o usar Resend) lo resuelve.

## 5. Variables de entorno en Vercel

**Settings › Environment Variables** (para Production y Preview):

| Variable | Valor | Obligatoria |
|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Las agrega la integración de Neon | Sí |
| `BREVO_API_KEY` | La clave del paso 4 | Para recuperar contraseñas |
| `EMAIL_FROM` | `Cuentas Claras <tu-email-verificado@gmail.com>` | Para recuperar contraseñas |
| `APP_URL` | `https://tu-proyecto.vercel.app` | No: si falta, se usa el dominio de producción que informa Vercel |
| `CRON_SECRET` | Un texto largo al azar | No (cron, fase 5) |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Vacías | No: sin ellas la voz usa el dictado del navegador y el intérprete local, gratis. Si se cargan, el uso de **todas** las cuentas se cobra a quien puso la clave |

Sin `BREVO_API_KEY` la app funciona igual, pero «¿Olvidaste la contraseña?» no envía nada (queda un error
en los logs de Vercel). En ese caso se puede restablecer a mano con `npm run user:reset-password` apuntando
`DATABASE_URL` a la base de Neon.

## 6. Desplegar y probar

1. **Deployments › Redeploy** (o hacer un push). El log debe mostrar `prisma migrate deploy` aplicando las
   migraciones y después el build.
2. Abrir `https://tu-proyecto.vercel.app/registro`, crear una cuenta y completar la bienvenida.
3. Cerrar sesión, ir a «¿Olvidaste la contraseña?» y verificar que llegue el email y que el enlace funcione.
4. Desde el teléfono: abrir la app y **Agregar a la pantalla de inicio** para usarla como app (PWA). La
   voz necesita HTTPS, que Vercel ya da.

## Límites de los planes gratuitos

- **Neon Free**: 0,5 GB de almacenamiento; la base se suspende tras unos minutos sin uso y el primer
  pedido después tarda ~1 s más. Sobra para un grupo de amigos.
- **Vercel Hobby**: uso personal y no comercial.
- **Brevo Free**: 300 emails por día.

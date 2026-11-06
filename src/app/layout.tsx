import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, THEME_COLOR } from "@/lib/app";
import { ServiceWorkerProvider } from "@/modules/offline/components/service-worker-provider";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={manrope.variable}>
      <body className="min-h-dvh">
        <ServiceWorkerProvider>{children}</ServiceWorkerProvider>
        <Toaster position="top-center" offset={{ top: "calc(env(safe-area-inset-top) + 12px)" }} />
      </body>
    </html>
  );
}

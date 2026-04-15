import type { Metadata } from "next";
import { PWARegister } from "@/components/pwa-register";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Luka Poke House - Sistema de Gestion",
  description: "ERP para cadena de pokes Luka",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Luka System" />
        <link rel="apple-touch-icon" href="/luka-logo.png" />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
        <PWARegister />
      </body>
    </html>
  );
}

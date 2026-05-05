import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import "./globals.css";

const appSans = Inter({
  subsets: ["latin"],
  variable: "--font-app-sans",
  display: "swap",
});

const appMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-app-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: `${BRAND_TAGLINE}: pedidos, stock y facturacion`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${appSans.variable} ${appMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

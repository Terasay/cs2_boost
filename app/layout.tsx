import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./refresh.css";
import "./order-pricing.css";
import "./two-factor.css";
import "./interface.css";
import "./tactical.css";
import "./legal.css";

export const metadata: Metadata = {
  title: "CS2 Boost — Premier & FACEIT",
  description: "CS2 Premier and FACEIT boosts from 500 RUB. Calculate your price and duration, choose duo or piloted play, and track your order in your account.",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "120x120" }],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = (await headers()).get("x-site-language") === "en" ? "en" : "ru";
  return (
    <html lang={lang}>
      <body className="antialiased">{children}</body>
    </html>
  );
}

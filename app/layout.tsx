import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./refresh.css";

export const metadata: Metadata = {
  title: "CS2 Boost — Premier & FACEIT",
  description: "Configure a CS2 Premier or FACEIT boost and request a personal quote.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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

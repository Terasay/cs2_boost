import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CS2 Boost — Premier & FACEIT",
  description: "Configure a CS2 Premier or FACEIT boost and request a personal quote.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}

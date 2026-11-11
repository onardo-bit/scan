import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/shell";

const grotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-space-grotesk",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "GiftScope — сканер рынка NFT-подарков",
  description:
    "Сканер флоров NFT-подарков Telegram в реальном времени: каталог, поиск, мониторинг цен, избранное и полная история изменений.",
};

export const viewport: Viewport = {
  themeColor: "#04070d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${grotesk.variable} ${jetbrains.variable}`}>
      <body className="noise">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}

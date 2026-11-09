import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Self-hosted: on some build hosts (Vercel, the macOS release runner) Google Fonts serves Fraunces
// with font URLs that Turbopack's next/font/google can't resolve ("next/font/google queries have
// exactly one entry"), failing the whole build. This is the same variable Latin file Google serves
// for weights 500 and 600; its OFL license sits next to it.
const fraunces = localFont({
  src: "./fonts/fraunces-latin.woff2",
  weight: "500 600",
  variable: "--font-fraunces",
  adjustFontFallback: "Times New Roman",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PMA Lyrics Studio — letras bilíngues para o ProPresenter",
  description: "Gere alinhamentos de letras bilíngues com IA e exporte direto para o ProPresenter 7.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans bg-cream-50 text-ink">{children}</body>
    </html>
  );
}

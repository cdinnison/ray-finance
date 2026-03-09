import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import { Analytics } from "@vercel/analytics/react";
import { Footer } from "@/components/footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://rayfinance.app"),
  title: "Ray — AI Financial Advisor, Running Locally",
  description:
    "An open-source CLI that connects to your bank and gives you AI-powered financial advice — all running locally on your machine.",
  keywords: [
    "AI financial advisor",
    "personal finance CLI",
    "local-first finance",
    "AI budgeting tool",
    "open source finance",
    "Plaid CLI",
    "financial planning AI",
  ],
  authors: [{ name: "Clark Dinnison" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Ray — AI Financial Advisor, Running Locally",
    description:
      "An open-source CLI that connects to your bank and gives you AI-powered financial advice — all running locally on your machine.",
    url: "https://rayfinance.app",
    siteName: "Ray Finance",
    type: "website",
    images: [
      {
        url: "/ray-og.jpg",
        width: 1200,
        height: 630,
        alt: "Ray — AI Financial Advisor CLI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ray — AI Financial Advisor, Running Locally",
    description:
      "An open-source CLI that connects to your bank and gives you AI-powered financial advice — all running locally on your machine.",
    images: ["/ray-og.jpg"],
  },
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable}`} style={{ colorScheme: "light" }}>
      <body className="bg-sand-50 text-stone-900 font-sans">{children}<Footer /><Analytics /></body>
    </html>
  );
}

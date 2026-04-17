import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import { Analytics } from "@vercel/analytics/react";
import { Footer } from "@/components/footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://rayfinance.app"),
  title: "Ray — The Finance App That Tells You What To Do",
  description:
    "Other finance apps show you what you spent. Ray tells you what to do. An open-source AI financial advisor that learns your full situation, uses your real bank data, and runs locally on your machine.",
  keywords: [
    "AI financial advisor",
    "personal finance CLI",
    "local-first finance",
    "AI budgeting tool",
    "open source finance",
    "Plaid CLI",
    "financial planning AI",
    "best money app",
    "best budgeting app",
    "Monarch Money alternative",
    "Copilot Money alternative",
    "Mint alternative",
    "privacy-first budgeting app",
    "no-signup finance app",
    "self-hosted personal finance",
    "AI money coach",
    "on-device financial advisor",
  ],
  authors: [{ name: "Clark Dinnison" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Ray — The Finance App That Tells You What To Do",
    description:
      "Other finance apps show you what you spent. Ray tells you what to do. An open-source AI financial advisor that learns your full situation, uses your real bank data, and runs locally on your machine.",
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
    title: "Ray — The Finance App That Tells You What To Do",
    description:
      "Other finance apps show you what you spent. Ray tells you what to do. An open-source AI financial advisor that learns your full situation, uses your real bank data, and runs locally on your machine.",
    images: ["/ray-og.jpg"],
  },
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Ray Finance",
  url: "https://rayfinance.app",
  logo: "https://rayfinance.app/favicon.png",
  description:
    "Ray is the open-source AI financial advisor that tells you what to do with your money, not just what you spent. It learns your full situation — family, goals, career, strategy — and turns your real bank data into the next move. Local-first and open source.",
  foundingDate: "2024",
  founder: {
    "@type": "Person",
    name: "Clark Dinnison",
    url: "https://github.com/cdinnison",
  },
  sameAs: ["https://github.com/cdinnison/ray-finance"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable}`} style={{ colorScheme: "light" }}>
      <body className="bg-stone-50 text-stone-900 font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        {children}
        <Footer />
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 select-none overflow-hidden font-mono text-lg leading-none text-stone-300/40" aria-hidden="true">
          <p className="whitespace-nowrap">{"░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒░▒"}</p>
        </div>
        <Analytics />
      </body>
    </html>
  );
}

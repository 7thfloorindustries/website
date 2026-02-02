import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import Script from "next/script";
import "./globals.css";
import LenisProvider from "@/components/LenisProvider";
import FloatingNav from "@/components/FloatingNav";
import PageTransition from "@/components/PageTransition";
import { NonceProvider } from "@/components/NonceProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "7th Floor Digital | Music Marketing & Cultural Strategy",
  description:
    "We turn culture into conversation. Music marketing and cultural strategy for artists, labels, and brands who want to be part of the conversation.",
  keywords: [
    "music marketing",
    "cultural strategy",
    "artist development",
    "brand partnerships",
    "social media strategy",
    "campaign management",
  ],
  authors: [{ name: "7th Floor Digital" }],
  openGraph: {
    title: "7th Floor Digital | Music Marketing & Cultural Strategy",
    description:
      "We turn culture into conversation. Music marketing and cultural strategy for artists, labels, and brands.",
    url: "https://7thfloor.digital",
    siteName: "7th Floor Digital",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "7th Floor Digital",
    description:
      "We turn culture into conversation. Music marketing and cultural strategy.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get nonce from middleware headers
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") || undefined;

  return (
    <html lang="en">
      <head>
        {/* Cloudflare Turnstile script with nonce */}
        {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            strategy="beforeInteractive"
            nonce={nonce}
          />
        )}
      </head>
      <body className={`${inter.variable} antialiased`}>
        <NonceProvider nonce={nonce}>
          <LenisProvider>
            <FloatingNav />
            <PageTransition>{children}</PageTransition>
          </LenisProvider>
        </NonceProvider>
      </body>
    </html>
  );
}

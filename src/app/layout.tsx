import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import LenisProvider from "@/components/LenisProvider";
import FloatingNav from "@/components/FloatingNav";
import PageTransition from "@/components/PageTransition";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <LenisProvider>
          <FloatingNav />
          <PageTransition>{children}</PageTransition>
        </LenisProvider>
      </body>
    </html>
  );
}

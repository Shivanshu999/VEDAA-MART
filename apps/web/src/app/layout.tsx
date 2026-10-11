import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Providers } from "@/components/providers";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Vedaa Mart — Scheduled Grocery Delivery",
  description: "Premium grocery shopping with fixed daily delivery slots across Bengaluru.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen font-sans`}>
        <Providers>
          <SiteHeader />
          <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-6">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}

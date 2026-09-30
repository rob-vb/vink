import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/logo";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Page not found · Vink",
  robots: { index: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <Logo className="h-8" />
        <h1 className="text-2xl font-semibold">This page does not exist.</h1>
        <p className="text-muted-foreground">The link may be old, or the address has a typo.</p>
        <Link href="/" className="underline underline-offset-4">
          Go to the homepage
        </Link>
      </body>
    </html>
  );
}

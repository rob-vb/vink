import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/logo";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pagina niet gevonden · Vink",
  robots: { index: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="nl" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <Logo className="h-8" />
        <h1 className="text-2xl font-semibold">Deze pagina bestaat niet.</h1>
        <p className="text-muted-foreground">De link is misschien oud, of er zit een typefout in het adres.</p>
        <Link href="/" className="underline underline-offset-4">
          Naar de homepage
        </Link>
      </body>
    </html>
  );
}

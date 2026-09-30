import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { locale as rootLocale } from "next/root-params";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import { isLocale, routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site";
import "../../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Only en and nl exist; anything else is a 404. Pages stay static: nothing
// here may read cookies or headers.
export const dynamicParams = false;
// Fails the build if a marketing page ever becomes dynamic.
export const dynamic = "error";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Vink", template: "%s · Vink" },
  twitter: { card: "summary_large_image" },
};

export default async function MarketingLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await rootLocale();
  const lang = isLocale(locale) ? locale : routing.defaultLocale;
  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

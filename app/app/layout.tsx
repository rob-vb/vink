import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getToken } from "@/lib/auth-server";
import { ConvexClientProvider } from "./convex-client-provider";
import { AppLabelsProvider } from "./locale-providers";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta");
  return {
    title: "Vink",
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

// The language is the visitor's pick from NEXT_LOCALE, Dutch by default
// (i18n/request.ts); the language switchers change it.
export default async function RootLayout({ children }: LayoutProps<"/app">) {
  const [token, locale] = await Promise.all([getToken(), getLocale()]);
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <AppLabelsProvider>
            <ConvexClientProvider initialToken={token}>
              <TooltipProvider>{children}</TooltipProvider>
            </ConvexClientProvider>
          </AppLabelsProvider>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

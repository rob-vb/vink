import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getToken } from "@/lib/auth-server";
import { ConvexClientProvider } from "./convex-client-provider";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vink",
  description:
    "Reads your documents, fills your Forms and sends the data where it belongs.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/app">) {
  const token = await getToken();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConvexClientProvider initialToken={token}>
          <TooltipProvider>{children}</TooltipProvider>
        </ConvexClientProvider>
        <Toaster />
      </body>
    </html>
  );
}

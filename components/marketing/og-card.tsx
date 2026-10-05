import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { isLocale, routing, type Locale } from "@/i18n/routing";

// The shared Open Graph card (ticket 14): white card, navy Geist SemiBold
// headline, the logo. Geist Regular is next/og's default font; SemiBold is
// committed in assets/fonts because next/font's woff2 can't be used here.

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

type OgNamespace = "home" | "pricing" | "developers" | "common";

/** Reads a page's `og` strings straight from the message files (no request context in image routes). */
export async function ogText(locale: string, ns: OgNamespace, key = "og") {
  const lang: Locale = isLocale(locale) ? locale : routing.defaultLocale;
  const messages = (await import(`../../messages/${lang}/${ns}.json`)).default as Record<string, unknown>;
  const og = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages) as {
    title: string;
    alt: string;
    eyebrow?: string;
  };
  return { ...og, locale: lang };
}

/** The locale from an image route's params (a promise since Next 16). */
export async function ogLocale(params: unknown) {
  const { locale } = (await params) as { locale: string };
  return locale;
}

export async function ogImageMetadata(params: unknown, ns: OgNamespace, key?: string) {
  const { alt } = await ogText(await ogLocale(params), ns, key);
  return [{ id: "card", alt, size: ogSize, contentType: ogContentType }];
}

let logoSvg: Promise<string> | undefined;
function logoDataUri() {
  logoSvg ??= readFile(join(process.cwd(), "public/vink_logo.svg"), "utf8").then(
    (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
  return logoSvg;
}

export async function ogCard({ title, eyebrow, locale }: { title: string; eyebrow?: string; locale: string }) {
  const [semiBold, logo] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Geist-SemiBold.ttf")),
    logoDataUri(),
  ]);
  const long = title.length > 60;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#F5F7FA",
          padding: 40,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: "#FFFFFF",
            border: "1px solid #E2E6EC",
            borderRadius: 28,
            padding: "56px 64px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={204} height={48} alt="" />
            <div style={{ display: "flex", fontSize: 24, color: "#5B6577" }}>
              {eyebrow ?? (locale === "nl" ? "Automatische data-invoer" : "Automated data entry")}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Geist SemiBold",
              fontSize: long ? 64 : 84,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              color: "#0F1E36",
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          <div style={{ display: "flex", gap: 36, fontSize: 24, color: "#5B6577" }}>
            {(locale === "nl"
              ? ["Opgeslagen in de EU", "20 gratis pagina's", "Niets verstuurd zonder jouw akkoord"]
              : ["Stored in the EU", "20 free pages", "Nothing sent without your approval"]
            ).map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: 10, background: "#2BC016" }} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [{ name: "Geist SemiBold", data: semiBold, weight: 600, style: "normal" }],
    },
  );
}

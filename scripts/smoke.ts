// HTTP smoke test against a production build: `npm run smoke`.
// Builds into .next-smoke (never the .next that prod serves), starts
// `next start` on a free port and checks what a browser or crawler sees:
// statuses, redirects, headers and HTML. No browser.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { plans } from "../lib/plans";

const root = path.resolve(import.meta.dirname, "..");
const distDir = ".next-smoke";
const siteUrl = "https://vink.smoke.test";
const env = {
  ...process.env,
  NEXT_DIST_DIR: distDir,
  SITE_URL: siteUrl,
  NODE_OPTIONS: "--dns-result-order=ipv4first",
  // Consent decides whether GA loads, so the tag id must be set for the check to mean anything.
  NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID ?? "G-SMOKETEST",
};

const pages = ["/", "/features", "/pricing", "/developers", "/security", "/contact", "/privacy", "/terms"];
const locales = ["en", "nl"] as const;
const localized = (locale: (typeof locales)[number], page: string) =>
  locale === "en" ? page : page === "/" ? "/nl" : `/nl${page}`;

let failures = 0;
function check(ok: boolean, what: string, detail = "") {
  if (ok) console.log(`  ok  ${what}`);
  else {
    failures++;
    console.log(`  FAIL ${what}${detail ? `: ${detail}` : ""}`);
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url: string) {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url, { redirect: "manual" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`${url} never answered`);
}

function build() {
  if (process.argv.includes("--no-build")) return;
  console.log("Building into .next-smoke …");
  const result = spawnSync("npx", ["next", "build"], { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) throw new Error("next build failed");
}

/** Every route the build prerendered, from its manifest. */
function prerendered(): Set<string> {
  const manifest = JSON.parse(
    readFileSync(path.join(root, distDir, "prerender-manifest.json"), "utf8"),
  ) as { routes: Record<string, unknown> };
  return new Set(Object.keys(manifest.routes));
}

async function main() {
  build();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const server: ChildProcess = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env,
    stdio: "ignore",
    detached: true,
  });
  try {
    await waitFor(base);
    await run(base);
  } finally {
    // The whole process group: npx and the next-server under it.
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  }
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

const get = (base: string, url: string, headers: Record<string, string> = {}) =>
  fetch(base + url, { redirect: "manual", headers });

function linkHref(html: string, rel: string, hreflang?: string) {
  const tags = html.match(/<link[^>]+>/g) ?? [];
  const tag = tags.find(
    (t) =>
      t.includes(`rel="${rel}"`) && (hreflang === undefined || t.includes(`hrefLang="${hreflang}"`) || t.includes(`hreflang="${hreflang}"`)),
  );
  return tag?.match(/href="([^"]+)"/)?.[1] ?? null;
}

function metaContent(html: string, property: string) {
  const tag = (html.match(/<meta[^>]+>/g) ?? []).find((t) => t.includes(`property="${property}"`));
  return tag?.match(/content="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&") ?? null;
}

async function run(base: string) {
  const built = prerendered();

  console.log("\nMarketing pages");
  for (const page of pages) {
    for (const locale of locales) {
      const url = localized(locale, page);
      const response = await get(base, url);
      const html = await response.text();
      check(response.status === 200, `${url} returns 200`, String(response.status));
      const internal = page === "/" ? `/${locale}` : `/${locale}${page}`;
      check(built.has(internal), `${url} is prerendered static`);
      check((html.match(/<h1[\s>]/g) ?? []).length === 1, `${url} has one <h1>`);
      check(html.includes(`<html lang="${locale}"`), `${url} is lang=${locale}`);
      const canonical = linkHref(html, "canonical");
      check(canonical === siteUrl + (url === "/" ? "" : url) || canonical === siteUrl + url, `${url} canonical is its own`, String(canonical));
      const en = linkHref(html, "alternate", "en");
      const nl = linkHref(html, "alternate", "nl");
      const xDefault = linkHref(html, "alternate", "x-default");
      check(
        Boolean(en?.startsWith(siteUrl) && nl?.startsWith(`${siteUrl}/nl`) && xDefault === en),
        `${url} has en/nl/x-default hreflang from SITE_URL`,
        `${en} ${nl} ${xDefault}`,
      );
      if (["/", "/features", "/pricing", "/developers", "/security"].includes(page)) {
        const image = metaContent(html, "og:image");
        const imageResponse = image ? await get(base, image.replace(siteUrl, "")) : null;
        check(
          imageResponse?.status === 200 &&
            (imageResponse.headers.get("content-type") ?? "").startsWith("image/"),
          `${url} og:image resolves to an image`,
          String(image),
        );
      }
      check(!/googletagmanager\.com\/gtag/.test(html), `${url} loads no Google tag before consent`);
    }
  }

  console.log("\nLocale routing");
  const en = await get(base, "/en/pricing");
  check(
    [301, 308].includes(en.status) && en.headers.get("location")?.endsWith("/pricing") === true,
    "/en/pricing redirects permanently to /pricing",
    `${en.status} ${en.headers.get("location")}`,
  );
  const dutchBrowser = await get(base, "/", { "Accept-Language": "nl-NL,nl;q=0.9" });
  const dutchHtml = await dutchBrowser.text();
  check(
    dutchBrowser.status === 200 && dutchHtml.includes('<html lang="en"'),
    "no locale redirect based on Accept-Language",
  );
  check((await get(base, "/nl/does-not-exist")).status === 404, "unknown pages are 404");

  console.log("\nOld product URLs");
  for (const [from, to] of [
    ["/invite/abc123", "/app/invite/abc123"],
    ["/sign-in", "/app/sign-in"],
    ["/sign-up", "/app/sign-up"],
    ["/welcome", "/app/welcome"],
    ["/o/kantoor-noord/forms?x=1", "/app/o/kantoor-noord/forms?x=1"],
  ]) {
    const response = await get(base, from);
    const location = response.headers.get("location") ?? "";
    check(
      [301, 308].includes(response.status) && location.endsWith(to),
      `${from} → ${to}`,
      `${response.status} ${location}`,
    );
  }

  console.log("\nThe app and crawlers");
  const app = await get(base, "/app/sign-in");
  const appHtml = await app.text();
  check(app.headers.get("x-robots-tag") === "noindex, nofollow", "/app carries X-Robots-Tag noindex");
  check(!appHtml.includes("googletagmanager"), "/app HTML has no Google tag at all");
  const robots = await (await get(base, "/robots.txt")).text();
  check(!/Disallow:\s*\/app/i.test(robots) && /Disallow:\s*\/api\//i.test(robots), "robots.txt disallows /api/ only", robots);
  const sitemap = await (await get(base, "/sitemap.xml")).text();
  check(
    sitemap.includes(`${siteUrl}/pricing`) && sitemap.includes(`${siteUrl}/nl/pricing`) && !sitemap.includes("/app"),
    "sitemap lists both languages and no /app URL",
  );

  console.log("\nHeaders and files");
  const home = await get(base, "/");
  for (const header of [
    "strict-transport-security",
    "x-content-type-options",
    "referrer-policy",
    "content-security-policy",
    "content-security-policy-report-only",
  ]) {
    check(home.headers.has(header), `${header} is set`);
  }
  check(
    (home.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"),
    "frame-ancestors 'none'",
  );
  const securityTxt = await get(base, "/.well-known/security.txt");
  check(
    securityTxt.status === 200 && (await securityTxt.text()).includes("Contact: mailto:"),
    "security.txt resolves with a Contact",
  );
  const llms = await get(base, "/llms.txt");
  check(llms.status === 200 && (await llms.text()).includes("Vink"), "llms.txt resolves");

  console.log("\nStructured data");
  const pricing = await (await get(base, "/pricing")).text();
  const blocks = [...pricing.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(
    (m) => JSON.parse(m[1]),
  );
  const app2 = blocks.flatMap((b) => (Array.isArray(b["@graph"]) ? b["@graph"] : [b])).find(
    (b) => b["@type"] === "SoftwareApplication",
  );
  const offers: Array<{ name: string; price: string | number; priceCurrency: string }> = app2?.offers ?? [];
  const expected = plans.map((p) => ({ name: p.name, price: p.monthly }));
  check(
    offers.length === expected.length &&
      expected.every((e) =>
        offers.some((o) => o.name.includes(e.name) && Number(o.price) === e.price && o.priceCurrency === "EUR"),
      ),
    "Pricing JSON-LD Offers match lib/plans.ts",
    JSON.stringify(offers),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

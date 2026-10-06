import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CodeBlock } from "@/components/marketing/code-block";
import { Container, InlineCode, SectionHeading } from "@/components/marketing/section";
import { DocSection, TocLayout } from "@/components/marketing/toc";
import { errorCodes, openApiDocument } from "@/convex/publicApi/openapi";
import { isLocale, routing, type Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { OperationBlock, PropertyTable, Prose, objectAnchor, operationsOf, type ReferenceLabels } from "./reference";

function localeOf(value: string): Locale {
  return isLocale(value) ? value : routing.defaultLocale;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/developers/api">): Promise<Metadata> {
  const { locale } = await params;
  return pageMetadata({ locale: localeOf(locale), path: "/developers/api", ns: "developersApi" });
}

const rich = {
  code: (chunks: ReactNode) => <InlineCode>{chunks}</InlineCode>,
  b: (chunks: ReactNode) => <b>{chunks}</b>,
};

const tagAnchor = (name: string) => name.toLowerCase().replace(/\W+/g, "-");

const errorExample = JSON.stringify(
  { error: { code: "invalid_api_key", message: "This API Key doesn't exist or was revoked." } },
  null,
  2,
);

export default async function ApiReferencePage({ params }: PageProps<"/[locale]/developers/api">) {
  const locale = localeOf((await params).locale);
  const t = await getTranslations({ locale, namespace: "developersApi" });
  const labels: ReferenceLabels = {
    parameters: t("endpoint.parameters"),
    requestBody: t("endpoint.requestBody"),
    responses: t("endpoint.responses"),
    request: t("endpoint.request"),
    example: t("endpoint.example"),
    name: t("endpoint.name"),
    type: t("endpoint.type"),
    required: t("endpoint.required"),
    description: t("endpoint.description"),
    status: t("endpoint.status"),
    code: { copy: t("code.copy"), copied: t("code.copied") },
  };
  const objects = Object.entries(openApiDocument.components.schemas);

  return (
    <main>
      <section className="pt-14 pb-12 sm:pt-20 sm:pb-16">
        <Container>
          <SectionHeading
            as="h1"
            eyebrow={t("header.eyebrow")}
            title={t("header.title")}
            subtitle={t("header.subtitle")}
            className="max-w-3xl"
          />
        </Container>
      </section>

      <TocLayout
        label={t("toc.label")}
        items={[
          { id: "overview", label: t("toc.overview") },
          { id: "authentication", label: t("toc.auth") },
          { id: "errors", label: t("toc.errors") },
          ...openApiDocument.tags.map((tag) => ({ id: tagAnchor(tag.name), label: tag.name })),
          { id: "objects", label: t("toc.objects") },
        ]}
      >
        <DocSection id="overview" title={t("overview.title")}>
          <p>{t.rich("overview.base", rich)}</p>
          <CodeBlock code={openApiDocument.servers[0].url} language="text" />
          <p>{t.rich("overview.json", rich)}</p>
          <p>{t.rich("overview.versioning", rich)}</p>
          <p>
            {t.rich("overview.openapi", {
              ...rich,
              link: (chunks) => (
                <a href="/v1/openapi.json" className="font-medium text-foreground underline underline-offset-3">
                  {chunks}
                </a>
              ),
            })}
          </p>
          {locale !== "en" && <p>{t("overview.english")}</p>}
        </DocSection>

        <DocSection id="authentication" title={t("auth.title")}>
          <p>{t.rich("auth.keys", rich)}</p>
          <CodeBlock code={"Authorization: Bearer vink_live_…"} language="text" />
          <p>{t.rich("auth.secret", rich)}</p>
        </DocSection>

        <DocSection id="errors" title={t("errors.title")}>
          <p>{t.rich("errors.intro", rich)}</p>
          <CodeBlock code={errorExample} language="json" />
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-muted/60 text-foreground">
                <tr>
                  <th scope="col" className="w-20 px-4 py-2.5 font-semibold">{labels.status}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("errors.code")}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t("errors.meaning")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {errorCodes.map((e) => (
                  <tr key={e.code}>
                    <td className="px-4 py-3 align-top font-mono text-[13px] text-foreground">{e.status}</td>
                    <td className="px-4 py-3 align-top font-mono text-[13px] text-foreground">{e.code}</td>
                    <td className="px-4 py-3">
                      <Prose text={e.meaning} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DocSection>

        {openApiDocument.tags.map((tag) => (
          <DocSection key={tag.name} id={tagAnchor(tag.name)} title={tag.name}>
            <p>
              <Prose text={tag.description} />
            </p>
            <div className="flex flex-col gap-8">
              {operationsOf(tag.name).map(({ path, method, op }) => (
                <OperationBlock key={op.operationId} method={method} path={path} op={op} labels={labels} />
              ))}
            </div>
          </DocSection>
        ))}

        <DocSection id="objects" title={t("objects.title")}>
          <p>{t("objects.intro")}</p>
          {objects.map(([name, schema]) => (
            <div key={name} id={objectAnchor(name)} className="flex scroll-mt-24 flex-col gap-3">
              <h3 className="font-mono text-base font-semibold text-foreground">{name}</h3>
              {schema.description && (
                <p>
                  <Prose text={schema.description} />
                </p>
              )}
              <PropertyTable schema={schema} labels={labels} />
            </div>
          ))}
        </DocSection>
      </TocLayout>
      <div className="h-16 sm:h-24" />
    </main>
  );
}

import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("home");
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-4xl font-semibold">{t("title")}</h1>
    </main>
  );
}

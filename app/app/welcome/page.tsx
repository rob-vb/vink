import { getTranslations } from "next-intl/server";
import { FinishSignUp } from "./finish-sign-up";

export default async function WelcomePage({ searchParams }: PageProps<"/app/welcome">) {
  const { organisation } = await searchParams;
  const name = typeof organisation === "string" ? organisation.trim() : "";
  const t = await getTranslations("app.welcome");
  return <FinishSignUp organisation={name || t("defaultOrganisation")} />;
}

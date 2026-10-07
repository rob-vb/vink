import { organisationFromWelcome } from "@/lib/welcome-path";
import { FinishSignUp } from "./finish-sign-up";

export default async function WelcomePage({ searchParams }: PageProps<"/app/welcome">) {
  return <FinishSignUp organisation={organisationFromWelcome(await searchParams)} />;
}

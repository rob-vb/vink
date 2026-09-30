import { FinishSignUp } from "./finish-sign-up";

export default async function WelcomePage({ searchParams }: PageProps<"/app/welcome">) {
  const { organisation } = await searchParams;
  const name = typeof organisation === "string" ? organisation.trim() : "";
  return <FinishSignUp organisation={name || "My Organisation"} />;
}

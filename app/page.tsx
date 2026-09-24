import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";

export default async function Home() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }
  const organisations = await fetchAuthQuery(api.organisations.mine);
  redirect(organisations.length > 0 ? `/o/${organisations[0].slug}` : "/welcome");
}

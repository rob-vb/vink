import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { fetchAuthAction, isAuthenticated } from "@/lib/auth-server";

// Google sends the Admin back here after the consent page of a new Google
// Sheets Integration, or of a Reconnect (convex/googleSheets.ts). Finishes the
// connection as the signed-in Admin, then returns to the Integrations page
// with `?google=` connected · reconnected · no_access (the drive.file box
// wasn't ticked) · no_sheet_access (a Reconnect with an account that can't
// reach the sheet) · denied · failed.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code");
  // The state starts with the Organisation's slug (convex/lib/oauthState.ts).
  const slug = state.split(".")[0];
  if (!/^[a-z0-9-]+$/.test(slug)) redirect("/app");
  if (!(await isAuthenticated())) redirect("/app/sign-in");
  let outcome = "denied";
  if (code !== null) {
    try {
      ({ result: outcome } = await fetchAuthAction(api.googleSheets.connect, {
        organisationSlug: slug,
        state,
        code,
      }));
    } catch {
      outcome = "failed";
    }
  }
  redirect(`/app/o/${slug}/integrations?google=${outcome}`);
}

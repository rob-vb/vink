import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { needsAdminConsent } from "@/convex/lib/microsoft";
import { fetchAuthAction, isAuthenticated } from "@/lib/auth-server";

// Microsoft sends the Admin back here after the sign-in page of a new Excel
// Integration, or of a Reconnect (convex/excel.ts). Finishes the connection
// as the signed-in Admin, then returns to the Integrations page with
// `?excel=` connected · reconnected · no_access (the files scope wasn't
// granted) · no_sheet_access (a Reconnect with an account that can't reach
// the workbook) · admin_consent (the company lets only its IT admin consent)
// · denied · failed.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code");
  // The state starts with the Organisation's slug (convex/lib/oauthState.ts).
  // An IT admin back from the admin-consent page has none: off to the app.
  const slug = state.split(".")[0];
  if (!/^[a-z0-9-]+$/.test(slug)) redirect("/app");
  if (!(await isAuthenticated())) redirect("/app/sign-in");
  let outcome = needsAdminConsent(params.get("error"), params.get("error_description")) ? "admin_consent" : "denied";
  if (code !== null) {
    try {
      ({ result: outcome } = await fetchAuthAction(api.excel.connect, {
        organisationSlug: slug,
        state,
        code,
      }));
    } catch {
      outcome = "failed";
    }
  }
  redirect(`/app/o/${slug}/integrations?excel=${outcome}`);
}

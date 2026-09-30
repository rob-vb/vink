import { ConvexError } from "convex/values";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthQuery } from "@/lib/auth-server";
import { requireAdmin } from "../../organisation";
import { toDraft } from "../draft";
import { FormEditor } from "../form-editor";
import { FormSettings } from "../form-settings";
import { IntakePanel } from "../intake-panel";

export const metadata: Metadata = { title: "Form · Vink" };

export default async function FormPage({
  params,
}: PageProps<"/app/o/[slug]/forms/[formId]">) {
  const { slug, formId } = await params;
  await requireAdmin(slug);
  let form;
  try {
    form = await fetchAuthQuery(api.forms.get, {
      organisationSlug: slug,
      formId: formId as Id<"forms">,
    });
  } catch (error) {
    // Also covers an id that isn't a Form id at all.
    if (error instanceof ConvexError || String(error).includes("ArgumentValidationError")) {
      notFound();
    }
    throw error;
  }

  return (
    <FormEditor
      // Remount after a save elsewhere changes the version.
      key={form.version}
      organisationSlug={slug}
      form={{ id: form.id, version: form.version }}
      initial={toDraft(form)}
      settings={
        // Rendered on the server and handed over as a prop, so React checks it for a key.
        <div key="settings" className="flex flex-col gap-6">
          <FormSettings
            organisationSlug={slug}
            formId={form.id}
            initial={{ reviewThreshold: form.reviewThreshold, autoSend: form.autoSend }}
          />
          <IntakePanel organisationSlug={slug} formId={form.id} isAdmin />
        </div>
      }
    />
  );
}

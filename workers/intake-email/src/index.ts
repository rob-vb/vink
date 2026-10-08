// Cloudflare Email Worker for Vink's Intake Addresses (<token>@<intake domain>).
// Email Routing's catch-all on the intake apex sends every message here. The
// Worker holds no business logic: it stores PDF and image attachments in R2 and
// tells Vink the whole mail (subject, date, text, attachments); Vink decides
// which Form, and whether it is one Document or several (see convex/intake.ts).
// It never replies.
import PostalMime from "postal-mime";
import { deliver } from "./deliver";
import { failsDmarc, MAX_MESSAGE_BYTES, planEmail } from "./map";

type Env = {
  PDFS: R2Bucket;
  CONVEX_SITE_URL: string;
  INTAKE_SECRET: string;
};

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (message.rawSize > MAX_MESSAGE_BYTES) {
      message.setReject("Message too large");
      return;
    }
    // Spoofed mail must never inject Documents.
    if (failsDmarc(message.headers.get("Authentication-Results"))) {
      message.setReject("DMARC check failed");
      return;
    }
    const parsed = await PostalMime.parse(message.raw);
    const plan = planEmail(
      {
        to: message.to,
        from: parsed.from?.address ?? message.from,
        subject: parsed.subject,
        date: parsed.date,
        text: parsed.text,
        html: parsed.html,
        attachments: parsed.attachments.map((a) => ({
          filename: a.filename,
          mimeType: a.mimeType,
          disposition: a.disposition,
          contentId: a.contentId,
          content: a.content,
        })),
      },
      () => `intake/${crypto.randomUUID()}`,
    );
    const result = await deliver(plan, Date.now(), {
      put: async (key, bytes, mimeType) => {
        await env.PDFS.put(key, bytes, { httpMetadata: { contentType: mimeType } });
      },
      remove: (keys) => env.PDFS.delete(keys),
      send: (body) =>
        fetch(`${env.CONVEX_SITE_URL}/intake/email`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.INTAKE_SECRET}`,
            "Content-Type": "application/json",
          },
          body,
        }),
    });
    if (result === "unknown_address") message.setReject("Unknown address");
  },
};

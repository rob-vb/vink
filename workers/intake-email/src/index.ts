// Cloudflare Email Worker for Vink's Intake Addresses (<token>@<intake domain>).
// Email Routing's catch-all on the intake apex sends every message here. The
// Worker holds no business logic: it stores PDF and image attachments in R2 and
// tells Vink the whole mail (subject, date, text, attachments); Vink decides
// which Form, and whether it is one Document or several (see convex/intake.ts).
// It never replies.
import PostalMime from "postal-mime";
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
    for (const object of plan.store) {
      await env.PDFS.put(object.key, object.bytes, {
        httpMetadata: { contentType: object.mimeType },
      });
    }
    const response = await fetch(`${env.CONVEX_SITE_URL}/intake/email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.INTAKE_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: plan.token,
        from: plan.from,
        receivedAt: Date.now(),
        subject: plan.subject,
        date: plan.date,
        body: plan.body,
        bodyTooLarge: plan.bodyTooLarge,
        attachments: plan.entries,
      }),
    });
    if (response.status === 404) {
      // No such Intake Address (or it was replaced): bounce, like any unknown mailbox.
      message.setReject("Unknown address");
      return;
    }
    if (!response.ok) {
      // Let the sending server retry later; Vink removes what it stored on refusal.
      throw new Error(`Vink answered ${response.status}`);
    }
  },
};

// Cloudflare Email Worker for Vink's Intake Addresses (<token>@<intake domain>).
// Email Routing's catch-all on the intake apex sends every message here. The
// Worker holds no business logic: it stores PDF attachments in R2 and tells
// Vink, which decides per attachment (see convex/intake.ts). It never replies.
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
        attachments: parsed.attachments.map((a) => ({
          filename: a.filename,
          mimeType: a.mimeType,
          content: a.content,
        })),
      },
      () => `intake/${crypto.randomUUID()}`,
    );
    for (const object of plan.store) {
      await env.PDFS.put(object.key, object.bytes, {
        httpMetadata: { contentType: "application/pdf" },
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

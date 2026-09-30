// Sends through Resend (EU) when RESEND_API_KEY is set on the deployment;
// otherwise the message is written to the Convex logs.
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  /** Where a reply goes, e.g. the visitor who sent a contact request. */
  replyTo?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[Vink] Mail to ${input.to}: ${input.subject}\n${input.html}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? "Vink <onboarding@resend.dev>",
      to: [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.replyTo && { reply_to: input.replyTo }),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend rejected the email: ${response.status}`);
  }
}

/** For user-supplied text inside an email's HTML. */
export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

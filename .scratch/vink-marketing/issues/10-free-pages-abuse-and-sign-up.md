# Free Pages abuse and sign-up checks

Type: grilling
Status: resolved
Blocked by: 

## Question

Self-serve sign-up hands every first-created Organisation 20 free Pages (see Plans and pricing model). What stops someone farming them, and what does sign-up require? Settle: email verification before the Free Pages unlock (Better Auth supports it), disposable-domain and free-mail handling (block, allow, or a bigger credit for a verified work email as DocuPipe does), rate limits on sign-up and upload, and what the sign-up form asks (name, company, email only?). Check what `convex/auth.ts` and `convex/onboarding.ts` do today before deciding.

## Answer

Farming costs ~€0.60 per account (20 Pages × ~€0.03), so the defences stay light and cheap to build.

**Today** (checked 2026-09-30): sign-up asks Organisation name + email, then a password (no verification, signed in at once) or a magic link (verifies by nature). No rate limiting, no bot check.

- **Email verification:** password sign-ups must verify their email before they can sign in at all (Better Auth `requireEmailVerification`); magic-link sign-ups are already verified. No separate "signed in but Free Pages locked" state.
- **Addresses:** block disposable domains at sign-up (maintained list) with a plain message. Free-mail (Gmail, Outlook) allowed with the same 20 Pages. No work-email bonus, no `+tag`/dot normalisation.
- **Rate limits:** Better Auth's built-in limiter with database storage on sign-up, password sign-in and magic-link sending: ~5 per 10 minutes per IP, 3 magic links per hour per email. No separate upload limit; the Page quota caps uploads.
- **Form:** unchanged — Organisation name, email, password or link. Under the button: "By creating an account you agree to the Terms and Privacy policy." (links, no checkbox). No marketing opt-in in v1; name stays derived from the email.
- **Bots:** honeypot field + the rate limits (as on Contact). No captcha at launch; add Cloudflare Turnstile only if abuse appears.
- **Watching:** Vink gets an email per new Organisation (Resend, includes the email domain) — doubles as sales follow-up. We can set an Organisation's Free Pages to 0 by hand. No automatic global cap.

**Open checks.** `/api/auth` is proxied through Next to Convex: confirm Better Auth sees the real client IP (not the proxy's) before trusting per-IP limits. Verify the verification email and disposable-domain block on prod once Resend is live there.

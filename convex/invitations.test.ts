import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { addMembership, asUser, newBackend, signUp } from "./test.setup";

type Backend = ReturnType<typeof newBackend>;

// Resend is the only external system here: its HTTP API is stubbed, and every
// mail it was asked to send lands in `sent`.
let sent: { to: string[]; subject: string; html: string }[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("SITE_URL", "https://vink.test");
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Runs the scheduled mail sends and returns the token from the last invite to `to`. */
async function inviteTokenSentTo(t: Backend, to: string) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const mail = sent.findLast((mail) => mail.to.includes(to));
  expect(mail, `no mail to ${to}`).toBeDefined();
  const link = mail!.html.match(/https:\/\/vink\.test\/app\/invite\/([\w-]+)/);
  expect(link, "no invite link in the mail").not.toBeNull();
  return link![1];
}

test("an invited colleague accepts the mailed link and joins with the given role", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");

  await ann.user.mutation(api.invitations.invite, {
    organisationSlug: ann.slug,
    email: "cas@example.com",
    role: "member",
  });
  const token = await inviteTokenSentTo(t, "cas@example.com");
  const cas = asUser(t, "cas");
  const { slug } = await cas.mutation(api.invitations.accept, { token });

  expect(slug).toBe("acme-fleet");
  expect(await cas.query(api.organisations.mine, {})).toEqual([
    { name: "Acme Fleet", slug: "acme-fleet", role: "member" },
  ]);
});

test("a link older than 7 days is refused as expired", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  await ann.user.mutation(api.invitations.invite, {
    organisationSlug: ann.slug,
    email: "cas@example.com",
    role: "member",
  });
  const token = await inviteTokenSentTo(t, "cas@example.com");

  vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1);
  const cas = asUser(t, "cas");

  await expect(cas.mutation(api.invitations.accept, { token })).rejects.toThrow(
    "InvitationExpired",
  );
  expect(await cas.query(api.organisations.mine, {})).toEqual([]);
});

test("a link that was already used is refused", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  await ann.user.mutation(api.invitations.invite, {
    organisationSlug: ann.slug,
    email: "cas@example.com",
    role: "member",
  });
  const token = await inviteTokenSentTo(t, "cas@example.com");
  const cas = asUser(t, "cas");
  await cas.mutation(api.invitations.accept, { token });

  await expect(cas.mutation(api.invitations.accept, { token })).rejects.toThrow(
    "InvitationUsed",
  );
  expect(await cas.query(api.organisations.mine, {})).toHaveLength(1);
});

test("only the invited address can accept, whatever its case", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  await ann.user.mutation(api.invitations.invite, {
    organisationSlug: ann.slug,
    email: " Cas@Example.com ",
    role: "member",
  });
  const token = await inviteTokenSentTo(t, "cas@example.com");
  const dan = asUser(t, "dan");

  await expect(dan.mutation(api.invitations.accept, { token })).rejects.toThrow(
    "InvitationForAnotherEmail",
  );
  expect(await dan.query(api.organisations.mine, {})).toEqual([]);
  await asUser(t, "cas").mutation(api.invitations.accept, { token });
});

test("an Admin can't invite someone who is already a Member, or an address that isn't one", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  await addMembership(t, "cas", ann.slug, "member");

  await expect(
    ann.user.mutation(api.invitations.invite, {
      organisationSlug: ann.slug,
      email: "CAS@example.com",
      role: "admin",
    }),
  ).rejects.toThrow("AlreadyMember");
  await expect(
    ann.user.mutation(api.invitations.invite, {
      organisationSlug: ann.slug,
      email: "not an address",
      role: "member",
    }),
  ).rejects.toThrow("InvalidEmail");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toEqual([]);
});

test("inviting the same address again replaces the earlier link", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const invite = (role: "admin" | "member") =>
    ann.user.mutation(api.invitations.invite, {
      organisationSlug: ann.slug,
      email: "cas@example.com",
      role,
    });
  await invite("member");
  const first = await inviteTokenSentTo(t, "cas@example.com");
  await invite("admin");
  const second = await inviteTokenSentTo(t, "cas@example.com");
  const cas = asUser(t, "cas");

  await expect(cas.mutation(api.invitations.accept, { token: first })).rejects.toThrow(
    "InvitationNotFound",
  );
  await cas.mutation(api.invitations.accept, { token: second });
  expect(await cas.query(api.organisations.mine, {})).toEqual([
    { name: "Acme Fleet", slug: "acme-fleet", role: "admin" },
  ]);
});

test("an Admin can revoke an open Invitation, and its link stops working", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  await ann.user.mutation(api.invitations.invite, {
    organisationSlug: ann.slug,
    email: "cas@example.com",
    role: "member",
  });
  const token = await inviteTokenSentTo(t, "cas@example.com");
  const [invitation] = (
    await ann.user.query(api.memberships.list, { organisationSlug: ann.slug })
  ).invitations;

  await ann.user.mutation(api.invitations.revoke, {
    organisationSlug: ann.slug,
    invitationId: invitation.invitationId,
  });

  expect(
    (await ann.user.query(api.memberships.list, { organisationSlug: ann.slug })).invitations,
  ).toEqual([]);
  await expect(
    asUser(t, "cas").mutation(api.invitations.accept, { token }),
  ).rejects.toThrow("InvitationNotFound");
});

test("the accept page can show who invited whom to what, and whether the link still works", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  await ann.user.mutation(api.invitations.invite, {
    organisationSlug: ann.slug,
    email: "cas@example.com",
    role: "admin",
  });
  const token = await inviteTokenSentTo(t, "cas@example.com");
  const cas = asUser(t, "cas");
  const dan = asUser(t, "dan");

  expect(await cas.query(api.invitations.preview, { token })).toEqual({
    status: "open",
    organisationName: "Acme Fleet",
    organisationSlug: "acme-fleet",
    role: "admin",
    email: "cas@example.com",
    invitedBy: "ann@example.com",
  });
  expect(await dan.query(api.invitations.preview, { token })).toMatchObject({
    status: "anotherEmail",
    email: "cas@example.com",
  });
  await cas.mutation(api.invitations.accept, { token });
  expect(await cas.query(api.invitations.preview, { token })).toMatchObject({
    status: "used",
  });
  expect(await cas.query(api.invitations.preview, { token: "nonsense" })).toEqual({
    status: "notFound",
  });
});

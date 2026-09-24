import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { addMembership, asUser, newBackend, signUp } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("an Admin sees the Members with their email and role, and the pending Invitations", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  await addMembership(t, "cas", ann.slug, "member");
  await ann.user.mutation(api.invitations.invite, {
    organisationSlug: ann.slug,
    email: "dan@example.com",
    role: "admin",
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const { members, invitations } = await ann.user.query(api.memberships.list, {
    organisationSlug: ann.slug,
  });

  expect(members).toEqual([
    expect.objectContaining({ email: "ann@example.com", role: "admin", isYou: true }),
    expect.objectContaining({ email: "cas@example.com", role: "member", isYou: false }),
  ]);
  expect(invitations).toEqual([
    expect.objectContaining({ email: "dan@example.com", role: "admin" }),
  ]);
});

async function membershipIdOf(
  admin: ReturnType<typeof asUser>,
  organisationSlug: string,
  email: string,
) {
  const { members } = await admin.query(api.memberships.list, { organisationSlug });
  return members.find((member) => member.email === email)!.membershipId;
}

test("an Admin can make a Member Admin and back, and the new role applies at once", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const cas = await addMembership(t, "cas", ann.slug, "member");
  const membershipId = await membershipIdOf(ann.user, ann.slug, "cas@example.com");

  await ann.user.mutation(api.memberships.changeRole, {
    organisationSlug: ann.slug,
    membershipId,
    role: "admin",
  });
  await cas.mutation(api.organisations.rename, {
    organisationSlug: ann.slug,
    name: "Renamed by Cas",
  });
  await ann.user.mutation(api.memberships.changeRole, {
    organisationSlug: ann.slug,
    membershipId,
    role: "member",
  });

  await expect(
    cas.mutation(api.organisations.rename, { organisationSlug: ann.slug, name: "Again" }),
  ).rejects.toThrow("Forbidden");
});

test("the last Admin can't be demoted", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  await addMembership(t, "cas", ann.slug, "member");
  const membershipId = await membershipIdOf(ann.user, ann.slug, "ann@example.com");

  await expect(
    ann.user.mutation(api.memberships.changeRole, {
      organisationSlug: ann.slug,
      membershipId,
      role: "member",
    }),
  ).rejects.toThrow("LastAdmin");
  expect(
    await ann.user.query(api.organisations.home, { organisationSlug: ann.slug }),
  ).toMatchObject({ role: "admin" });
});

test("a removed user loses access to the Organisation at once", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const cas = await addMembership(t, "cas", ann.slug, "admin");
  const membershipId = await membershipIdOf(ann.user, ann.slug, "cas@example.com");

  await ann.user.mutation(api.memberships.remove, {
    organisationSlug: ann.slug,
    membershipId,
  });

  await expect(
    cas.query(api.organisations.home, { organisationSlug: ann.slug }),
  ).rejects.toThrow("Forbidden");
  await expect(
    cas.query(api.forms.list, { organisationSlug: ann.slug }),
  ).rejects.toThrow("Forbidden");
  expect(await cas.query(api.organisations.mine, {})).toEqual([]);
});

test("the last Admin can't be removed, but another Admin can go", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  await addMembership(t, "cas", ann.slug, "admin");
  const cas = await membershipIdOf(ann.user, ann.slug, "cas@example.com");
  const annId = await membershipIdOf(ann.user, ann.slug, "ann@example.com");

  await ann.user.mutation(api.memberships.remove, {
    organisationSlug: ann.slug,
    membershipId: cas,
  });

  await expect(
    ann.user.mutation(api.memberships.remove, {
      organisationSlug: ann.slug,
      membershipId: annId,
    }),
  ).rejects.toThrow("LastAdmin");
});

test("a Member is refused every Admin-only function for Members and Invitations", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const cas = await addMembership(t, "cas", ann.slug, "member");
  const organisationSlug = ann.slug;
  const annId = await membershipIdOf(ann.user, organisationSlug, "ann@example.com");
  await ann.user.mutation(api.invitations.invite, {
    organisationSlug,
    email: "dan@example.com",
    role: "member",
  });
  const { invitations } = await ann.user.query(api.memberships.list, { organisationSlug });

  const attempts = [
    cas.query(api.memberships.list, { organisationSlug }),
    cas.mutation(api.invitations.invite, {
      organisationSlug,
      email: "eve@example.com",
      role: "admin",
    }),
    cas.mutation(api.invitations.revoke, {
      organisationSlug,
      invitationId: invitations[0].invitationId,
    }),
    cas.mutation(api.memberships.changeRole, {
      organisationSlug,
      membershipId: annId,
      role: "member",
    }),
    cas.mutation(api.memberships.remove, { organisationSlug, membershipId: annId }),
  ];

  for (const attempt of attempts) {
    await expect(attempt).rejects.toThrow("Forbidden");
  }
  expect(
    await ann.user.query(api.memberships.list, { organisationSlug }),
  ).toMatchObject({
    members: [{ email: "ann@example.com", role: "admin" }, { email: "cas@example.com" }],
    invitations: [{ email: "dan@example.com" }],
  });
});

test("an Admin can't change or remove a Membership in another Organisation", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  await addMembership(t, "cas", ann.slug, "admin");
  const bob = await signUp(t, "bob", "Bob's Tyres");
  const cas = await membershipIdOf(ann.user, ann.slug, "cas@example.com");

  await expect(
    bob.user.mutation(api.memberships.changeRole, {
      organisationSlug: bob.slug,
      membershipId: cas,
      role: "member",
    }),
  ).rejects.toThrow("MembershipNotFound");
  await expect(
    bob.user.mutation(api.memberships.remove, { organisationSlug: bob.slug, membershipId: cas }),
  ).rejects.toThrow("MembershipNotFound");
});

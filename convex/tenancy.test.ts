import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { addMembership, newBackend, signUp } from "./test.setup";

test("a user can't read an Organisation they have no Membership in", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const bob = await signUp(t, "bob", "Bob's Tyres");

  await expect(
    bob.user.query(api.organisations.home, { organisationSlug: ann.slug }),
  ).rejects.toThrow("Forbidden");
});

test("a user can't change an Organisation they have no Membership in", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const bob = await signUp(t, "bob", "Bob's Tyres");

  await expect(
    bob.user.mutation(api.organisations.rename, {
      organisationSlug: ann.slug,
      name: "Taken over",
    }),
  ).rejects.toThrow("Forbidden");
  expect(
    await ann.user.query(api.organisations.home, { organisationSlug: ann.slug }),
  ).toMatchObject({ name: "Acme Fleet" });
});

test("a Member can read their Organisation but not use Admin-only functions", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const cas = await addMembership(t, "cas", ann.slug, "member");

  expect(
    await cas.query(api.organisations.home, { organisationSlug: ann.slug }),
  ).toEqual({ name: "Acme Fleet", slug: "acme-fleet", role: "member" });
  await expect(
    cas.mutation(api.organisations.rename, {
      organisationSlug: ann.slug,
      name: "Renamed by a Member",
    }),
  ).rejects.toThrow("Forbidden");
});

test("a signed-out visitor can't read an Organisation or start one", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");

  await expect(
    t.query(api.organisations.home, { organisationSlug: ann.slug }),
  ).rejects.toThrow("Unauthenticated");
  await expect(
    t.mutation(api.onboarding.createOrganisation, { name: "Sneaky" }),
  ).rejects.toThrow("Unauthenticated");
});

import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, newBackend, signUp } from "./test.setup";

test("the person who signs up is Admin of their new Organisation", async () => {
  const t = newBackend();

  const { user, slug } = await signUp(t, "ann", "Acme Fleet");

  expect(slug).toBe("acme-fleet");
  expect(
    await user.query(api.organisations.home, { organisationSlug: slug }),
  ).toEqual({ name: "Acme Fleet", slug: "acme-fleet", role: "admin" });
});

test("Organisations with the same name get different slugs", async () => {
  const t = newBackend();

  const first = await signUp(t, "ann", "Acme Fleet");
  const second = await signUp(t, "bob", "Acme Fleet");

  expect(first.slug).toBe("acme-fleet");
  expect(second.slug).toBe("acme-fleet-2");
});

test("a name without letters or digits still gets a usable slug", async () => {
  const t = newBackend();

  const { slug } = await signUp(t, "ann", "Ø ☃");

  expect(slug).toBe("organisation");
});

test("an Admin can rename their Organisation and keeps its slug", async () => {
  const t = newBackend();
  const { user, slug } = await signUp(t, "ann", "Acme Fleet");

  await user.mutation(api.organisations.rename, {
    organisationSlug: slug,
    name: "Acme Fleet Services",
  });

  expect(
    await user.query(api.organisations.home, { organisationSlug: slug }),
  ).toEqual({ name: "Acme Fleet Services", slug: "acme-fleet", role: "admin" });
});

test("a signed-in user sees the Organisations they belong to", async () => {
  const t = newBackend();
  await signUp(t, "ann", "Acme Fleet");
  await signUp(t, "bob", "Bob's Tyres");

  expect(await asUser(t, "ann").query(api.organisations.mine, {})).toEqual([
    { name: "Acme Fleet", slug: "acme-fleet", role: "admin" },
  ]);
  expect(await asUser(t, "dan").query(api.organisations.mine, {})).toEqual([]);
});

test("finishing sign-up twice doesn't create a second Organisation", async () => {
  const t = newBackend();
  const { user, slug } = await signUp(t, "ann", "Acme Fleet");

  const again = await user.mutation(api.onboarding.createOrganisation, {
    name: "Acme Fleet",
  });

  expect(again.slug).toBe(slug);
  expect(await user.query(api.organisations.mine, {})).toHaveLength(1);
});

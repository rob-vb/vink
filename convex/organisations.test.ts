import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, newBackend, signUp } from "./test.setup";

test("the person who signs up is Admin of their new Organisation", async () => {
  const t = newBackend();

  const { user, slug } = await signUp(t, "ann", "Acme Fleet");

  expect(slug).toMatch(/^[a-z0-9]{8}$/);
  expect(
    await user.query(api.organisations.home, { organisationSlug: slug }),
  ).toEqual({ name: "Acme Fleet", slug, role: "admin" });
});

test("the slug is a random id, not the name, so Organisations with the same name differ", async () => {
  const t = newBackend();

  const first = await signUp(t, "ann", "Acme");
  const second = await signUp(t, "bob", "Acme");

  expect(first.slug).not.toContain("acme");
  expect(second.slug).toMatch(/^[a-z0-9]{8}$/);
  expect(second.slug).not.toBe(first.slug);
});

test("the migration gives every Organisation a new slug that still works", async () => {
  const t = newBackend();
  const { user, slug } = await signUp(t, "ann", "Acme");
  await t.run(async (ctx) => {
    const organisation = (await ctx.db.query("organisations").first())!;
    await ctx.db.patch(organisation._id, { slug: "acme" });
  });

  expect(await t.mutation(internal.organisations.randomiseSlugs, {})).toEqual({ changed: 1 });

  const [mine] = await user.query(api.organisations.mine, {});
  expect(mine.slug).toMatch(/^[a-z0-9]{8}$/);
  expect(mine.slug).not.toBe("acme");
  expect(mine.slug).not.toBe(slug);
  expect(
    await user.query(api.organisations.home, { organisationSlug: mine.slug }),
  ).toMatchObject({ name: "Acme" });
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
  ).toEqual({ name: "Acme Fleet Services", slug, role: "admin" });
});

test("a signed-in user sees the Organisations they belong to", async () => {
  const t = newBackend();
  const { slug } = await signUp(t, "ann", "Acme Fleet");
  await signUp(t, "bob", "Bob's Tyres");

  expect(await asUser(t, "ann").query(api.organisations.mine, {})).toEqual([
    { name: "Acme Fleet", slug, role: "admin" },
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

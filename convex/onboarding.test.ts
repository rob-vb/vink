import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import {
  addMembership,
  fakePdfStore,
  newBackend,
  putToUploadUrl,
  signUp,
} from "./test.setup";

vi.mock("./lib/pdfStore", async () => ({
  pdfStore: (await import("./test.setup")).fakePdfStore,
}));

type Backend = ReturnType<typeof newBackend>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("INTEGRATION_SECRETS_KEY", Buffer.alloc(32, 3).toString("base64"));
  fakePdfStore.objects.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const setupAt = (step: 1 | 2 | 3) => ({ setup: true, step, systemNotice: false, needsStart: false });
const over = (systemNotice = false) => ({ setup: false, step: null, systemNotice, needsStart: false });

async function acme(t: Backend) {
  const ann = await signUp(t, "ann", "Acme Invoices");
  const state = () => ann.user.query(api.onboarding.state, { organisationSlug: ann.slug });
  const makeForm = () =>
    ann.user.mutation(api.forms.create, {
      organisationSlug: ann.slug,
      name: "Invoice",
      fields: [{ type: "text", label: "Invoice number", key: "invoice_number", required: true }],
    });
  const connect = () =>
    ann.user.mutation(api.integrations.create, {
      organisationSlug: ann.slug,
      name: "Back office",
      url: "https://backoffice.example.com/hooks/vink",
      headers: [],
    });
  return { ...ann, state, makeForm, connect };
}

test("a fresh Organisation starts at step 1, the Form", async () => {
  const { state } = await acme(newBackend());

  expect(await state()).toEqual(setupAt(1));
});

test("after a Form the setup is at step 2, the System", async () => {
  const { state, makeForm } = await acme(newBackend());

  await makeForm();

  expect(await state()).toEqual(setupAt(2));
});

test("connecting an Integration finishes step 2 without a skip, and no notice follows", async () => {
  const { state, makeForm, connect, user, slug } = await acme(newBackend());
  await makeForm();

  await connect();
  expect(await state()).toEqual(setupAt(3));

  await user.mutation(api.onboarding.finishInput, { organisationSlug: slug });
  expect(await state()).toEqual(over(false));
});

test("skipping the System moves to step 3; finishing shows the notice until an Integration exists", async () => {
  const { state, makeForm, connect, user, slug } = await acme(newBackend());
  await makeForm();

  await user.mutation(api.onboarding.skipSystem, { organisationSlug: slug });
  expect(await state()).toEqual(setupAt(3));

  await user.mutation(api.onboarding.finishInput, { organisationSlug: slug });
  expect(await state()).toEqual(over(true));

  await connect();
  expect(await state()).toEqual(over(false));
});

test("skipping and finishing twice changes nothing", async () => {
  const { state, makeForm, user, slug } = await acme(newBackend());
  await makeForm();

  for (const fn of [api.onboarding.skipSystem, api.onboarding.skipSystem]) {
    await user.mutation(fn, { organisationSlug: slug });
  }
  for (const fn of [api.onboarding.finishInput, api.onboarding.finishInput]) {
    await user.mutation(fn, { organisationSlug: slug });
  }

  expect(await state()).toEqual(over(true));
});

test("Input cannot be finished before a Form exists", async () => {
  const { user, slug, state } = await acme(newBackend());

  await expect(
    user.mutation(api.onboarding.finishInput, { organisationSlug: slug }),
  ).rejects.toThrow("Make a Form first");
  expect(await state()).toEqual(setupAt(1));
});

test("the state lives on the server: another Admin sees the same step", async () => {
  const t = newBackend();
  const { slug, makeForm, user } = await acme(t);
  const dan = await addMembership(t, "dan", slug, "admin");
  await makeForm();
  await user.mutation(api.onboarding.skipSystem, { organisationSlug: slug });

  expect(await dan.query(api.onboarding.state, { organisationSlug: slug })).toEqual(setupAt(3));
  // A fresh query, as after a refresh, gives the same answer.
  expect(await user.query(api.onboarding.state, { organisationSlug: slug })).toEqual(setupAt(3));
});

test("a Member never sees the setup or the notice", async () => {
  const t = newBackend();
  const { slug, makeForm, user } = await acme(t);
  const cas = await addMembership(t, "cas", slug, "member");

  expect(await cas.query(api.onboarding.state, { organisationSlug: slug })).toEqual(over());
  await makeForm();
  await user.mutation(api.onboarding.skipSystem, { organisationSlug: slug });
  await user.mutation(api.onboarding.finishInput, { organisationSlug: slug });
  expect(await cas.query(api.onboarding.state, { organisationSlug: slug })).toEqual(over());
  await expect(
    cas.mutation(api.onboarding.skipSystem, { organisationSlug: slug }),
  ).rejects.toThrow("Forbidden");
});

test("a first Document ends the setup without finishing the Input step", async () => {
  const t = newBackend();
  const { slug, makeForm, user, state } = await acme(t);
  const { formId } = await makeForm();
  await user.mutation(api.onboarding.skipSystem, { organisationSlug: slug });

  const pdf = await PDFDocument.create();
  pdf.addPage();
  const { key, url } = await user.mutation(api.documents.generateUploadUrl, { organisationSlug: slug });
  putToUploadUrl(url, await pdf.save());
  await user.action(api.documents.create, { organisationSlug: slug, formId, key, filename: "invoice.pdf" });

  expect(await state()).toEqual(over(true));
});

test("an Organisation from before the setup counts as set up, without a notice", async () => {
  const t = newBackend();
  const { slug, makeForm, user, state } = await acme(t);
  await makeForm();
  await t.run(async (ctx) => {
    const organisation = (await ctx.db.query("organisations").first())!;
    await ctx.db.patch(organisation._id, { onboarding: undefined });
  });

  expect(await state()).toEqual(over(false));
  // Without a Form it is step 1 and asks to be tracked from now on.
  await t.run(async (ctx) => {
    const form = (await ctx.db.query("forms").first())!;
    await ctx.db.delete(form._id);
  });
  expect(await state()).toEqual({ ...setupAt(1), needsStart: true });

  await user.mutation(api.onboarding.start, { organisationSlug: slug });
  expect(await state()).toEqual(setupAt(1));
  // Starting again, or once a Form exists, changes nothing.
  await user.mutation(api.onboarding.start, { organisationSlug: slug });
  await makeForm();
  expect(await state()).toEqual(setupAt(2));
});

test("deleting every Form after the setup is over falls back to the empty state, not the setup", async () => {
  const t = newBackend();
  const { slug, makeForm, user, state } = await acme(t);
  await makeForm();
  await user.mutation(api.onboarding.skipSystem, { organisationSlug: slug });
  await user.mutation(api.onboarding.finishInput, { organisationSlug: slug });
  await t.run(async (ctx) => {
    const form = (await ctx.db.query("forms").first())!;
    await ctx.db.delete(form._id);
  });

  expect(await state()).toEqual(over());
});

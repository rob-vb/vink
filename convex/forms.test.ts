import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { addMembership, newBackend, signUp } from "./test.setup";

const licensePlate = {
  type: "text",
  label: "Kenteken",
  key: "licensePlate",
  description: "Registration number, plate, nummerbord",
  required: true,
} as const;

const serviceDate = {
  type: "date",
  label: "Datum",
  key: "serviceDate",
  required: false,
} as const;

test("an Admin creates a Form and finds it in the list with default settings", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");

  await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Tyre service",
    description: "Work orders from tyre shops",
    fields: [licensePlate, serviceDate],
  });

  expect(
    await ann.user.query(api.forms.list, { organisationSlug: ann.slug }),
  ).toEqual([
    expect.objectContaining({
      name: "Tyre service",
      description: "Work orders from tyre shops",
      version: 1,
      fieldCount: 2,
      reviewThreshold: 0.8,
      autoSend: false,
    }),
  ]);
});

test("each save creates the next Form Version and leaves earlier ones unchanged", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Tyre service",
    fields: [licensePlate],
  });

  await ann.user.mutation(api.forms.save, {
    organisationSlug,
    formId,
    name: "Tyre service",
    fields: [licensePlate, serviceDate],
  });
  await ann.user.mutation(api.forms.save, {
    organisationSlug,
    formId,
    name: "Tyre and brake service",
    fields: [serviceDate],
  });

  const current = await ann.user.query(api.forms.get, { organisationSlug, formId });
  expect(current).toMatchObject({ name: "Tyre and brake service", version: 3 });
  expect(current.fields).toEqual([serviceDate]);
  const first = await ann.user.query(api.forms.get, {
    organisationSlug,
    formId,
    version: 1,
  });
  expect(first).toMatchObject({ version: 1, fields: [licensePlate] });
  const second = await ann.user.query(api.forms.get, {
    organisationSlug,
    formId,
    version: 2,
  });
  expect(second).toMatchObject({ version: 2, fields: [licensePlate, serviceDate] });
});

test("two Fields can't share a key, and the refused save leaves the Form as it was", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Tyre service",
    fields: [licensePlate],
  });

  await expect(
    ann.user.mutation(api.forms.save, {
      organisationSlug,
      formId,
      name: "Tyre service",
      fields: [licensePlate, { ...serviceDate, key: "licensePlate" }],
    }),
  ).rejects.toThrow('The key "licensePlate" is used by more than one Field');
  await expect(
    ann.user.mutation(api.forms.create, {
      organisationSlug,
      name: "Brake service",
      fields: [licensePlate, licensePlate],
    }),
  ).rejects.toThrow('The key "licensePlate" is used by more than one Field');

  expect(
    await ann.user.query(api.forms.get, { organisationSlug, formId }),
  ).toMatchObject({ version: 1, fields: [licensePlate] });
});

test.each(["license plate", "2ndDriver", "kenteken-nr", "LicensePlate", "", "prijs€"])(
  'a key like "%s" is refused: it must be camelCase letters and digits',
  async (key) => {
    const t = newBackend();
    const ann = await signUp(t, "ann", "Acme Fleet");

    await expect(
      ann.user.mutation(api.forms.create, {
        organisationSlug: ann.slug,
        name: "Tyre service",
        fields: [{ ...licensePlate, key }],
      }),
    ).rejects.toThrow(`"${key}" isn't a valid key`);
  },
);

test("a Field needs a label", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");

  await expect(
    ann.user.mutation(api.forms.create, {
      organisationSlug: ann.slug,
      name: "Tyre service",
      fields: [{ ...licensePlate, label: "  " }],
    }),
  ).rejects.toThrow('The Field "licensePlate" needs a label');
});

const season = {
  type: "choice" as const,
  label: "Seizoen",
  key: "season",
  required: false,
  options: [
    { value: "summer", description: "zomer, Sommerreifen" },
    { value: "winter", description: "winterband, M+S, 3PMSF" },
    { value: "allSeason" },
  ],
};

test("a choice Field keeps its options, each with a value and an optional description", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;

  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Tyre service",
    fields: [season],
  });

  expect(
    (await ann.user.query(api.forms.get, { organisationSlug, formId })).fields,
  ).toEqual([season]);
});

test.each([
  { options: [], error: 'The choice Field "season" needs at least one option' },
  {
    options: [{ value: "summer" }, { value: "summer" }],
    error: 'The choice Field "season" has the option "summer" more than once',
  },
  {
    options: [{ value: " " }],
    error: 'Every option of the choice Field "season" needs a value',
  },
])("a choice Field's options are refused: $error", async ({ options, error }) => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");

  await expect(
    ann.user.mutation(api.forms.create, {
      organisationSlug: ann.slug,
      name: "Tyre service",
      fields: [{ ...season, options }],
    }),
  ).rejects.toThrow(error);
});

test("the Review Threshold and Auto-Send change without a new Form Version", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Tyre service",
    fields: [licensePlate],
  });

  await ann.user.mutation(api.forms.updateSettings, {
    organisationSlug,
    formId,
    reviewThreshold: 0.65,
    autoSend: true,
  });

  expect(
    await ann.user.query(api.forms.get, { organisationSlug, formId }),
  ).toMatchObject({ reviewThreshold: 0.65, autoSend: true, version: 1 });
});

test.each([-0.1, 1.2, Number.NaN])(
  "a Review Threshold of %s is refused: it must be from 0 to 1",
  async (reviewThreshold) => {
    const t = newBackend();
    const ann = await signUp(t, "ann", "Acme Fleet");
    const organisationSlug = ann.slug;
    const { formId } = await ann.user.mutation(api.forms.create, {
      organisationSlug,
      name: "Tyre service",
      fields: [licensePlate],
    });

    await expect(
      ann.user.mutation(api.forms.updateSettings, {
        organisationSlug,
        formId,
        reviewThreshold,
        autoSend: false,
      }),
    ).rejects.toThrow("The Review Threshold must be from 0 to 1");
  },
);

test("a Member can list Forms but can't open the editor or change a Form", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Tyre service",
    fields: [licensePlate],
  });
  const cas = await addMembership(t, "cas", organisationSlug, "member");

  expect(await cas.query(api.forms.list, { organisationSlug })).toMatchObject([
    { name: "Tyre service" },
  ]);
  await expect(
    cas.query(api.forms.get, { organisationSlug, formId }),
  ).rejects.toThrow("Forbidden");
  await expect(
    cas.mutation(api.forms.create, {
      organisationSlug,
      name: "Brake service",
      fields: [],
    }),
  ).rejects.toThrow("Forbidden");
  await expect(
    cas.mutation(api.forms.save, {
      organisationSlug,
      formId,
      name: "Renamed by a Member",
      fields: [],
    }),
  ).rejects.toThrow("Forbidden");
  await expect(
    cas.mutation(api.forms.updateSettings, {
      organisationSlug,
      formId,
      reviewThreshold: 0,
      autoSend: true,
    }),
  ).rejects.toThrow("Forbidden");

  expect(
    await ann.user.query(api.forms.get, { organisationSlug, formId }),
  ).toMatchObject({
    name: "Tyre service",
    version: 1,
    reviewThreshold: 0.8,
    autoSend: false,
  });
  expect(await ann.user.query(api.forms.list, { organisationSlug })).toHaveLength(1);
});

test("an Admin of another Organisation can't see or change its Forms", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const bob = await signUp(t, "bob", "Bob's Tyres");
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Tyre service",
    fields: [licensePlate],
  });

  expect(
    await bob.user.query(api.forms.list, { organisationSlug: bob.slug }),
  ).toEqual([]);
  await expect(
    bob.user.query(api.forms.get, { organisationSlug: bob.slug, formId }),
  ).rejects.toThrow("Form not found");
  await expect(
    bob.user.mutation(api.forms.save, {
      organisationSlug: bob.slug,
      formId,
      name: "Taken over",
      fields: [],
    }),
  ).rejects.toThrow("Form not found");
  await expect(
    bob.user.mutation(api.forms.updateSettings, {
      organisationSlug: bob.slug,
      formId,
      reviewThreshold: 0,
      autoSend: true,
    }),
  ).rejects.toThrow("Form not found");
});

test("a Form needs a name", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");

  await expect(
    ann.user.mutation(api.forms.create, {
      organisationSlug: ann.slug,
      name: " ",
      fields: [licensePlate],
    }),
  ).rejects.toThrow("A Form needs a name");
});

import type { Infer } from "convex/values";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { field } from "./schema";
import { addMembership, newBackend, signUp } from "./test.setup";

const license_plate = {
  type: "text",
  label: "Kenteken",
  key: "license_plate",
  description: "Registration number, plate, nummerbord",
  required: true,
} as const;

const service_date = {
  type: "date",
  label: "Datum",
  key: "service_date",
  required: false,
} as const;

test("an Admin creates a Form and finds it in the list with default settings", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");

  await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Tyre service",
    description: "Work orders from tyre shops",
    fields: [license_plate, service_date],
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
    fields: [license_plate],
  });

  await ann.user.mutation(api.forms.save, {
    organisationSlug,
    formId,
    name: "Tyre service",
    fields: [license_plate, service_date],
  });
  await ann.user.mutation(api.forms.save, {
    organisationSlug,
    formId,
    name: "Tyre and brake service",
    fields: [service_date],
  });

  const current = await ann.user.query(api.forms.get, { organisationSlug, formId });
  expect(current).toMatchObject({ name: "Tyre and brake service", version: 3 });
  expect(current.fields).toEqual([service_date]);
  const first = await ann.user.query(api.forms.get, {
    organisationSlug,
    formId,
    version: 1,
  });
  expect(first).toMatchObject({ version: 1, fields: [license_plate] });
  const second = await ann.user.query(api.forms.get, {
    organisationSlug,
    formId,
    version: 2,
  });
  expect(second).toMatchObject({ version: 2, fields: [license_plate, service_date] });
});

test("two Fields can't share a key, and the refused save leaves the Form as it was", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Tyre service",
    fields: [license_plate],
  });

  await expect(
    ann.user.mutation(api.forms.save, {
      organisationSlug,
      formId,
      name: "Tyre service",
      fields: [license_plate, { ...service_date, key: "license_plate" }],
    }),
  ).rejects.toThrow('The key "license_plate" is used by more than one Field');
  await expect(
    ann.user.mutation(api.forms.create, {
      organisationSlug,
      name: "Brake service",
      fields: [license_plate, license_plate],
    }),
  ).rejects.toThrow('The key "license_plate" is used by more than one Field');

  expect(
    await ann.user.query(api.forms.get, { organisationSlug, formId }),
  ).toMatchObject({ version: 1, fields: [license_plate] });
});

test.each(["license plate", "2nd_driver", "kenteken-nr", "licensePlate", "License_plate", "license__plate", "_plate", "plate_", "", "prijs€"])(
  'a key like "%s" is refused: it must be snake_case',
  async (key) => {
    const t = newBackend();
    const ann = await signUp(t, "ann", "Acme Fleet");

    await expect(
      ann.user.mutation(api.forms.create, {
        organisationSlug: ann.slug,
        name: "Tyre service",
        fields: [{ ...license_plate, key }],
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
      fields: [{ ...license_plate, label: "  " }],
    }),
  ).rejects.toThrow('The Field "license_plate" needs a label');
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
    fields: [license_plate],
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
      fields: [license_plate],
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
    fields: [license_plate],
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
    fields: [license_plate],
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
      fields: [license_plate],
    }),
  ).rejects.toThrow("A Form needs a name");
});

const position = { type: "text", label: "Positie", key: "position", required: true } as const;

const tyre_changes: Infer<typeof field> = {
  type: "list",
  label: "Gewisselde banden",
  key: "tyre_changes",
  description: "One entry per changed tyre",
  required: true,
  fields: [
    position,
    { type: "number", label: "Profieldiepte", key: "tread_depth_mm", required: false },
    { type: "date", label: "Montagedatum", key: "mounted_on", required: false },
    { type: "boolean", label: "Reserveband", key: "spare", required: false },
    {
      type: "choice",
      label: "Reden",
      key: "reason",
      required: false,
      options: [{ value: "worn", description: "Profiel versleten" }, { value: "puncture" }],
    },
  ],
};

test("saving creates a new Form Version that holds the List Field and its sub-Fields", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;
  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug,
    name: "Tyre service",
    fields: [license_plate],
  });

  await ann.user.mutation(api.forms.save, {
    organisationSlug,
    formId,
    name: "Tyre service",
    fields: [license_plate, tyre_changes],
  });

  expect(
    await ann.user.query(api.forms.get, { organisationSlug, formId }),
  ).toMatchObject({ version: 2, fields: [license_plate, tyre_changes] });
  expect(
    await ann.user.query(api.forms.get, { organisationSlug, formId, version: 1 }),
  ).toMatchObject({ fields: [license_plate] });
});

test("two sub-Fields of a List Field can't share a key, but a sub-Field may reuse a top-level key", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");

  await expect(
    ann.user.mutation(api.forms.create, {
      organisationSlug: ann.slug,
      name: "Tyre service",
      fields: [
        { ...tyre_changes, fields: [position, { ...position, label: "Plaats" }] },
      ],
    }),
  ).rejects.toThrow(
    'The key "position" is used by more than one sub-Field of the List Field "tyre_changes"',
  );

  const { formId } = await ann.user.mutation(api.forms.create, {
    organisationSlug: ann.slug,
    name: "Tyre service",
    fields: [
      license_plate,
      { ...tyre_changes, fields: [position, { ...license_plate, required: false }] },
    ],
  });
  expect(formId).toBeDefined();
});

test("a List Field needs at least one sub-Field, and no sub-Field is a list itself", async () => {
  const t = newBackend();
  const ann = await signUp(t, "ann", "Acme Fleet");
  const organisationSlug = ann.slug;

  await expect(
    ann.user.mutation(api.forms.create, {
      organisationSlug,
      name: "Tyre service",
      fields: [{ ...tyre_changes, fields: [] }],
    }),
  ).rejects.toThrow('The List Field "tyre_changes" needs at least one sub-Field');

  const nested = { ...tyre_changes, key: "axles", fields: [tyre_changes] };
  await expect(
    ann.user.mutation(api.forms.create, {
      organisationSlug,
      name: "Tyre service",
      // @ts-expect-error: the type forbids it too
      fields: [nested],
    }),
  ).rejects.toThrow();
  expect(await ann.user.query(api.forms.list, { organisationSlug })).toEqual([]);
});

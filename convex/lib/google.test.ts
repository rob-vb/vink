import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { google, GoogleFailure } from "./google";

// Google's side of each request, in order; what Vink sent is kept.
let answers: Response[] = [];
let sent: Array<{ url: string; method: string; body: string | null }> = [];

beforeEach(() => {
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "client-123");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "secret-456");
  answers = [];
  sent = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url, method: init.method ?? "GET", body: (init.body as string | undefined) ?? null });
    return answers.shift() ?? Response.json({});
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const sheet = { spreadsheetId: "abc", sheetId: 7 };
const tabs = () => Response.json({
  sheets: [
    { properties: { sheetId: 0, title: "Other" } },
    { properties: { sheetId: 7, title: "Tyre's log", gridProperties: { columnCount: 5 } } },
  ],
});

test("a revoked grant is refused access, so it isn't retried", async () => {
  answers = [Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 })];
  const failure = await google.accessToken("refresh-1").catch((e: unknown) => e);
  expect(failure).toBeInstanceOf(GoogleFailure);
  expect(failure).toMatchObject({ status: 400, accessRefused: true });
});

test("an old-style 403 rate limit counts as a 429; another 403 doesn't", async () => {
  answers = [
    Response.json({ error: { code: 403, message: "Quota", errors: [{ reason: "userRateLimitExceeded" }] } }, { status: 403 }),
    Response.json({ error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } }, { status: 403 }),
  ];
  await expect(google.read("t", sheet, "delivery_id")).rejects.toMatchObject({ status: 429, accessRefused: false });
  await expect(google.read("t", sheet, "delivery_id")).rejects.toMatchObject({
    status: 403,
    message: "Google answered 403: The caller does not have permission",
  });
});

test("reading finds the tab by its id and the column under its header", async () => {
  answers = [
    tabs(),
    Response.json({ values: [["document", "approved_at", "approved_by", "delivery_id"]] }),
    Response.json({ values: [["dlv_1"], [], ["dlv_2"]] }),
  ];
  expect(await google.read("t", sheet, "delivery_id")).toEqual({
    header: ["document", "approved_at", "approved_by", "delivery_id"],
    column: ["dlv_1", null, "dlv_2"],
  });
  expect(decodeURIComponent(sent[1].url)).toContain("/values/'Tyre''s log'!1:1");
  expect(decodeURIComponent(sent[2].url)).toContain("/values/'Tyre''s log'!D2:D");
});

test("appending widens the grid for new columns and writes values, never formulas", async () => {
  answers = [tabs(), Response.json({})];
  await google.append("t", sheet, { from: 4, cells: ["license_plate", "vin"] }, [["=HYPERLINK(1)", 3, true, null]]);
  const { requests } = JSON.parse(sent[1].body!);
  expect(sent[1].url).toBe("https://sheets.googleapis.com/v4/spreadsheets/abc:batchUpdate");
  expect(requests).toEqual([
    { appendDimension: { sheetId: 7, dimension: "COLUMNS", length: 1 } },
    {
      updateCells: {
        start: { sheetId: 7, rowIndex: 0, columnIndex: 4 },
        rows: [{ values: [{ userEnteredValue: { stringValue: "license_plate" } }, { userEnteredValue: { stringValue: "vin" } }] }],
        fields: "userEnteredValue",
      },
    },
    {
      appendCells: {
        sheetId: 7,
        rows: [
          {
            values: [
              { userEnteredValue: { stringValue: "=HYPERLINK(1)" } },
              { userEnteredValue: { numberValue: 3 } },
              { userEnteredValue: { boolValue: true } },
              {},
            ],
          },
        ],
        fields: "userEnteredValue",
      },
    },
  ]);
});

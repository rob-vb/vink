import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emptyWorkbook, microsoft, MicrosoftFailure, needsAdminConsent } from "./microsoft";

// Microsoft's side of each request, in order; what Vink sent is kept.
let answers: Response[] = [];
let sent: Array<{ url: string; method: string; body: BodyInit | null }> = [];

beforeEach(() => {
  vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "app-123");
  vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "secret-456");
  answers = [];
  sent = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url, method: init.method ?? "GET", body: init.body ?? null });
    return answers.shift() ?? Response.json({});
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const workbook = { driveId: "b!drive", itemId: "01ITEM", tableId: "{TABLE-1}" };
const table = "https://graph.microsoft.com/v1.0/drives/b!drive/items/01ITEM/workbook/tables/%7BTABLE-1%7D";
const tokenError = (error: string, description: string) =>
  Response.json({ error, error_description: `${description}\r\nTrace ID: 1\r\nCorrelation ID: 2` }, { status: 400 });

test("each access token comes with a new refresh token", async () => {
  answers = [Response.json({ access_token: "access-1", refresh_token: "refresh-2" })];
  expect(await microsoft.accessToken("refresh-1")).toEqual({ accessToken: "access-1", refreshToken: "refresh-2" });
  expect(sent[0].url).toBe("https://login.microsoftonline.com/organizations/oauth2/v2.0/token");
  expect(Object.fromEntries(new URLSearchParams(sent[0].body as string))).toEqual({
    client_id: "app-123",
    client_secret: "secret-456",
    refresh_token: "refresh-1",
    grant_type: "refresh_token",
    scope: "offline_access https://graph.microsoft.com/Files.ReadWrite",
  });
});

test("a revoked or expired grant, or one that needs a new sign-in, is refused access", async () => {
  answers = [
    tokenError("invalid_grant", "AADSTS70008: The provided authorization code or refresh token has expired."),
    tokenError("interaction_required", "AADSTS50076: Due to a configuration change made by your administrator, you must use multi-factor authentication."),
    tokenError("invalid_client", "AADSTS7000215: Invalid client secret provided."),
  ];
  await expect(microsoft.accessToken("r")).rejects.toMatchObject({
    status: 400,
    accessRefused: true,
    adminConsent: false,
    message: "Microsoft answered 400: AADSTS70008: The provided authorization code or refresh token has expired.",
  });
  await expect(microsoft.accessToken("r")).rejects.toMatchObject({ accessRefused: true });
  // Vink's own secret is wrong: not the account's doing.
  await expect(microsoft.accessToken("r")).rejects.toMatchObject({ accessRefused: false });
});

test("a company that lets only its IT admin consent is told apart", async () => {
  answers = [tokenError("invalid_grant", "AADSTS65001: The user or administrator has not consented to use the application.")];
  await expect(microsoft.exchangeCode("c", "https://vink.page/cb")).rejects.toMatchObject({ adminConsent: true });

  expect(needsAdminConsent("access_denied", "AADSTS90094: The grant requires admin permission.")).toBe(true);
  expect(needsAdminConsent("consent_required", null)).toBe(true);
  expect(needsAdminConsent("access_denied", "AADSTS65004: User declined to consent to access the app.")).toBe(false);
  expect(needsAdminConsent(null, null)).toBe(false);
});

test("a workbook is uploaded to OneDrive as a new file, then gets a table over its header row", async () => {
  answers = [
    Response.json(
      { id: "01ITEM", webUrl: "https://acme-my.sharepoint.com/x/Tyre%20log%201.xlsx", parentReference: { driveId: "b!drive" } },
      { status: 201 },
    ),
    Response.json({ id: "{TABLE-1}", name: "Table1" }, { status: 201 }),
  ];
  expect(await microsoft.createWorkbook("t", "Tyre log: north/south", ["document", "approved_at", "approved_by", "delivery_id"])).toEqual({
    ...workbook,
    url: "https://acme-my.sharepoint.com/x/Tyre%20log%201.xlsx",
  });
  expect(sent[0]).toMatchObject({
    method: "PUT",
    url: "https://graph.microsoft.com/v1.0/me/drive/root:/Tyre%20log-%20north-south.xlsx:/content?@microsoft.graph.conflictBehavior=rename",
  });
  expect(sent[0].body).toBeInstanceOf(Uint8Array);
  expect(sent[1]).toMatchObject({
    method: "POST",
    url: "https://graph.microsoft.com/v1.0/drives/b!drive/items/01ITEM/workbook/tables/add",
  });
  expect(JSON.parse(sent[1].body as string)).toEqual({ address: "Vink!A1:D1", hasHeaders: true });
});

test("reading takes the table's header and the column under its name, blanks as empty cells", async () => {
  answers = [
    Response.json({ values: [["document", "approved_at", "approved_by", "delivery_id"]] }),
    Response.json({ values: [["dlv_1"], [""], ["dlv_2"]] }),
  ];
  expect(await microsoft.read("t", workbook, "delivery_id")).toEqual({
    header: ["document", "approved_at", "approved_by", "delivery_id"],
    column: ["dlv_1", null, "dlv_2"],
  });
  expect(sent.map((s) => s.url)).toEqual([
    `${table}/headerRowRange?$select=values`,
    `${table}/columns/delivery_id/dataBodyRange?$select=values`,
  ]);

  sent = [];
  answers = [Response.json({ values: [["document"]] })];
  expect(await microsoft.read("t", workbook, "delivery_id")).toEqual({ header: ["document"], column: [] });
  expect(sent).toHaveLength(1);
});

test("appending inserts new columns at their index, in order, then adds the rows as text, never formulas", async () => {
  answers = [Response.json({}), Response.json({}), Response.json({ index: 7 }, { status: 201 })];
  await microsoft.append(
    "t",
    workbook,
    [
      { index: 2, name: "supplier" },
      { index: 3, name: "total" },
    ],
    [["=HYPERLINK(\"x\")", 3, null, "00123", true]],
  );
  expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
    `POST ${table}/columns/add`,
    `POST ${table}/columns/add`,
    `POST ${table}/rows/add`,
  ]);
  expect(JSON.parse(sent[0].body as string)).toEqual({ index: 2, name: "supplier" });
  expect(JSON.parse(sent[1].body as string)).toEqual({ index: 3, name: "total" });
  expect(JSON.parse(sent[2].body as string)).toEqual({
    index: null,
    values: [["'=HYPERLINK(\"x\")", 3, "", "'00123", true]],
  });
});

test("the empty row a new table starts with goes once the first rows are in, and only if it is empty", async () => {
  answers = [Response.json({ index: 1 }, { status: 201 }), Response.json({ values: [["", "", "", ""]] }), new Response(null, { status: 204 })];
  await microsoft.append("t", workbook, [], [["a", "b", "c", "d"]]);
  expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
    `POST ${table}/rows/add`,
    `GET ${table}/rows/itemAt(index=0)?$select=values`,
    `DELETE ${table}/rows/itemAt(index=0)`,
  ]);

  sent = [];
  answers = [Response.json({ index: 1 }, { status: 201 }), Response.json({ values: [["typed by hand", "", "", ""]] })];
  await microsoft.append("t", workbook, [], [["a", "b", "c", "d"]]);
  expect(sent.map((s) => s.method)).toEqual(["POST", "GET"]);

  // The rows are in even when removing the empty row doesn't work.
  answers = [Response.json({ index: 1 }, { status: 201 }), Response.json({ error: { code: "x" } }, { status: 503 })];
  await expect(microsoft.append("t", workbook, [], [["a"]])).resolves.toBeUndefined();
});

test("a rate limit keeps its Retry-After; a workbook Vink can't open is told apart from a failure", async () => {
  answers = [
    Response.json({ error: { code: "TooManyRequests", message: "Too many requests" } }, { status: 429, headers: { "Retry-After": "12" } }),
    Response.json({ error: { code: "itemNotFound", message: "The resource could not be found." } }, { status: 404 }),
    Response.json({ error: { code: "accessDenied", message: "Access denied" } }, { status: 403 }),
    Response.json({ error: { code: "InvalidAuthenticationToken", message: "Access token has expired" } }, { status: 401 }),
  ];
  await expect(microsoft.read("t", workbook, "delivery_id")).rejects.toMatchObject({
    status: 429,
    retryAfter: "12",
    message: "Microsoft answered 429: Too many requests",
  });
  expect(await microsoft.canOpen("t", workbook)).toBe(false);
  expect(await microsoft.canOpen("t", workbook)).toBe(false);
  const expired = await microsoft.canOpen("t", workbook).catch((e: unknown) => e);
  expect(expired).toBeInstanceOf(MicrosoftFailure);
  expect(expired).toMatchObject({ status: 401, accessRefused: true });
});

/** The files of a ZIP whose entries are stored as they are (what emptyWorkbook writes). */
function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files: Record<string, string> = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength));
    files[name] = new TextDecoder().decode(bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size));
    at += 30 + nameLength + size;
  }
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  expect(view.getUint16(bytes.length - 12, true)).toBe(Object.keys(files).length);
  return files;
}

test("the new workbook has one worksheet whose first row is the header, as text", () => {
  const files = unzip(emptyWorkbook("Vink", ["document", "a<b & \"c\""]));
  expect(Object.keys(files).sort()).toEqual([
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/_rels/workbook.xml.rels",
    "xl/workbook.xml",
    "xl/worksheets/sheet1.xml",
  ]);
  expect(files["xl/workbook.xml"]).toContain('<sheet name="Vink" sheetId="1" r:id="rId1"/>');
  expect(files["xl/worksheets/sheet1.xml"]).toContain(
    '<row r="1"><c r="A1" t="inlineStr"><is><t>document</t></is></c><c r="B1" t="inlineStr"><is><t>a&lt;b &amp; &quot;c&quot;</t></is></c></row>',
  );
});

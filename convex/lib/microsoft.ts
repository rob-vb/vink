// The adapter boundary for Microsoft: the Microsoft identity platform (OAuth
// 2.0 auth code flow, multi-tenant, work or school accounts only) and the
// Microsoft Graph Excel API on a workbook in the account's OneDrive. Every
// call to Microsoft goes through `microsoft`; tests replace it with a fake
// (see test.setup.ts). Needs MICROSOFT_OAUTH_CLIENT_ID and
// MICROSOFT_OAUTH_CLIENT_SECRET on the deployment.
//
// Why `organizations` and not `common`: Graph's Excel API can't add table
// rows for a personal Microsoft account, so only work or school accounts
// can sign in. Why `Files.ReadWrite`: it is the least the Excel API takes,
// covers only the account's own OneDrive, and needs no admin consent by
// itself (a tenant can still ask for it). A SharePoint site would need
// `Sites.ReadWrite.All`, which always needs an admin, so Vink uses OneDrive.
import { ConvexError } from "convex/values";
import { type Cell, columnLetter } from "./rows";

const LOGIN_URL = "https://login.microsoftonline.com/organizations";
const GRAPH_URL = "https://graph.microsoft.com/v1.0";
export const FILES_SCOPE = "https://graph.microsoft.com/Files.ReadWrite";
// offline_access: a refresh token, so Vink can write after the Admin has left.
const SCOPES = `offline_access ${FILES_SCOPE}`;

// Microsoft must answer within this long.
const TIMEOUT_MS = 15_000;

// The worksheet Vink makes and writes to.
const WORKSHEET = "Vink";

/** Where Vink's rows go: the workbook (by drive and item, so a move or rename is fine) and its table. */
export type WorkbookRef = { driveId: string; itemId: string; tableId: string };

/**
 * Microsoft didn't do it. `status` is null when it didn't answer at all.
 * `accessRefused`: the connected account no longer lets Vink in (a revoked,
 * expired or blocked grant), so trying again won't help until it is
 * connected again. `adminConsent`: the account's company lets only its IT
 * admin consent to Vink.
 */
export class MicrosoftFailure extends Error {
  constructor(
    readonly status: number | null,
    message: string,
    readonly retryAfter: string | null = null,
    readonly accessRefused = false,
    readonly adminConsent = false,
  ) {
    super(message);
  }
}

export type MicrosoftClient = {
  /** Trades the code from the sign-in page for a refresh token and the scopes granted. */
  exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string | null; scopes: string[] }>;
  /**
   * A short-lived access token for a refresh token, and the new refresh token
   * Microsoft hands out with it (the old one keeps working until it expires,
   * but only the newest stays valid for long: store it).
   */
  accessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string | null }>;
  /** Whether the account can open the workbook: Files.ReadWrite reaches only the account's own files. */
  canOpen(accessToken: string, workbook: WorkbookRef): Promise<boolean>;
  /** Makes a workbook in the account's OneDrive with a table whose header row is `header`. */
  createWorkbook(accessToken: string, title: string, header: string[]): Promise<WorkbookRef & { url: string }>;
  /** The table's header row, and every value in the column headed `column` (none if there is no such column). */
  read(accessToken: string, workbook: WorkbookRef, column: string): Promise<{ header: string[]; column: Cell[] }>;
  /** Adds the `added` columns on the right of the table, then `rows` below it. Values are text, never formulas. */
  append(accessToken: string, workbook: WorkbookRef, added: string[], rows: Cell[][]): Promise<void>;
};

/** The app registration's id and secret, from the deployment's environment. */
export function microsoftClientConfig() {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ConvexError("Excel isn't set up on this deployment");
  return { clientId, clientSecret };
}

/** Microsoft's sign-in page for a work or school account, asking for offline access to its files. */
export function microsoftConsentUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: microsoftClientConfig().clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES,
    // Lets the Admin pick the right work account. Not `consent`: where only
    // the IT admin may consent, forcing the consent page blocks everyone,
    // even after the admin has consented.
    prompt: "select_account",
    state,
  });
  return `${LOGIN_URL}/oauth2/v2.0/authorize?${params}`;
}

/**
 * The page where a company's IT admin consents to Vink for everyone in the
 * company (Cloud Application Administrator or Application Administrator).
 * `organizations`: the admin's own company.
 */
export function adminConsentUrl(clientId: string) {
  return `${LOGIN_URL}/adminconsent?client_id=${encodeURIComponent(clientId)}`;
}

/**
 * Whether an error from Microsoft's sign-in or token endpoint means the
 * account's company lets only its IT admin consent to Vink: AADSTS65001 (no
 * consent), 90094 (admin permission needed) or 90095 (an admin-consent
 * request was sent), or `consent_required`.
 */
export function needsAdminConsent(error: string | null, description: string | null) {
  return (
    error === "consent_required" ||
    /AADSTS(65001|90094|90095)\b/.test(description ?? "") ||
    /admin (consent|approval)/i.test(description ?? "")
  );
}

async function call(url: string, init: RequestInit & { token?: string } = {}): Promise<unknown> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(url, { ...rest, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new MicrosoftFailure(
      null,
      error instanceof DOMException && error.name === "TimeoutError"
        ? "Microsoft didn't answer within 15 s"
        : "Microsoft couldn't be reached",
    );
  }
  const text = await response.text().catch(() => "");
  if (response.ok) return text === "" ? null : JSON.parse(text);
  let body: { error?: string | { code?: string; message?: string }; error_description?: string } = {};
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: the status says enough.
  }
  const error = body.error;
  // The token endpoint answers `invalid_grant` for a revoked or expired grant
  // (or consent taken back), `interaction_required` when the company now
  // wants the person to sign in again (MFA, a new policy).
  const adminConsent = typeof error === "string" && needsAdminConsent(error, body.error_description ?? null);
  const accessRefused =
    response.status === 401 || error === "invalid_grant" || error === "interaction_required" || adminConsent;
  // The token endpoint's description starts with the AADSTS code; keep that line only.
  const message = typeof error === "object" ? error.message : (body.error_description?.split("\r\n")[0] ?? error);
  throw new MicrosoftFailure(
    response.status,
    message ? `Microsoft answered ${response.status}: ${message}` : `Microsoft answered ${response.status}`,
    response.headers.get("retry-after"),
    accessRefused,
    adminConsent,
  );
}

function form(fields: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  };
}

function json(method: string, body: unknown, token: string): RequestInit & { token: string } {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), token };
}

/** The Graph URL of a workbook's table. */
function tableUrl({ driveId, itemId, tableId }: WorkbookRef) {
  const workbook = `${GRAPH_URL}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/workbook`;
  return `${workbook}/tables/${encodeURIComponent(tableId)}`;
}

/**
 * A cell as Excel stores it. Text gets a leading apostrophe, Excel's
 * "this is text" mark (it doesn't show): no formula, and no "00123" turned
 * into 123 or "1-2" into a date. `null` is an empty cell.
 */
function cellValue(value: Cell) {
  if (value === null) return "";
  if (typeof value === "string") return value === "" ? "" : `'${value}`;
  return value;
}

/** A OneDrive file name: no characters OneDrive refuses, and not empty. */
function fileName(title: string) {
  const name = title.replace(/["*:<>?/\\|#%]/g, "-").trim() || "Vink";
  return `${name}.xlsx`;
}

export const microsoft: MicrosoftClient = {
  async exchangeCode(code, redirectUri) {
    const { clientId, clientSecret } = microsoftClientConfig();
    const answer = (await call(
      `${LOGIN_URL}/oauth2/v2.0/token`,
      form({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: SCOPES,
      }),
    )) as { refresh_token?: string; scope?: string };
    return { refreshToken: answer.refresh_token ?? null, scopes: (answer.scope ?? "").split(" ") };
  },

  async accessToken(refreshToken) {
    const { clientId, clientSecret } = microsoftClientConfig();
    const answer = (await call(
      `${LOGIN_URL}/oauth2/v2.0/token`,
      form({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: SCOPES,
      }),
    )) as { access_token: string; refresh_token?: string };
    return { accessToken: answer.access_token, refreshToken: answer.refresh_token ?? null };
  },

  async canOpen(token, workbook) {
    try {
      await call(`${tableUrl(workbook)}?$select=id`, { token });
      return true;
    } catch (error) {
      if (error instanceof MicrosoftFailure && (error.status === 403 || error.status === 404)) return false;
      throw error;
    }
  },

  async createWorkbook(token, title, header) {
    const path = encodeURIComponent(fileName(title));
    const item = (await call(
      `${GRAPH_URL}/me/drive/root:/${path}:/content?@microsoft.graph.conflictBehavior=rename`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body: emptyWorkbook(WORKSHEET, header) as BodyInit,
        token,
      },
    )) as { id: string; webUrl: string; parentReference: { driveId: string } };
    const driveId = item.parentReference.driveId;
    const workbook = `${GRAPH_URL}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(item.id)}/workbook`;
    const table = (await call(
      `${workbook}/tables/add`,
      json("POST", { address: `${WORKSHEET}!A1:${columnLetter(header.length - 1)}1`, hasHeaders: true }, token),
    )) as { id: string };
    return { driveId, itemId: item.id, tableId: table.id, url: item.webUrl };
  },

  async read(token, workbook, column) {
    const table = tableUrl(workbook);
    const headerRow = (await call(`${table}/headerRowRange?$select=values`, { token })) as { values: Cell[][] };
    const header = (headerRow.values[0] ?? []).map((c) => (c === null ? "" : String(c)));
    if (!header.includes(column)) return { header, column: [] };
    const body = (await call(`${table}/columns/${encodeURIComponent(column)}/dataBodyRange?$select=values`, {
      token,
    })) as { values: Cell[][] };
    return { header, column: body.values.map((row) => (row[0] === "" ? null : (row[0] ?? null))) };
  },

  async append(token, workbook, added, rows) {
    const table = tableUrl(workbook);
    for (const name of added) {
      await call(`${table}/columns/add`, json("POST", { index: null, name }, token));
    }
    const answer = (await call(
      `${table}/rows/add`,
      json("POST", { index: null, values: rows.map((row) => row.map(cellValue)) }, token),
    )) as { index?: number };
    // A new table comes with one empty row under its header. Once the first
    // rows are in below it, it goes. Best-effort: the rows are in either way.
    if (answer?.index !== 1) return;
    try {
      const first = (await call(`${table}/rows/itemAt(index=0)?$select=values`, { token })) as { values: Cell[][] };
      if (first.values.every((row) => row.every((cell) => cell === "" || cell === null))) {
        await call(`${table}/rows/itemAt(index=0)`, { method: "DELETE", token });
      }
    } catch (error) {
      if (!(error instanceof MicrosoftFailure)) throw error;
    }
  },
};

// --- A new, empty .xlsx: one worksheet with the header in row 1. ---------

function escapeXml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** The parts of the smallest workbook Excel opens: content types, two relationship files, the workbook and its sheet. */
function workbookParts(sheetName: string, header: string[]): Array<[string, string]> {
  const cells = header
    .map((h, i) => `<c r="${columnLetter(i)}1" t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>`)
    .join("");
  return [
    [
      "[Content_Types].xml",
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        "</Types>",
    ],
    [
      "_rels/.rels",
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
        "</Relationships>",
    ],
    [
      "xl/workbook.xml",
      `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}">` +
        `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
        "</workbook>",
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        "</Relationships>",
    ],
    [
      "xl/worksheets/sheet1.xml",
      `${XML}<worksheet xmlns="${MAIN}">` +
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
        `<sheetData><row r="1">${cells}</row></sheetData>` +
        "</worksheet>",
    ],
  ];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A ZIP archive of the files as they are (method 0, "stored"): an .xlsx is a
 * ZIP, and Excel needs no compression. Local headers, then the central
 * directory, then its end record (PKWARE APPNOTE 4.3).
 */
function zip(files: Array<[string, string]>) {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of files) {
    const path = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true); // version needed: 2.0
    header.setUint16(8, 0, true); // stored
    header.setUint16(12, 0x21, true); // 1980-01-01
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true);
    header.setUint32(22, data.length, true);
    header.setUint16(26, path.length, true);
    local.push(new Uint8Array(header.buffer), path, data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true); // made by
    entry.setUint16(6, 20, true); // version needed
    entry.setUint16(10, 0, true); // stored
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, path.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), path);
    offset += 30 + path.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A new .xlsx with one worksheet, `sheetName`, whose row 1 is `header` (frozen). */
export function emptyWorkbook(sheetName: string, header: string[]) {
  return zip(workbookParts(sheetName, header));
}

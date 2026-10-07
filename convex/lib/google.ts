// The adapter boundary for Google: OAuth 2.0 (web server flow, scope
// drive.file: Vink sees only the files it made) and the Sheets API v4. Every
// call to Google goes through `google`; tests replace it with a fake (see
// test.setup.ts). Needs GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET
// on the deployment.
import { ConvexError } from "convex/values";
import { type Cell, columnLetter } from "./rows";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

// Google must answer within this long.
const TIMEOUT_MS = 15_000;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";

/** The tab Vink makes and writes to. Found again by its id, so renaming it is fine. */
export type SheetRef = { spreadsheetId: string; sheetId: number };

/**
 * Google didn't do it. `status` is null when it didn't answer at all.
 * `accessRefused`: the connected account no longer lets Vink in (a revoked
 * or expired grant), so trying again won't help until it is connected again.
 */
export class GoogleFailure extends Error {
  constructor(
    readonly status: number | null,
    message: string,
    readonly retryAfter: string | null = null,
    readonly accessRefused = false,
  ) {
    super(message);
  }
}

export type GoogleClient = {
  /** Trades the code from the consent page for a refresh token and the scopes granted. */
  exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string | null; scopes: string[] }>;
  /** A short-lived access token for a refresh token. */
  accessToken(refreshToken: string): Promise<string>;
  /** Whether the account can open the spreadsheet: drive.file lets Vink open only the files it made. */
  canOpen(accessToken: string, spreadsheetId: string): Promise<boolean>;
  /** Makes a spreadsheet with one tab, its header row filled in and frozen. */
  createSheet(accessToken: string, title: string, header: string[]): Promise<SheetRef & { url: string }>;
  /**
   * Row 1, every value below it in the column headed `column` (none if there
   * is no such column), and how many columns the tab's grid has.
   */
  read(
    accessToken: string,
    sheet: SheetRef,
    column: string,
  ): Promise<{ header: string[]; column: Cell[]; columnCount: number }>;
  /**
   * In one request: writes `added` into row 1 from column `from` on (widening
   * the grid of `columnCount` columns, as `read` gave it, if need be), and
   * appends `rows` below the last row with data. Values are stored as they
   * are, never read as formulas.
   */
  append(
    accessToken: string,
    sheet: SheetRef,
    added: { from: number; cells: string[]; columnCount: number },
    rows: Cell[][],
  ): Promise<void>;
};

/** The OAuth client's id and secret, from the deployment's environment. */
export function googleClientConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ConvexError("Google Sheets isn't set up on this deployment");
  return { clientId, clientSecret };
}

/** Google's consent page, asking for offline access to the files Vink makes. */
export function googleConsentUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: googleClientConfig().clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: DRIVE_FILE_SCOPE,
    access_type: "offline",
    // Always ask, so Google always hands out a refresh token.
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function call(url: string, init: RequestInit & { token?: string } = {}): Promise<unknown> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(url, { ...rest, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new GoogleFailure(
      null,
      error instanceof DOMException && error.name === "TimeoutError"
        ? "Google didn't answer within 15 s"
        : "Google couldn't be reached",
    );
  }
  const text = await response.text().catch(() => "");
  if (response.ok) return text === "" ? null : JSON.parse(text);
  let body: { error?: string | { message?: string; status?: string; errors?: Array<{ reason?: string }> } } = {};
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: the status says enough.
  }
  const error = body.error;
  // The token endpoint answers `{"error":"invalid_grant"}` for a revoked or expired grant.
  const accessRefused = response.status === 401 || error === "invalid_grant";
  // Older quota errors come as 403 with a rate-limit reason: those pass, so retry them like a 429.
  const rateLimited =
    response.status === 403 &&
    typeof error === "object" &&
    (error.status === "RESOURCE_EXHAUSTED" || !!error.errors?.some((e) => /rateLimitExceeded/i.test(e.reason ?? "")));
  const message = typeof error === "object" ? error.message : error;
  throw new GoogleFailure(
    rateLimited ? 429 : response.status,
    message ? `Google answered ${response.status}: ${message}` : `Google answered ${response.status}`,
    response.headers.get("retry-after"),
    accessRefused,
  );
}

function form(fields: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  };
}

function json(body: unknown, token: string): RequestInit & { token: string } {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), token };
}

function cellData(value: Cell) {
  if (value === null) return {};
  if (typeof value === "number") return { userEnteredValue: { numberValue: value } };
  if (typeof value === "boolean") return { userEnteredValue: { boolValue: value } };
  return { userEnteredValue: { stringValue: value } };
}

type SheetProperties = { sheetId: number; title: string; gridProperties?: { columnCount?: number } };

async function propertiesOf(token: string, sheet: SheetRef) {
  const fields = encodeURIComponent("sheets.properties(sheetId,title,gridProperties.columnCount)");
  const answer = (await call(`${SHEETS_URL}/${sheet.spreadsheetId}?fields=${fields}`, { token })) as {
    sheets?: Array<{ properties: SheetProperties }>;
  };
  const found = answer.sheets?.find((s) => s.properties.sheetId === sheet.sheetId);
  if (!found) throw new GoogleFailure(404, "The sheet's Vink tab was deleted");
  return found.properties;
}

async function values(token: string, sheet: SheetRef, title: string, range: string): Promise<Cell[][]> {
  const a1 = encodeURIComponent(`'${title.replace(/'/g, "''")}'!${range}`);
  const answer = (await call(
    `${SHEETS_URL}/${sheet.spreadsheetId}/values/${a1}?valueRenderOption=UNFORMATTED_VALUE`,
    { token },
  )) as { values?: Cell[][] };
  return answer.values ?? [];
}

export const google: GoogleClient = {
  async exchangeCode(code, redirectUri) {
    const { clientId, clientSecret } = googleClientConfig();
    const answer = (await call(
      TOKEN_URL,
      form({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    )) as { refresh_token?: string; scope?: string };
    return { refreshToken: answer.refresh_token ?? null, scopes: (answer.scope ?? "").split(" ") };
  },

  async accessToken(refreshToken) {
    const { clientId, clientSecret } = googleClientConfig();
    const answer = (await call(
      TOKEN_URL,
      form({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    )) as { access_token: string };
    return answer.access_token;
  },

  async canOpen(token, spreadsheetId) {
    try {
      await call(`${SHEETS_URL}/${spreadsheetId}?fields=spreadsheetId`, { token });
      return true;
    } catch (error) {
      if (error instanceof GoogleFailure && (error.status === 403 || error.status === 404)) return false;
      throw error;
    }
  },

  async createSheet(token, title, header) {
    const answer = (await call(
      SHEETS_URL,
      json(
        {
          properties: { title },
          sheets: [
            {
              properties: { title: "Vink", gridProperties: { frozenRowCount: 1 } },
              data: [{ startRow: 0, startColumn: 0, rowData: [{ values: header.map(cellData) }] }],
            },
          ],
        },
        token,
      ),
    )) as { spreadsheetId: string; spreadsheetUrl: string; sheets: Array<{ properties: SheetProperties }> };
    return {
      spreadsheetId: answer.spreadsheetId,
      sheetId: answer.sheets[0].properties.sheetId,
      url: answer.spreadsheetUrl,
    };
  },

  async read(token, sheet, column) {
    const { title, gridProperties } = await propertiesOf(token, sheet);
    const columnCount = gridProperties?.columnCount ?? 0;
    const header = ((await values(token, sheet, title, "1:1"))[0] ?? []).map((c) => (c === null ? "" : String(c)));
    const index = header.indexOf(column);
    if (index === -1) return { header, column: [], columnCount };
    const letter = columnLetter(index);
    const cells = (await values(token, sheet, title, `${letter}2:${letter}`)).map((row) => row[0] ?? null);
    return { header, column: cells, columnCount };
  },

  async append(token, sheet, added, rows) {
    const requests: unknown[] = [];
    if (added.cells.length > 0) {
      const missing = added.from + added.cells.length - added.columnCount;
      if (missing > 0) {
        requests.push({ appendDimension: { sheetId: sheet.sheetId, dimension: "COLUMNS", length: missing } });
      }
      requests.push({
        updateCells: {
          start: { sheetId: sheet.sheetId, rowIndex: 0, columnIndex: added.from },
          rows: [{ values: added.cells.map(cellData) }],
          fields: "userEnteredValue",
        },
      });
    }
    requests.push({
      appendCells: {
        sheetId: sheet.sheetId,
        rows: rows.map((row) => ({ values: row.map(cellData) })),
        fields: "userEnteredValue",
      },
    });
    await call(`${SHEETS_URL}/${sheet.spreadsheetId}:batchUpdate`, json({ requests }, token));
  },
};

// The Google Sheets adapter: adds a Document's rows (lib/rows.ts, ADR 0009)
// to the Integration's sheet, a new Field's column just before `approved_at`.
// A Delivery whose `delivery_id` is already in the sheet adds nothing, so a
// retry after a lost answer, or a re-send, doesn't write its rows twice.
import { google, GoogleFailure } from "./google";
import type { IntegrationAdapter, SendResult } from "./integrationAdapters";
import { rowsOf, sheetLayout } from "./rows";
import { decryptSecret } from "./secrets";

/** The reason an access-refused Delivery fails with (`cause: "access_expired"`). */
export const ACCESS_EXPIRED = "Access expired: the Google account no longer lets Vink write to the sheet";

/** How a failure from Google settles an attempt. */
function failedWith(failure: GoogleFailure): SendResult {
  const { status, message } = failure;
  const log = { status, body: status === null ? null : message, error: status === null ? message : null };
  if (failure.accessRefused) {
    return { outcome: { kind: "failed", reason: ACCESS_EXPIRED, cause: "access_expired" }, ...log };
  }
  if (status === null) return { outcome: { kind: "retry", reason: message, retryAfter: null }, ...log };
  if (status === 408 || status === 429 || status >= 500) {
    return {
      outcome: { kind: "retry", reason: `Google answered ${status}`, retryAfter: failure.retryAfter },
      ...log,
    };
  }
  if (status === 404) {
    return { outcome: { kind: "failed", reason: "The sheet is gone: it, or its Vink tab, was deleted" }, ...log };
  }
  return { outcome: { kind: "failed", reason: `Google refused the write (${status})` }, ...log };
}

export const googleSheetsAdapter: IntegrationAdapter<"google_sheets"> = {
  async send(integration, envelope, { approverEmail }) {
    const sheet = { spreadsheetId: integration.spreadsheetId, sheetId: integration.sheetId };
    try {
      const token = await google.accessToken(await decryptSecret(integration.refreshToken));
      const { header, column, columnCount } = await google.read(token, sheet, "delivery_id");
      if (column.includes(envelope.delivery_id)) {
        return { outcome: { kind: "delivered" }, status: 200, body: "Already in the sheet: no rows added", error: null };
      }
      const { inserts, values } = sheetLayout(header, rowsOf(envelope, approverEmail));
      await google.append(token, sheet, { inserts, columnCount }, values);
      const body = values.length === 1 ? "1 row added to the sheet" : `${values.length} rows added to the sheet`;
      return { outcome: { kind: "delivered" }, status: 200, body, error: null };
    } catch (error) {
      if (!(error instanceof GoogleFailure)) throw error;
      return failedWith(error);
    }
  },
};

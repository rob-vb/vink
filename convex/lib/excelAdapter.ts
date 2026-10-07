// The Excel adapter: adds a Document's rows (lib/rows.ts, ADR 0009) to the
// table of the Integration's workbook, a new Field's column on the right. A
// Delivery whose `delivery_id` is already in the table adds nothing, so a
// retry after a lost answer, or a re-send, doesn't write its rows twice.
// Every access token comes with a new refresh token, which is kept.
import type { IntegrationAdapter, SendResult } from "./integrationAdapters";
import { microsoft, MicrosoftFailure } from "./microsoft";
import { rowsOf, sheetLayout } from "./rows";
import { decryptSecret } from "./secrets";

/** The reason an access-refused Delivery fails with (`cause: "access_expired"`). */
export const ACCESS_EXPIRED = "Access expired: the Microsoft account no longer lets Vink write to the workbook";

/** How a failure from Microsoft settles an attempt. */
function failedWith(failure: MicrosoftFailure): SendResult {
  const { status, message } = failure;
  const log = { status, body: status === null ? null : message, error: status === null ? message : null };
  if (failure.accessRefused) {
    return { outcome: { kind: "failed", reason: ACCESS_EXPIRED, cause: "access_expired" }, ...log };
  }
  if (status === null) return { outcome: { kind: "retry", reason: message, retryAfter: null }, ...log };
  // 423: the workbook is locked for a moment (someone's edit, a sync).
  if (status === 408 || status === 423 || status === 429 || status >= 500) {
    return {
      outcome: { kind: "retry", reason: `Microsoft answered ${status}`, retryAfter: failure.retryAfter },
      ...log,
    };
  }
  if (status === 404) {
    return { outcome: { kind: "failed", reason: "The workbook is gone: it, or its Vink table, was deleted" }, ...log };
  }
  return { outcome: { kind: "failed", reason: `Microsoft refused the write (${status})` }, ...log };
}

export const excelAdapter: IntegrationAdapter<"excel"> = {
  async send(integration, envelope, { approverEmail, keepRefreshToken }) {
    try {
      const token = await microsoft.accessToken(await decryptSecret(integration.refreshToken));
      if (token.refreshToken !== null) await keepRefreshToken(token.refreshToken);
      const { header, column } = await microsoft.read(token.accessToken, integration, "delivery_id");
      if (column.includes(envelope.delivery_id)) {
        return { outcome: { kind: "delivered" }, status: 200, body: "Already in the workbook: no rows added", error: null };
      }
      const { added, values } = sheetLayout(header, rowsOf(envelope, approverEmail));
      await microsoft.append(token.accessToken, integration, added, values);
      const body = values.length === 1 ? "1 row added to the workbook" : `${values.length} rows added to the workbook`;
      return { outcome: { kind: "delivered" }, status: 200, body, error: null };
    } catch (error) {
      if (!(error instanceof MicrosoftFailure)) throw error;
      return failedWith(error);
    }
  },
};

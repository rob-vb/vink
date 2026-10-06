// How a spreadsheet Integration (Google Sheets, Excel) lays out a Document
// (ADR 0009): one row per entry of the Form's first List Field, the
// Document's other values repeated on each row, any further List as JSON in
// one cell. Columns are headed by Field keys, a first-List sub-Field by
// `<list key>.<sub key>`, plus `document`, `approved_at`, `approved_by` and
// `delivery_id`.
import type { Envelope } from "./integrationAdapters";
import type { FilledValue } from "./pipeline";

/** One cell's value; `null` is an empty cell. */
export type Cell = FilledValue;
/** One row, keyed by column header. */
export type Row = Record<string, Cell>;

/**
 * The rows a Document's envelope writes. `approved_by` is the approver's
 * email, or "Auto-Send"; a test-send's rows say "[test]" before the filename.
 */
export function rowsOf(envelope: Envelope, approverEmail: string | null): Row[] {
  const document: Row = {
    document: `${envelope.test ? "[test] " : ""}${envelope.document.filename}`,
    approved_at: envelope.approval.at,
    approved_by: envelope.approval.mode === "auto" ? "Auto-Send" : approverEmail,
    delivery_id: envelope.delivery_id,
  };
  let first: { key: string; entries: Array<Record<string, Cell>> } | null = null;
  // The data's keys are in the Form's order (lib/payload.ts), so the first array is the first List.
  for (const [key, value] of Object.entries(envelope.data)) {
    if (!Array.isArray(value)) {
      document[key] = value;
    } else if (first === null) {
      first = { key, entries: value };
    } else {
      document[key] = value.length === 0 ? null : JSON.stringify(value);
    }
  }
  if (first === null || first.entries.length === 0) return [document];
  const { key, entries } = first;
  return entries.map((entry) => ({
    ...document,
    ...Object.fromEntries(Object.entries(entry).map(([sub, value]) => [`${key}.${sub}`, value])),
  }));
}

/**
 * Lines rows up under a sheet's header (row 1, as it is now, in whatever
 * order the sheet's owner left it). A column the header lacks is `added` on
 * the right; existing columns never move.
 */
export function sheetLayout(header: string[], rows: Row[]) {
  const added: string[] = [];
  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (!header.includes(column) && !added.includes(column)) added.push(column);
    }
  }
  const columns = [...header, ...added];
  return { added, values: rows.map((row) => columns.map((c) => row[c] ?? null)) };
}

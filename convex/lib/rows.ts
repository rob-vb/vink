// How a spreadsheet Integration (Google Sheets, Excel) lays out a Document
// (ADR 0009): one row per entry of the Form's first List Field, the
// Document's other values repeated on each row, any further List as JSON in
// one cell. Columns are headed by Field keys, a first-List sub-Field by
// `<list key>.<sub key>`, plus `document`, `approved_at`, `approved_by` and
// `delivery_id`. A Field keyed like one of those four is headed
// `<key> (Field)`, so Vink's own columns (the duplicate check reads
// `delivery_id`) are never overwritten.
import type { Envelope } from "./integrationAdapters";
import type { FilledValue } from "./pipeline";

/** One cell's value; `null` is an empty cell. */
export type Cell = FilledValue;
/** One row, keyed by column header. */
export type Row = Record<string, Cell>;

/** The columns every row has, whatever the Form; a new sheet starts with these. */
export const DOCUMENT_COLUMNS = ["document", "approved_at", "approved_by", "delivery_id"];

/** A Field's column: its key, unless that is one of Vink's own (a key has no space, so this can't be a key). */
function columnOf(key: string) {
  return DOCUMENT_COLUMNS.includes(key) ? `${key} (Field)` : key;
}

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
  // The data's keys are in the Form's order (lib/payload.ts), so the first array is the first List.
  const first = Object.keys(envelope.data).find((key) => Array.isArray(envelope.data[key]));
  const rowWith = (entry: Record<string, Cell> | null) => {
    const row = { ...document };
    for (const [key, value] of Object.entries(envelope.data)) {
      if (key === first) {
        for (const [sub, cell] of Object.entries(entry ?? {})) row[`${key}.${sub}`] = cell;
      } else if (Array.isArray(value)) {
        row[columnOf(key)] = value.length === 0 ? null : JSON.stringify(value);
      } else {
        row[columnOf(key)] = value;
      }
    }
    return row;
  };
  const entries = first === undefined ? [] : (envelope.data[first] as Array<Record<string, Cell>>);
  return entries.length === 0 ? [rowWith(null)] : entries.map(rowWith);
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

/** `A`, …, `Z`, `AA`, … for a 0-based column index. */
export function columnLetter(index: number) {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

// How a spreadsheet Integration (Google Sheets, Excel) lays out a Submission
// (ADR 0009): one row per entry of the Form's first List Field, the
// Submission's other values repeated on each row, any further List as JSON in
// one cell. Columns are headed by Field keys, a first-List sub-Field by
// `<list key>.<sub key>`, plus `submission` (first), `approved_at`,
// `approved_by` and `delivery_id` (last, in that order). A Field keyed like one of those four is headed
// `<key> (Field)`, so Vink's own columns (the duplicate check reads
// `delivery_id`) are never overwritten.
import type { Envelope } from "./integrationAdapters";
import type { FilledValue } from "./pipeline";

/** One cell's value; `null` is an empty cell. */
export type Cell = FilledValue;
/** One row, keyed by column header. */
export type Row = Record<string, Cell>;

/** The columns every row has, whatever the Form; a new sheet starts with these. */
export const SUBMISSION_COLUMNS = ["submission", "approved_at", "approved_by", "delivery_id"];

/** A Field's column: its key, unless that is one of Vink's own (a key has no space, so this can't be a key). */
function columnOf(key: string) {
  return SUBMISSION_COLUMNS.includes(key) ? `${key} (Field)` : key;
}

/**
 * The rows a Submission's envelope writes. `approved_by` is the approver's
 * email, or "Auto-Send"; a test-send's rows say "[test]" before the filename.
 */
export function rowsOf(envelope: Envelope, approverEmail: string | null): Row[] {
  const submission = `${envelope.test ? "[test] " : ""}${envelope.submission.filename}`;
  // Vink's trailing columns come after the Fields, as on a new sheet.
  const approval: Row = {
    approved_at: envelope.approval.at,
    approved_by: envelope.approval.mode === "auto" ? "Auto-Send" : approverEmail,
    delivery_id: envelope.delivery_id,
  };
  // The data's keys are in the Form's order (lib/payload.ts), so the first array is the first List.
  const first = Object.keys(envelope.data).find((key) => Array.isArray(envelope.data[key]));
  const rowWith = (entry: Record<string, Cell> | null) => {
    const row: Row = { submission };
    for (const [key, value] of Object.entries(envelope.data)) {
      if (key === first) {
        for (const [sub, cell] of Object.entries(entry ?? {})) row[`${key}.${sub}`] = cell;
      } else if (Array.isArray(value)) {
        row[columnOf(key)] = value.length === 0 ? null : JSON.stringify(value);
      } else {
        row[columnOf(key)] = value;
      }
    }
    return { ...row, ...approval };
  };
  const entries = first === undefined ? [] : (envelope.data[first] as Array<Record<string, Cell>>);
  return entries.length === 0 ? [rowWith(null)] : entries.map(rowWith);
}

/** Vink's columns at the far right of a sheet; a new Field's column goes just before them. */
const TRAILING_COLUMNS = ["approved_at", "approved_by", "delivery_id"];

/** A column added to a sheet: `name` in row 1 at the 0-based `index`, the columns from there on shifting right. */
export type ColumnInsert = { index: number; name: string };

/**
 * Lines rows up under a sheet's header (row 1, as it is now, in whatever
 * order the sheet's owner left it): values go by column name, never by
 * position. A column the header lacks is inserted, in order: a Field's (and
 * `submission`'s) just before `approved_at` (or the first of Vink's trailing
 * columns there is, else on the right), one of Vink's trailing columns on
 * the right. Existing columns are never rewritten or reordered.
 */
export function sheetLayout(header: string[], rows: Row[]) {
  const columns = [...header];
  const inserts: ColumnInsert[] = [];
  for (const row of rows) {
    for (const name of Object.keys(row)) {
      if (columns.includes(name)) continue;
      const trailing = columns.findIndex((c) => TRAILING_COLUMNS.includes(c));
      const index = TRAILING_COLUMNS.includes(name) || trailing === -1 ? columns.length : trailing;
      columns.splice(index, 0, name);
      inserts.push({ index, name });
    }
  }
  return { inserts, values: rows.map((row) => columns.map((c) => row[c] ?? null)) };
}

/** `A`, …, `Z`, `AA`, … for a 0-based column index. */
export function columnLetter(index: number) {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

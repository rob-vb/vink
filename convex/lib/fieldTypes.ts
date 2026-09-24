// Type validation in code, after Fill: a value that doesn't fit its Field's
// type becomes `null` and is Needs Review (spec, Extraction pipeline).
import type { FilledValue, FlatField } from "./pipeline";

export type TypeCheck = { fits: true; value: FilledValue } | { fits: false };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isIsoDate(text: string) {
  const parts = text.match(ISO_DATE);
  if (parts === null) return false;
  const [year, month, day] = parts.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Whether a filled value fits its Field's type, and the value as the Payload holds it. */
export function fitType(field: FlatField, value: unknown): TypeCheck {
  if (value === null || value === undefined) return { fits: true, value: null };
  switch (field.type) {
    case "text":
      return typeof value === "string" || typeof value === "number"
        ? { fits: true, value: String(value) }
        : { fits: false };
    case "number": {
      const number =
        typeof value === "number"
          ? value
          : typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())
            ? Number(value)
            : NaN;
      return Number.isFinite(number) ? { fits: true, value: number } : { fits: false };
    }
    case "date":
      return typeof value === "string" && isIsoDate(value)
        ? { fits: true, value }
        : { fits: false };
    case "boolean":
      return typeof value === "boolean" ? { fits: true, value } : { fits: false };
    case "choice":
      return typeof value === "string" && field.options.some((o) => o.value === value)
        ? { fits: true, value }
        : { fits: false };
  }
}

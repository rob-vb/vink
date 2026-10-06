// Field keys are the names in the Payload. Shared by the Form editor (to
// derive a key as the Admin types a label) and the backend (to check one).

/**
 * Derives a snake_case key from a label, e.g. "VAT number" → "vat_number",
 * numbered on when the Form already uses it ("date" → "date_2").
 */
export function keyFromLabel(label: string, taken: readonly string[] = []) {
  const base = snakeCase(label);
  let key = base;
  for (let n = 2; taken.includes(key); n++) {
    key = `${base}_${n}`;
  }
  return key;
}

/** A key is snake_case: lowercase words of letters and digits, joined by single underscores, starting with a letter. */
export function isValidKey(key: string) {
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(key);
}

function snakeCase(label: string) {
  const words = label
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const key = words.map((word) => word.toLowerCase()).join("_");
  if (key === "") {
    return "field";
  }
  return /^[a-z]/.test(key) ? key : `field_${key}`;
}

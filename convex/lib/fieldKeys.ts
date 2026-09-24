// Field keys are the names in the Payload. Shared by the Form editor (to
// derive a key as the Admin types a label) and the backend (to check one).

/**
 * Derives a camelCase key from a label, e.g. "VAT number" → "vatNumber",
 * numbered on when the Form already uses it ("date" → "date2").
 */
export function keyFromLabel(label: string, taken: readonly string[] = []) {
  const base = camelCase(label);
  let key = base;
  for (let n = 2; taken.includes(key); n++) {
    key = `${base}${n}`;
  }
  return key;
}

/** A key is camelCase: a lowercase letter, then letters and digits. */
export function isValidKey(key: string) {
  return /^[a-z][A-Za-z0-9]*$/.test(key);
}

function camelCase(label: string) {
  const words = label
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const key = words
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("");
  if (key === "") {
    return "field";
  }
  return /^[a-z]/.test(key) ? key : `field${key[0].toUpperCase()}${key.slice(1)}`;
}

export const GAME_PATTERNS = {
  any: null,
  gundam: /\b[A-Z]{1,4}\d{2,3}-\d{3,4}\b/i,
  pokemon: /\b(?:[A-Z]{2,5}\s*)?\d{1,3}\s*\/\s*\d{1,3}\b/i,
  onepiece: /\bOP\d{2}-\d{3}\b/i,
  magic: /\b[A-Z0-9]{2,5}-\d{3}\b/i
};

export function normalizeCardNumber(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

export function detectCardNumber(text, game = "any") {
  const pattern = GAME_PATTERNS[game] || null;
  const generic = /\b(?:[A-Z]{1,5}\d{1,3}-\d{2,4}|[A-Z]{2,5}\s*\d{1,3}\s*\/\s*\d{1,3})\b/i;
  const match = String(text || "").match(pattern || generic);
  return match ? normalizeCardNumber(match[0]) : null;
}

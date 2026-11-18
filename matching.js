export const GAME_PATTERNS = {
  any: null,
  gundam: /\b[A-Z]{1,4}\d{2,3}-\d{3,4}\b/i,
  pokemon: /\b(?:[A-Z]{2,5}\s*)?\d{1,3}\s*\/\s*\d{1,3}\b/i,
  onepiece: /\bOP\d{2}-\d{3}\b/i,
  magic: /\b[A-Z0-9]{2,6}-\d{1,4}[A-Z]?\b/i
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

function plainText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value) {
  return plainText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(word => word && !["card", "cards", "tcg", "pokemon", "magic", "gathering"].includes(word));
}

function seriesText(product, body) {
  const series = [];
  const setRow = /<tr[^>]*>\s*<td[^>]*>\s*(?:set|series)\s*:?\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  const setListItem = /<(?:strong|b)[^>]*>\s*(?:set|series)\s*:?\s*<\/(?:strong|b)>\s*([\s\S]*?)(?:<\/li>|<br\s*\/?>)/gi;
  for (const match of String(product.body || product.description || "").matchAll(setRow)) series.push(plainText(match[1]));
  for (const match of String(product.body || product.description || "").matchAll(setListItem)) series.push(plainText(match[1]));
  const summary = String(product.body || product.description || "").match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const fromSeries = plainText(summary || "").match(/\bfrom\s+(.+?)(?:,\s*available\b|[.!]|$)/i);
  if (fromSeries) series.push(fromSeries[1]);
  return [...series, ...(product.tags || [])].join(" ");
}

function nameAndSeriesMatch(product, query, title, body) {
  const queryWords = words(query);
  const titleWords = new Set(words(title));
  const searchableWords = new Set([...titleWords, ...words(seriesText(product, body))]);
  return queryWords.length > 0
    && queryWords.some(word => titleWords.has(word))
    && queryWords.every(word => searchableWords.has(word));
}

function pokemonNumber(value) {
  const match = String(value).match(/\b0*(\d{1,3})\s*\/\s*0*(\d{1,3})\b/);
  return match ? `${Number(match[1])}/${Number(match[2])}` : null;
}

function magicReference(value) {
  const normalized = String(value || "").trim().toUpperCase();
  const match = normalized.match(/^([A-Z0-9]{2,6})[-\s]?(\d{1,4}[A-Z]?)$/);
  if (match) return { set: match[1], number: match[2] };
  if (/^\d{1,4}[A-Z]?$/i.test(normalized)) return { set: null, number: normalized };
  return null;
}

function hasMagicNumber(text, number) {
  const numberPattern = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:#(?:\\s*:)?\\s*|number\\s*:)\\s*${numberPattern}(?=$|[^A-Z0-9/])`, "i").test(text)
    || new RegExp(`\\(\\s*${numberPattern}\\s*\\)`, "i").test(text);
}

export function matchesStoreCard(product, query, game = "any") {
  const title = plainText(product.title);
  const body = plainText(product.body || product.description);
  const metadata = `${title} ${plainText(product.handle)} ${body} ${plainText((product.tags || []).join(" "))}`;

  if (game === "pokemon") {
    const target = pokemonNumber(query);
    if (target) return pokemonNumber(metadata) === target;
    return nameAndSeriesMatch(product, query, title, body);
  }

  if (game === "magic") {
    const reference = magicReference(query);
    if (reference) {
      const numberMatches = hasMagicNumber(metadata, reference.number);
      if (!reference.set) return numberMatches;
      const setAliases = { FIN: "FINAL FANTASY" };
      const setMatches = new RegExp(`\\b${reference.set}\\b`, "i").test(metadata)
        || (setAliases[reference.set] && metadata.toUpperCase().includes(setAliases[reference.set]));
      return numberMatches || Boolean(setMatches);
    }
    return nameAndSeriesMatch(product, query, title, body);
  }

  const normalizedQuery = normalizeCardNumber(query);
  const escaped = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Z0-9])${escaped}($|[^A-Z0-9])`, "i").test(metadata);
}

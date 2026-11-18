import { matchesStoreCard } from "../matching.js";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractRarity(detail) {
  const rarities = [
    "Special Illustration Rare", "Illustration Rare", "Hyper Rare", "Double Rare",
    "Secret Rare", "Ultra Rare", "Super Rare", "Mythic Rare", "Alternate Art",
    "Promo", "Uncommon", "Common", "Rare", "Mythic", "Legendary"
  ];
  const tags = (detail.tags || []).join(" ");
  const tagRarity = rarities.find(rarity => new RegExp(`(?:^|[^a-z])${escapeRegExp(rarity)}(?:$|[^a-z])`, "i").test(tags));
  if (tagRarity) return tagRarity;
  const titleRarity = rarities.find(rarity => new RegExp(`(?:^|[^a-z])${escapeRegExp(rarity)}(?:$|[^a-z])`, "i").test(detail.title || ""));
  if (titleRarity) return titleRarity;
  const explicit = String(detail.description || "").match(/rarity\s*[:\-]\s*(common|uncommon|rare|double rare|super rare|ultra rare|secret rare|illustration rare|special illustration rare|hyper rare|mythic rare|mythic|legendary|promo)/i);
  return explicit ? explicit[1].replace(/\b\w/g, char => char.toUpperCase()) : null;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/json" },
    credentials: "omit",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function getStoreCurrency(origin) {
  try {
    const cart = await fetchJson(`${origin}/cart.js`);
    return cart.currency || null;
  } catch { return null; }
}

function getImageUrls(product, detail) {
  const values = [detail.featured_image, ...(detail.images || []), product.image];
  return [...new Set(values
    .map(value => typeof value === "string" ? value : value?.url)
    .filter(Boolean)
    .map(url => url.startsWith("//") ? `https:${url}` : url))];
}

export async function searchShopifyStore(store, cardNumber, game = "any") {
  const searchTerms = [cardNumber];
  if (game === "magic") {
    const reference = cardNumber.match(/^([A-Z0-9]{2,6})[-\s]?(\d{1,4}[A-Z]?)$/i);
    if (reference) searchTerms.push(reference[2]);
  }
  if (game === "pokemon") {
    const reference = cardNumber.match(/^0*(\d{1,3})\s*\/\s*0*(\d{1,3})$/i);
    if (reference) searchTerms.push(`${Number(reference[1])}/${Number(reference[2])}`);
  }
  if (game === "magic" || game === "pokemon") {
    const words = cardNumber.trim().split(/\s+/);
    for (let length = words.length - 1; length >= 2; length--) {
      searchTerms.push(words.slice(0, length).join(" "));
    }
  }
  const candidateMap = new Map();
  for (const searchTerm of new Set(searchTerms)) {
    const searchUrl = new URL("/search/suggest.json", store.origin);
    searchUrl.searchParams.set("q", searchTerm);
    searchUrl.searchParams.set("resources[type]", "product");
    searchUrl.searchParams.set("resources[limit]", "10");
    searchUrl.searchParams.set("resources[options][unavailable_products]", "show");
    const data = await fetchJson(searchUrl.toString());
    const candidates = data?.resources?.results?.products || [];
    candidates
      .filter(product => matchesStoreCard(product, cardNumber, game))
      .forEach(product => candidateMap.set(product.handle || product.id, product));
    if (candidateMap.size) break;
  }
  const candidates = [...candidateMap.values()];
  const currency = await getStoreCurrency(store.origin);
  const details = await Promise.all(candidates.map(async product => {
    try {
      const detailUrl = new URL(`/products/${encodeURIComponent(product.handle)}.js`, store.origin);
      const detail = await fetchJson(detailUrl.toString());
      if (!matchesStoreCard({
        ...detail,
        body: detail.description
      }, cardNumber, game)) return null;
      const images = getImageUrls(product, detail);
      return {
        storeId: store.id,
        storeName: store.name,
        title: detail.title,
        url: new URL(`/products/${encodeURIComponent(detail.handle)}`, store.origin).toString(),
        image: images[0] || null,
        images,
        currency,
        cardNumber,
        rarity: extractRarity(detail),
        variants: (detail.variants || []).map(variant => ({
          id: String(variant.id),
          title: variant.title || "Default",
          sku: variant.sku || null,
          price: Number(variant.price) / 100,
          compareAtPrice: variant.compare_at_price == null ? null : Number(variant.compare_at_price) / 100,
          available: Boolean(variant.available)
        }))
      };
    } catch (error) {
      const rawImage = typeof product.image === "string" ? product.image : product.image?.url || null;
      const image = rawImage?.startsWith("//") ? `https:${rawImage}` : rawImage;
      return {
        storeId: store.id,
        storeName: store.name,
        title: product.title,
        url: product.url ? new URL(product.url, store.origin).toString() : store.origin,
        image,
        images: image ? [image] : [],
        currency,
        cardNumber,
        rarity: null,
        variants: [],
        error: `Could not load product details: ${error.message}`
      };
    }
  }));
  return details.filter(Boolean);
}

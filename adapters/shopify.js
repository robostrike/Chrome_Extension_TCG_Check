function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasExactCardNumber(text, cardNumber) {
  if (!text) return false;
  const escaped = escapeRegExp(cardNumber);
  const pattern = new RegExp(`(^|[^A-Z0-9])${escaped}($|[^A-Z0-9])`, "i");
  return pattern.test(text);
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

export async function searchShopifyStore(store, cardNumber) {
  const searchUrl = new URL("/search/suggest.json", store.origin);
  searchUrl.searchParams.set("q", cardNumber);
  searchUrl.searchParams.set("resources[type]", "product");
  searchUrl.searchParams.set("resources[limit]", "10");
  searchUrl.searchParams.set("resources[options][unavailable_products]", "show");
  const data = await fetchJson(searchUrl.toString());
  const candidates = data?.resources?.results?.products || [];
  const currency = await getStoreCurrency(store.origin);
  const details = await Promise.all(candidates.map(async product => {
    try {
      const detailUrl = new URL(`/products/${encodeURIComponent(product.handle)}.js`, store.origin);
      const detail = await fetchJson(detailUrl.toString());
      const productText = [detail.title, detail.handle, detail.description, ...(detail.tags || [])].filter(Boolean).join(" ");
      if (!hasExactCardNumber(productText, cardNumber)) return null;
      return {
        storeId: store.id,
        storeName: store.name,
        title: detail.title,
        url: new URL(`/products/${encodeURIComponent(detail.handle)}`, store.origin).toString(),
        image: detail.featured_image || detail.images?.[0] || null,
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
      return {
        storeId: store.id,
        storeName: store.name,
        title: product.title,
        url: product.url ? new URL(product.url, store.origin).toString() : store.origin,
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

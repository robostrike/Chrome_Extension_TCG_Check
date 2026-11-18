import { STORES } from "./stores.js";
import { searchShopifyStore } from "./adapters/shopify.js";
import { normalizeCardNumber } from "./matching.js";

const DEFAULT_STORE_IDS = STORES.filter(store => store.enabled).map(store => store.id);
chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel) {
    try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); }
    catch (error) { console.warn("Side panel setup failed:", error); }
  }
  const existing = await chrome.storage.local.get(["settings", "recentSearches"]);
  const settings = { ...(existing.settings || {}) };
  if (!Array.isArray(settings.enabledStoreIds)) settings.enabledStoreIds = [...DEFAULT_STORE_IDS];
  else settings.enabledStoreIds = [...new Set([...settings.enabledStoreIds, ...DEFAULT_STORE_IDS])];
  await chrome.storage.local.set({ settings, recentSearches: existing.recentSearches || [] });
});
if (chrome.sidePanel) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function getStores() {
  const saved = await chrome.storage.local.get({ settings: {} });
  const customStores = Array.isArray(saved.settings.customStores) ? saved.settings.customStores : [];
  return [...STORES, ...customStores];
}
async function probeStore(store) {
  if (store.platform !== "shopify") return { ok: false, error: "Only Shopify storefront search is supported." };
  try {
    const url = new URL("/search/suggest.json", store.origin);
    url.searchParams.set("q", "tcg");
    url.searchParams.set("resources[type]", "product");
    url.searchParams.set("resources[limit]", "1");
    const response = await fetch(url, { headers: { Accept: "application/json" }, credentials: "omit", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { ok: false, error: `Store returned HTTP ${response.status}.` };
    const data = await response.json();
    if (!data?.resources?.results || !Array.isArray(data.resources.results.products)) {
      return { ok: false, error: "Store is reachable, but Shopify product search is unavailable." };
    }
    return { ok: true, error: "Shopify product search is reachable." };
  } catch (error) {
    return { ok: false, error: error.name === "TimeoutError" ? "Connection timed out." : (error.message || "Connection failed.") };
  }
}
async function searchAllStores(rawReference, game = "any") {
  const cardNumber = normalizeCardNumber(rawReference);
  if (!cardNumber || cardNumber.length > 100) throw new Error("Enter a search term (maximum 100 characters).");
  const saved = await chrome.storage.local.get({ settings: {} });
  const enabledIds = Array.isArray(saved.settings.enabledStoreIds)
    ? new Set(saved.settings.enabledStoreIds)
    : new Set(DEFAULT_STORE_IDS);
  const stores = await getStores();
  const activeStores = stores.filter(store => store.enabled !== false && enabledIds.has(store.id));
  if (!activeStores.length) throw new Error("Enable at least one supported store before searching.");
  const outcomes = await Promise.all(activeStores.map(async store => {
    try {
      const permission = await chrome.permissions.contains({ origins: [`${new URL(store.origin).origin}/*`] });
      if (!permission) return { storeId: store.id, storeName: store.name, ok: false, products: [], error: "Host permission has not been granted." };
      if (store.platform === "shopify") {
        const products = await searchShopifyStore(store, cardNumber, game);
        return { storeId: store.id, storeName: store.name, ok: true, products };
      }
      return { storeId: store.id, storeName: store.name, ok: false, products: [], error: "This store adapter is not supported." };
    } catch (error) {
      return { storeId: store.id, storeName: store.name, ok: false, products: [], error: error.message };
    }
  }));
  const products = outcomes.flatMap(outcome => outcome.products || []);
  const variants = products.flatMap(product => (product.variants || [])
    .filter(variant => Number.isFinite(variant.price))
    .map(variant => ({ ...variant, storeName: product.storeName, storeId: product.storeId,
      productTitle: product.title, productUrl: product.url,
      currency: product.currency || "Currency not reported", available: variant.available })));
  variants.sort((a, b) => a.available !== b.available ? (a.available ? -1 : 1) : a.price - b.price);
  const recent = await chrome.storage.local.get({ recentSearches: [] });
  const nextRecent = [{ cardNumber, searchedAt: new Date().toISOString() },
    ...recent.recentSearches.filter(item => item.cardNumber !== cardNumber)].slice(0, 10);
  await chrome.storage.local.set({ recentSearches: nextRecent });
  return { cardNumber, searchedAt: new Date().toISOString(), stores: outcomes, products, variants };
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SEARCH_CARD") {
    searchAllStores(message.cardNumber, message.game).then(data => sendResponse({ ok: true, data })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "GET_SETTINGS") {
    Promise.all([chrome.storage.local.get({ settings: {} }), chrome.storage.local.get({ recentSearches: [] })])
      .then(([saved, recent]) => {
        const settings = { ...saved.settings };
        if (!Array.isArray(settings.enabledStoreIds)) settings.enabledStoreIds = [...DEFAULT_STORE_IDS];
        else settings.enabledStoreIds = [...new Set([...settings.enabledStoreIds, ...DEFAULT_STORE_IDS])];
        if (!Array.isArray(settings.customStores)) settings.customStores = [];
        sendResponse({ ok: true, settings, recentSearches: recent.recentSearches });
      }).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "SAVE_SETTINGS") {
    chrome.storage.local.get({ settings: {} }).then(saved =>
      chrome.storage.local.set({ settings: { ...saved.settings, ...message.settings } })
    ).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "TEST_STORE") {
    probeStore(message.store).then(result => sendResponse(result)).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "GET_STORES") {
    getStores().then(stores => sendResponse({ ok: true, stores })).catch(() => sendResponse({ ok: false, stores: STORES }));
    return true;
  }
});

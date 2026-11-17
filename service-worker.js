import { STORES } from "./stores.js";
import { searchShopifyStore } from "./adapters/shopify.js";
import { normalizeCardNumber } from "./matching.js";

chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel) {
    try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); }
    catch (error) { console.warn("Side panel setup failed:", error); }
  }
  const existing = await chrome.storage.local.get(["settings", "recentSearches"]);
  if (!existing.settings) await chrome.storage.local.set({
    settings: { autoCompare: true, enabledGames: ["any"], enabledStoreIds: STORES.filter(store => store.enabled).map(store => store.id) }, recentSearches: []
  });
});
if (chrome.sidePanel) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function searchAllStores(rawReference) {
  const cardNumber = normalizeCardNumber(rawReference);
  if (!cardNumber || cardNumber.length > 100) throw new Error("Enter a search term (maximum 100 characters).");
  const saved = await chrome.storage.local.get({ settings: {} });
  const enabledIds = Array.isArray(saved.settings.enabledStoreIds)
    ? new Set(saved.settings.enabledStoreIds)
    : new Set(STORES.filter(store => store.enabled).map(store => store.id));
  const activeStores = STORES.filter(store => store.enabled && enabledIds.has(store.id));
  if (!activeStores.length) throw new Error("Enable at least one supported store before searching.");
  const outcomes = await Promise.all(activeStores.map(async store => {
    try {
      if (store.platform === "shopify") {
        const products = await searchShopifyStore(store, cardNumber);
        return { storeId: store.id, storeName: store.name, ok: true, products };
      }
      return { storeId: store.id, storeName: store.name, ok: false, products: [], error: "This store adapter is not implemented yet." };
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
    searchAllStores(message.cardNumber)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "GET_SETTINGS") {
    Promise.all([chrome.storage.local.get({ settings: { autoCompare: true } }),
      chrome.storage.local.get({ recentSearches: [] })])
      .then(([saved, recent]) => {
        const current = saved.settings || {};
        const settings = { ...current };
        if (!Array.isArray(settings.enabledStoreIds)) settings.enabledStoreIds = STORES.filter(store => store.enabled).map(store => store.id);
        sendResponse({ ok: true, settings, recentSearches: recent.recentSearches });
      });
    return true;
  }
  if (message?.type === "SAVE_SETTINGS") {
    chrome.storage.local.get({ settings: {} }).then(saved =>
      chrome.storage.local.set({ settings: { ...saved.settings, ...message.settings } })
    ).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

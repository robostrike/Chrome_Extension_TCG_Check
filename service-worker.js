import { STORES } from "./stores.js";
import { searchShopifyStore } from "./adapters/shopify.js";
import { normalizeCardNumber } from "./matching.js";

chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (error) {
      console.warn("Side panel setup failed:", error);
    }
  }

  const existing = await chrome.storage.local.get(["settings", "recentSearches"]);
  if (!existing.settings) {
    await chrome.storage.local.set({
      settings: { autoCompare: true, enabledGames: ["any"] },
      recentSearches: []
    });
  }
});

if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

async function searchAllStores(rawCardNumber) {
  const cardNumber = normalizeCardNumber(rawCardNumber);
  if (!cardNumber || cardNumber.length > 30) {
    throw new Error("Enter a valid card number (maximum 30 characters).");
  }

  const activeStores = STORES.filter(store => store.enabled);
  const outcomes = await Promise.all(activeStores.map(async store => {
    try {
      if (store.platform === "shopify") {
        const products = await searchShopifyStore(store, cardNumber);
        return { storeId: store.id, storeName: store.name, ok: true, products };
      }
      return {
        storeId: store.id,
        storeName: store.name,
        ok: false,
        products: [],
        error: "This store adapter is not implemented yet."
      };
    } catch (error) {
      return {
        storeId: store.id,
        storeName: store.name,
        ok: false,
        products: [],
        error: error.message
      };
    }
  }));

  const results = outcomes.flatMap(outcome => outcome.products || []);
  const comparable = results.flatMap(product =>
    (product.variants || [])
      .filter(variant => Number.isFinite(variant.price))
      .map(variant => ({
        ...variant,
        storeName: product.storeName,
        storeId: product.storeId,
        productTitle: product.title,
        productUrl: product.url,
        currency: product.currency || "Currency not reported",
        available: variant.available
      }))
  );

  comparable.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.price - b.price;
  });

  const recent = await chrome.storage.local.get({ recentSearches: [] });
  const nextRecent = [
    { cardNumber, searchedAt: new Date().toISOString() },
    ...recent.recentSearches.filter(item => item.cardNumber !== cardNumber)
  ].slice(0, 10);

  await chrome.storage.local.set({ recentSearches: nextRecent });

  return {
    cardNumber,
    searchedAt: new Date().toISOString(),
    stores: outcomes,
    products: results,
    variants: comparable
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SEARCH_CARD") {
    searchAllStores(message.cardNumber)
      .then(data => sendResponse({ ok: true, data }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_SETTINGS") {
    Promise.all([
      chrome.storage.local.get({ settings: { autoCompare: true } }),
      chrome.storage.local.get({ recentSearches: [] })
    ]).then(([settings, recent]) => {
      sendResponse({ ok: true, settings: settings.settings, recentSearches: recent.recentSearches });
    });
    return true;
  }

  if (message?.type === "SAVE_SETTINGS") {
    chrome.storage.local.set({ settings: message.settings })
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

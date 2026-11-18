import { normalizeCardNumber } from "./matching.js";
import { STORES } from "./stores.js";
const $ = selector => document.querySelector(selector);
const form = $("#search-form"), input = $("#card-number"), game = $("#game"), singleButton = $("#search-button"), statusBox = $("#status"), resultsBox = $("#results");
const multiInput = $("#multi-list"), multiButton = $("#multi-search-button"), multiStatus = $("#multi-status"), multiResults = $("#multi-results"), defaultQty = $("#default-qty");
const detectStatus = $("#detect-status"), detectButton = $("#detect-button"), storeList = $("#store-list"), storeCount = $("#store-count"), storeSettingsStatus = $("#store-settings-status");
const addStoreForm = $("#add-store-form"), addStoreButton = $("#add-store-button");
let detectedCard = "";
let stores = [...STORES];
let settings = { enabledStoreIds: STORES.filter(store => store.enabled).map(store => store.id), customStores: [] };
const connectionStates = new Map();
function el(tag, className = "", text = "") { const node = document.createElement(tag); if (className) node.className = className; if (text !== "") node.textContent = text; return node; }
function money(value, currency) { if (!Number.isFinite(Number(value))) return "Price unavailable"; if (!currency || currency === "Currency not reported") return Number(value).toFixed(2); try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); } catch { return `${currency} ${Number(value).toFixed(2)}`; } }
function lowestAvailablePrice(product) { const prices = (product.variants || []).filter(v => v.available && Number.isFinite(Number(v.price))).map(v => Number(v.price)); return prices.length ? Math.min(...prices) : Infinity; }
function setConnection(storeId, ok, message) { connectionStates.set(storeId, { ok, message }); const row = storeList.querySelector(`[data-store-id="${CSS.escape(storeId)}"]`); if (!row) return; const status = row.querySelector(".store-connection"); status.className = `store-connection ${ok ? "connected" : "disconnected"}`; status.textContent = ok ? "Connected" : "Unavailable"; status.title = message || ""; }
function renderProducts(container, products, sortBy) {
  container.replaceChildren(); const sorted = [...products];
  if (sortBy === "rarity") sorted.sort((a, b) => (a.rarity || "Unknown").localeCompare(b.rarity || "Unknown") || a.title.localeCompare(b.title));
  else if (sortBy === "price-asc") sorted.sort((a, b) => lowestAvailablePrice(a) - lowestAvailablePrice(b));
  else if (sortBy === "price-desc") sorted.sort((a, b) => lowestAvailablePrice(b) - lowestAvailablePrice(a));
  let currentRarity = null;
  sorted.forEach(product => {
    const rarity = product.rarity || "Unknown rarity"; if (sortBy === "rarity" && rarity !== currentRarity) { container.append(el("h3", "rarity-heading", rarity)); currentRarity = rarity; }
    const card = el("a", "product-card"); card.href = product.url; card.target = "_blank"; card.rel = "noopener noreferrer"; card.setAttribute("aria-label", `Open ${product.storeName}: ${product.title} at retailer`);
    const image = document.createElement("img"); image.className = "product-image"; image.alt = ""; image.loading = "lazy"; image.hidden = !product.image; if (product.image) image.src = product.image; image.addEventListener("error", () => { image.hidden = true; });
    const info = el("div", "product-info"), top = el("div", "product-top"); top.append(el("div", "product-title", `${product.storeName}: ${product.title}`)); info.append(top);
    if (product.rarity) info.append(el("span", "rarity-label", product.rarity));
    if (product.error) info.append(el("p", "hint", product.error)); else (product.variants || []).slice(0, 3).forEach(variant => { const row = el("div", variant.available ? "variant-row" : "variant-row sold-out"); row.append(el("span", "availability", `${variant.title || "Default"} · ${variant.available ? "In stock" : "Sold out"}`), el("strong", variant.available ? "price in-stock-price" : "price sold-out-price", money(variant.price, product.currency))); info.append(row); });
    card.append(image, info); container.append(card);
  });
}
function renderCardOverview(cardNumber, product) {
  const overview = el("article", "card-overview"), image = document.createElement("img"); image.className = "overview-image"; image.alt = product.image ? `Product image for ${product.title}` : ""; image.loading = "lazy"; image.hidden = !product.image; if (product.image) image.src = product.image; image.addEventListener("error", () => { image.hidden = true; });
  const details = el("div", "overview-details"); details.append(el("div", "overview-label", "Closest retailer match"), el("h2", "overview-title", product.title || cardNumber), el("p", "overview-meta", `${product.storeName || "Supported store"}${product.rarity ? ` · ${product.rarity}` : ""}`));
  const available = (product.variants || []).find(v => v.available); if (available) details.append(el("p", "overview-meta", `In stock from ${money(available.price, product.currency)}`));
  details.append(el("p", "overview-note", `Search reference: ${cardNumber}. This is a retailer match, not a verified card-database result.`)); overview.append(image, details); return overview;
}
function renderResults(container, data) {
  container.replaceChildren();
  (data.stores || []).forEach(result => setConnection(result.storeId, result.ok, result.error || "Shopify search responded."));
  if (!data.products?.length) { container.append(el("p", "empty", "No matching retailer listings. Check store connection status or try a different name, set number, or product code.")); return; }
  container.append(renderCardOverview(data.cardNumber, data.products[0]));
  const cheapest = (data.variants || []).find(v => v.available);
  if (cheapest) { const best = el("a", "best-price"); best.href = cheapest.productUrl; best.target = "_blank"; best.rel = "noopener noreferrer"; best.setAttribute("aria-label", `Open ${cheapest.storeName} listing with the lowest in-stock price, ${money(cheapest.price, cheapest.currency)}`); best.append(el("strong", "best-price-title", "Lowest in-stock")); const details = el("span", "best-price-details"); details.append(el("strong", "in-stock-price", money(cheapest.price, cheapest.currency)), el("span", "best-price-store", `at ${cheapest.storeName} · View listing ↗`)); best.append(details); container.append(best); }
  const sortRow = el("div", "sort-row"), sortLabel = el("label", "", "Sort/group:"), sortSelect = el("select", "sort-select"); sortSelect.setAttribute("aria-label", "Sort and group listings");
  [["default", "Default"], ["rarity", "Group by rarity"], ["price-asc", "Cheapest first"], ["price-desc", "Most expensive first"]].forEach(([value, label]) => { const option = el("option", "", label); option.value = value; sortSelect.append(option); });
  sortRow.append(sortLabel, sortSelect); container.append(sortRow); const listings = el("div", "listing-results"); container.append(listings); renderProducts(listings, data.products, sortSelect.value); sortSelect.addEventListener("change", () => renderProducts(listings, data.products, sortSelect.value));
}
async function searchCard(raw, status, container) {
  const term = String(raw || "").trim(); if (!term) throw new Error("Enter a card name, number, or product code.");
  if (!settings.enabledStoreIds.length) throw new Error("Enable at least one store in the Stores list before searching.");
  status.textContent = `Searching ${settings.enabledStoreIds.length} enabled store(s) for ${term}…`;
  const response = await chrome.runtime.sendMessage({ type: "SEARCH_CARD", cardNumber: term, game: game.value }); if (!response?.ok) throw new Error(response?.error || "Search failed.");
  status.textContent = `Results for ${response.data.cardNumber}`; renderResults(container, response.data); return response.data;
}
form.addEventListener("submit", async event => { event.preventDefault(); singleButton.disabled = true; singleButton.textContent = "Searching…"; resultsBox.replaceChildren(); try { await searchCard(input.value, statusBox, resultsBox); } catch (error) { statusBox.textContent = `Error: ${error.message}`; } finally { singleButton.disabled = false; singleButton.textContent = "Search"; } });
function parseReferences(text, fallback) { return text.split(/\n|,/).map(line => line.trim()).filter(Boolean).map(line => { const quantity = line.match(/\s+(?:x|\*)\s*(\d+)\s*$/i); const reference = quantity ? line.slice(0, quantity.index).trim() : line; return { reference, quantity: Math.max(1, Number(quantity?.[1] || fallback) || 1) }; }).filter(entry => entry.reference); }
multiButton.addEventListener("click", async () => {
  const entries = parseReferences(multiInput.value, defaultQty.value); if (!entries.length) { multiStatus.textContent = "Add one or more card references first."; multiResults.replaceChildren(); return; }
  multiButton.disabled = true; multiButton.textContent = "Searching…"; multiStatus.textContent = `Searching ${entries.length} reference(s)…`; multiResults.replaceChildren();
  try { const results = await Promise.all(entries.map(async entry => { const section = el("section", "multi-card"); section.append(el("h2", "", `${entry.reference} · Qty ${entry.quantity}`)); const result = el("div", "results"); section.append(result); try { const data = await searchCard(entry.reference, { set textContent(_value) {} }, result); return { section, data, ok: true }; } catch (error) { result.append(el("p", "empty", error.message)); return { section, ok: false }; } })); results.forEach(r => multiResults.append(r.section)); const found = results.filter(r => r.ok && r.data.products.length).length; multiStatus.textContent = `Finished: listings found for ${found} of ${entries.length} card reference(s).`; }
  finally { multiButton.disabled = false; multiButton.textContent = "Search all"; }
});
function renderStoreSettings() {
  storeList.replaceChildren(); const enabled = new Set(settings.enabledStoreIds);
  stores.forEach(store => {
    const row = el("div", "store-option"); row.dataset.storeId = store.id;
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = enabled.has(store.id); checkbox.setAttribute("aria-label", `Include ${store.name} in searches`);
    checkbox.addEventListener("change", async () => { const selected = new Set(settings.enabledStoreIds); checkbox.checked ? selected.add(store.id) : selected.delete(store.id); settings.enabledStoreIds = [...selected]; updateStoreCount(); await saveSettings({ enabledStoreIds: settings.enabledStoreIds }); });
    const name = el("span", "store-option-name", store.name), host = el("span", "store-option-host", new URL(store.origin).hostname);
    const state = connectionStates.get(store.id); const status = el("span", `store-connection ${state ? state.ok ? "connected" : "disconnected" : "unchecked"}`, state ? state.ok ? "Connected" : "Unavailable" : "Not checked"); if (state) status.title = state.message;
    const test = el("button", "store-test", "Check"); test.type = "button"; test.addEventListener("click", () => testStore(store, test));
    row.append(checkbox, name, host, status, test);
    if (store.custom) { const remove = el("button", "store-remove", "Remove"); remove.type = "button"; remove.addEventListener("click", () => removeStore(store)); row.append(remove); }
    storeList.append(row);
  }); updateStoreCount();
}
function updateStoreCount() { storeCount.textContent = `${settings.enabledStoreIds.length} of ${stores.length} enabled`; }
async function saveSettings(patch) { storeSettingsStatus.textContent = "Saving…"; const response = await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: patch }); storeSettingsStatus.textContent = response?.ok ? "Saved." : "Could not save settings."; }
async function testStore(store, button) { button.disabled = true; button.textContent = "Checking…"; const result = await chrome.runtime.sendMessage({ type: "TEST_STORE", store }); setConnection(store.id, Boolean(result?.ok), result?.error); button.disabled = false; button.textContent = "Check"; }
async function loadStores() {
  const [settingsResponse, storesResponse] = await Promise.all([chrome.runtime.sendMessage({ type: "GET_SETTINGS" }), chrome.runtime.sendMessage({ type: "GET_STORES" })]);
  if (settingsResponse?.ok) settings = { ...settings, ...settingsResponse.settings };
  if (!Array.isArray(settings.enabledStoreIds)) settings.enabledStoreIds = STORES.filter(s => s.enabled).map(s => s.id);
  stores = (storesResponse?.stores || STORES).map(store => ({ ...store, custom: !STORES.some(s => s.id === store.id) }));
  renderStoreSettings();
}
function cleanOrigin(value) { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Enter only an HTTPS store homepage, such as https://example.com"); return url.origin; }
addStoreForm.addEventListener("submit", async event => {
  event.preventDefault(); addStoreButton.disabled = true;
  try {
    const name = $("#new-store-name").value.trim(); const origin = cleanOrigin($("#new-store-url").value.trim()); if (!name) throw new Error("Enter a store name.");
    if (stores.some(store => store.origin.toLowerCase() === origin.toLowerCase())) throw new Error("That store is already in your list.");
    storeSettingsStatus.textContent = "Requesting permission for this store…";
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] }); if (!granted) throw new Error("Permission was not granted; the store was not added.");
    const store = { id: `custom-${crypto.randomUUID()}`, name, origin, platform: "shopify", enabled: true, custom: true };
    const customStores = [...(settings.customStores || []), store]; const enabledStoreIds = [...new Set([...settings.enabledStoreIds, store.id])];
    settings = { ...settings, customStores, enabledStoreIds }; stores.push(store); await saveSettings({ customStores, enabledStoreIds }); addStoreForm.reset(); renderStoreSettings();
    const rowButton = storeList.querySelector(`[data-store-id="${CSS.escape(store.id)}"] .store-test`); await testStore(store, rowButton);
  } catch (error) { storeSettingsStatus.textContent = error.message || "Could not add store."; }
  finally { addStoreButton.disabled = false; }
});
async function removeStore(store) {
  settings.customStores = (settings.customStores || []).filter(item => item.id !== store.id); settings.enabledStoreIds = settings.enabledStoreIds.filter(id => id !== store.id); stores = stores.filter(item => item.id !== store.id); connectionStates.delete(store.id);
  await saveSettings({ customStores: settings.customStores, enabledStoreIds: settings.enabledStoreIds }); renderStoreSettings();
  try { await chrome.permissions.remove({ origins: [`${new URL(store.origin).origin}/*`] }); } catch { /* Permission may already be absent. */ }
}
async function checkActivePage(andSearch = false) {
  detectStatus.textContent = "Checking the active tab…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id) throw new Error("No active browser tab was found."); let card = "";
    try { const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_DETECTED_CARD" }); if (response?.ok) card = response.cardNumber || ""; } catch { /* No content script on this tab. */ }
    if (!card) { const match = `${tab.title || ""} ${tab.url || ""}`.match(/\b[A-Z]{1,5}\d{1,3}-\d{2,4}\b/i); if (match) card = match[0].toUpperCase(); }
    if (!card) { detectStatus.textContent = "No card number detected. Open a supported product page or enter a card manually."; return; }
    detectedCard = normalizeCardNumber(card); detectStatus.textContent = `Detected ${detectedCard}${andSearch ? " — searching stores now…" : "."}`;
    if (andSearch) { activatePanel("panel-single"); input.value = detectedCard; form.requestSubmit(); }
  } catch (error) { detectStatus.textContent = error.message; }
}
function activatePanel(panelId) { document.querySelectorAll(".tab").forEach(tab => { const selected = tab.dataset.panel === panelId; tab.classList.toggle("active", selected); tab.setAttribute("aria-selected", String(selected)); }); document.querySelectorAll(".tab-panel").forEach(panel => { panel.hidden = panel.id !== panelId; }); detectButton.setAttribute("aria-pressed", String(panelId === "panel-detect")); }
detectButton.addEventListener("click", () => { activatePanel("panel-detect"); checkActivePage(true); });
$("#detect-refresh").addEventListener("click", () => checkActivePage(true));
document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => activatePanel(tab.dataset.panel)));
chrome.tabs.onActivated?.addListener(() => { if (!$("#panel-detect").hidden) checkActivePage(false); });
loadStores().catch(() => { renderStoreSettings(); storeSettingsStatus.textContent = "Could not load saved store selection."; });

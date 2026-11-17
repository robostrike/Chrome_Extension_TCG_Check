import { normalizeCardNumber } from "./matching.js";

const $ = selector => document.querySelector(selector);
const form = $("#search-form");
const input = $("#card-number");
const game = $("#game");
const singleButton = $("#search-button");
const statusBox = $("#status");
const resultsBox = $("#results");
const multiInput = $("#multi-list");
const multiButton = $("#multi-search-button");
const multiStatus = $("#multi-status");
const multiResults = $("#multi-results");
const defaultQty = $("#default-qty");
const detectStatus = $("#detect-status");
const detectSearch = $("#detect-search");
let detectedCard = "";

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}
function money(value, currency) {
  if (!Number.isFinite(Number(value))) return "Price unavailable";
  if (!currency || currency === "Currency not reported") return Number(value).toFixed(2);
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); }
  catch { return `${currency} ${Number(value).toFixed(2)}`; }
}
function lowestAvailablePrice(product) {
  const prices = (product.variants || []).filter(variant => variant.available && Number.isFinite(Number(variant.price))).map(variant => Number(variant.price));
  return prices.length ? Math.min(...prices) : Infinity;
}
function retailerLink(variant) {
  const link = el("a", "retailer-link", variant.storeName);
  link.href = variant.productUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}
function renderProducts(container, products, sortBy) {
  container.replaceChildren();
  const sorted = [...products];
  if (sortBy === "rarity") sorted.sort((a, b) => (a.rarity || "Unknown").localeCompare(b.rarity || "Unknown") || a.title.localeCompare(b.title));
  else if (sortBy === "price-asc") sorted.sort((a, b) => lowestAvailablePrice(a) - lowestAvailablePrice(b));
  else if (sortBy === "price-desc") sorted.sort((a, b) => lowestAvailablePrice(b) - lowestAvailablePrice(a));
  let currentRarity = null;
  sorted.forEach(product => {
    const rarity = product.rarity || "Unknown rarity";
    if (sortBy === "rarity" && rarity !== currentRarity) {
      container.append(el("h3", "rarity-heading", rarity));
      currentRarity = rarity;
    }
    const card = el("a", "product-card");
    card.href = product.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.setAttribute("aria-label", `Open ${product.storeName}: ${product.title} at retailer`);
    const image = document.createElement("img");
    image.className = "product-image";
    image.alt = "";
    image.loading = "lazy";
    image.hidden = !product.image;
    if (product.image) image.src = product.image;
    image.addEventListener("error", () => { image.hidden = true; });
    const info = el("div", "product-info");
    const top = el("div", "product-top");
    top.append(el("div", "product-title", `${product.storeName}: ${product.title}`));
    info.append(top);
    if (product.rarity) info.append(el("span", "rarity-label", product.rarity));
    if (product.error) info.append(el("p", "hint", product.error));
    else (product.variants || []).slice(0, 3).forEach(variant => {
      const row = el("div", "variant-row");
      row.append(el("span", "availability", `${variant.title || "Default"} · ${variant.available ? "In stock" : "Sold out"}`));
      row.append(el("strong", variant.available ? "price in-stock-price" : "price", money(variant.price, product.currency)));
      info.append(row);
    });
    card.append(image, info);
    container.append(card);
  });
}
function renderResults(container, data) {
  container.replaceChildren();
  if (!data.products?.length) {
    container.append(el("p", "empty", "No matching retailer listings. Try a different name, set number, or product code."));
    return;
  }
  const cheapest = (data.variants || []).find(variant => variant.available);
  if (cheapest) {
    const best = el("div", "best-price");
    const details = el("span", "");
    details.append(el("strong", "in-stock-price", money(cheapest.price, cheapest.currency)), document.createTextNode(" · "), retailerLink(cheapest));
    best.append(el("strong", "", "Lowest in-stock"), details);
    container.append(best);
  }
  const sortRow = el("div", "sort-row");
  const sortLabel = el("label", "", "Sort/group:");
  const sortSelect = el("select", "sort-select");
  sortSelect.setAttribute("aria-label", "Sort and group listings");
  [["default", "Default"], ["rarity", "Group by rarity"], ["price-asc", "Cheapest first"], ["price-desc", "Most expensive first"]].forEach(([value, label]) => {
    const option = el("option", "", label);
    option.value = value;
    sortSelect.append(option);
  });
  sortRow.append(sortLabel, sortSelect);
  container.append(sortRow);
  const listings = el("div", "listing-results");
  container.append(listings);
  renderProducts(listings, data.products, sortSelect.value);
  sortSelect.addEventListener("change", () => renderProducts(listings, data.products, sortSelect.value));
}
async function searchCard(raw, status, container) {
  const term = String(raw || "").trim();
  if (!term) throw new Error("Enter a card name, number, or product code.");
  status.textContent = `Searching stores for ${term}…`;
  const response = await chrome.runtime.sendMessage({ type: "SEARCH_CARD", cardNumber: term, game: game.value });
  if (!response?.ok) throw new Error(response?.error || "Search failed.");
  status.textContent = `Results for ${response.data.cardNumber}`;
  renderResults(container, response.data);
  return response.data;
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  singleButton.disabled = true;
  singleButton.textContent = "Searching…";
  resultsBox.replaceChildren();
  try { await searchCard(input.value, statusBox, resultsBox); }
  catch (error) { statusBox.textContent = `Error: ${error.message}`; }
  finally { singleButton.disabled = false; singleButton.textContent = "Search"; }
});
function parseReferences(text, fallback) {
  return text.split(/\n|,/).map(line => line.trim()).filter(Boolean).map(line => {
    const quantity = line.match(/\s+(?:x|\*)\s*(\d+)\s*$/i);
    const reference = quantity ? line.slice(0, quantity.index).trim() : line;
    return { reference, quantity: Math.max(1, Number(quantity?.[1] || fallback) || 1) };
  }).filter(entry => entry.reference);
}
multiButton.addEventListener("click", async () => {
  const entries = parseReferences(multiInput.value, defaultQty.value);
  if (!entries.length) { multiStatus.textContent = "Add one or more card references first."; multiResults.replaceChildren(); return; }
  multiButton.disabled = true;
  multiButton.textContent = "Searching…";
  multiStatus.textContent = `Searching ${entries.length} reference(s)…`;
  multiResults.replaceChildren();
  try {
    const results = await Promise.all(entries.map(async entry => {
      const section = el("section", "multi-card");
      section.append(el("h2", "", `${entry.reference} · Qty ${entry.quantity}`));
      const result = el("div", "results");
      section.append(result);
      try {
        const data = await searchCard(entry.reference, { set textContent(value) { /* status is summarized below */ } }, result);
        return { section, data, ok: true };
      } catch (error) {
        result.append(el("p", "empty", error.message));
        return { section, ok: false };
      }
    }));
    results.forEach(result => multiResults.append(result.section));
    const found = results.filter(result => result.ok && result.data.products.length).length;
    multiStatus.textContent = `Finished: listings found for ${found} of ${entries.length} card reference(s).`;
  } finally {
    multiButton.disabled = false;
    multiButton.textContent = "Search all";
  }
});

async function checkActivePage() {
  detectSearch.disabled = true;
  detectedCard = "";
  detectStatus.textContent = "Checking the active tab…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active browser tab was found.");
    let card = "";
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_DETECTED_CARD" });
      if (response?.ok) card = response.cardNumber || "";
    } catch { /* Content script is not available on this page. */ }
    if (!card) {
      const match = `${tab.title || ""} ${tab.url || ""}`.match(/\b[A-Z]{1,5}\d{1,3}-\d{2,4}\b/i);
      if (match) card = match[0].toUpperCase();
    }
    if (!card) {
      detectStatus.textContent = "No card number detected. Open a supported retailer product page, or enter a card in Single search.";
      return;
    }
    detectedCard = normalizeCardNumber(card);
    detectStatus.textContent = `Detected: ${detectedCard}`;
    detectSearch.disabled = false;
  } catch (error) { detectStatus.textContent = error.message; }
}
$("#detect-refresh").addEventListener("click", checkActivePage);
detectSearch.addEventListener("click", async () => {
  if (!detectedCard) return;
  document.querySelector('[data-panel="panel-single"]').click();
  input.value = detectedCard;
  form.requestSubmit();
});
document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(item => {
    const selected = item === tab;
    item.classList.toggle("active", selected);
    item.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".tab-panel").forEach(panel => { panel.hidden = panel.id !== tab.dataset.panel; });
  if (tab.dataset.panel === "panel-detect") checkActivePage();
}));
chrome.tabs.onActivated?.addListener(() => { if (!$("#panel-detect").hidden) checkActivePage(); });

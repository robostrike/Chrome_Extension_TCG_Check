const form = document.getElementById("search-form");
const input = document.getElementById("card-number");
const game = document.getElementById("game");
const button = document.getElementById("search-button");
const statusBox = document.getElementById("status");
const resultsBox = document.getElementById("results");
const autoToggle = document.getElementById("auto-toggle");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function money(value, currency) {
  if (!currency || currency === "Currency not reported") return Number(value).toFixed(2) + " (currency unconfirmed)";
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
  if (sortBy === "rarity") {
    sorted.sort((a, b) => (a.rarity || "Unknown").localeCompare(b.rarity || "Unknown") || a.title.localeCompare(b.title));
  } else if (sortBy === "price-asc") {
    sorted.sort((a, b) => lowestAvailablePrice(a) - lowestAvailablePrice(b));
  } else if (sortBy === "price-desc") {
    sorted.sort((a, b) => lowestAvailablePrice(b) - lowestAvailablePrice(a));
  }
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
    const top = el("div", "product-top");
    top.append(el("div", "product-title", `${product.storeName}: ${product.title}`));
    card.append(top);
    if (product.rarity) card.append(el("span", "rarity-label", product.rarity));
    if (product.error) {
      card.append(el("p", "warning", product.error));
    } else {
      (product.variants || []).forEach(variant => {
        const row = el("div", "variant-row");
        const left = el("div", "variant-name");
        left.append(el("strong", "", variant.title || "Default"), el("span", "availability", variant.available ? "In stock" : "Sold out"));
        const price = el("strong", variant.available ? "price in-stock-price" : "price", money(variant.price, product.currency));
        row.append(left, price);
        card.append(row);
      });
    }
    container.append(card);
  });
}
function renderResults(data) {
  resultsBox.replaceChildren();
  if (!data.products.length) {
    resultsBox.append(el("p", "empty", "No exact card-number matches were returned. Try the product name or check whether the store has indexed the card."));
    return;
  }
  if (data.variants.length) {
    const cheapest = data.variants.find(variant => variant.available);
    if (cheapest) {
      const note = el("div", "best-price");
      const details = el("span", "");
      const price = el("strong", "price in-stock-price", money(cheapest.price, cheapest.currency));
      details.append(price, document.createTextNode(" · "), retailerLink(cheapest));
      note.append(el("strong", "", "Lowest in-stock listed price"), details);
      resultsBox.append(note);
    }
  }
  resultsBox.append(el("h2", "section-title", "Matching listings"));
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
  resultsBox.append(sortRow);
  const listings = el("div", "listing-results");
  resultsBox.append(listings);
  renderProducts(listings, data.products, sortSelect.value);
  sortSelect.addEventListener("change", () => renderProducts(listings, data.products, sortSelect.value));
}
async function search(cardNumber) {
  const value = cardNumber.trim();
  if (!value) { statusBox.textContent = "Enter a card number first."; return; }
  button.disabled = true;
  button.textContent = "Searching…";
  statusBox.textContent = `Searching stores for ${value}…`;
  resultsBox.replaceChildren();
  try {
    const response = await chrome.runtime.sendMessage({ type: "SEARCH_CARD", cardNumber: value, game: game.value });
    if (!response?.ok) throw new Error(response?.error || "Search failed.");
    statusBox.textContent = `Results for ${response.data.cardNumber}`;
    renderResults(response.data);
  } catch (error) {
    statusBox.textContent = `Error: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Search";
  }
}
form.addEventListener("submit", event => { event.preventDefault(); search(input.value); });
autoToggle.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: { autoCompare: autoToggle.checked } });
});
(async () => {
  const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  if (response?.ok) {
    autoToggle.checked = response.settings.autoCompare !== false;
    const recent = response.recentSearches?.[0]?.cardNumber;
    if (recent) input.value = recent;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    try {
      const url = new URL(tab.url);
      if (["kanzengames.com", "untouchables.ca"].includes(url.hostname)) {
        const match = decodeURIComponent(url.pathname).match(/([A-Z]{1,5}\d{1,3}-\d{2,4})/i);
        if (match && !input.value) input.value = match[1].toUpperCase();
      }
    } catch {}
  }
})();

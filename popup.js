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
  if (!currency || currency === "Currency not reported") {
    return Number(value).toFixed(2) + " (currency unconfirmed)";
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency
    }).format(value);
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

function renderResults(data) {
  resultsBox.replaceChildren();

  const storeSummary = el("div", "store-summary");
  data.stores.forEach(store => {
    const line = el("div", "store-line");
    const name = el("strong", "", store.storeName);
    const state = el("span", store.ok ? "store-ok" : "store-error",
      store.ok ? `${store.products.length} match(es)` : (store.error || "Unavailable"));
    line.append(name, state);
    storeSummary.append(line);
  });
  resultsBox.append(storeSummary);

  if (!data.products.length) {
    resultsBox.append(el("p", "empty", "No exact card-number matches were returned. Try the product name or check whether the store has indexed the card."));
    return;
  }

  const heading = el("h2", "section-title", "Matching listings");
  resultsBox.append(heading);

  data.products.forEach(product => {
    const card = el("article", "product-card");
    const top = el("div", "product-top");
    const title = el("div", "product-title", product.title);
    const link = el("a", "product-link", "Open store");
    link.href = product.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    top.append(title, link);
    card.append(top);

    if (product.error) {
      card.append(el("p", "warning", product.error));
    } else {
      (product.variants || []).forEach(variant => {
        const row = el("div", "variant-row");
        const left = el("div", "variant-name");
        left.append(
          el("strong", "", variant.title || "Default"),
          el("span", "availability", variant.available ? "In stock" : "Sold out")
        );
        const price = el("strong", "price", money(variant.price, product.currency));
        row.append(left, price);
        card.append(row);
      });
    }
    resultsBox.append(card);
  });

  if (data.variants.length) {
    const cheapest = data.variants.find(v => v.available);
    if (cheapest) {
      const note = el("div", "best-price");
      note.append(
        el("strong", "", "Lowest in-stock listed price"),
        el("span", "", `${money(cheapest.price, cheapest.currency)} · ${cheapest.storeName}`)
      );
      resultsBox.prepend(note);
    }
  }
}

async function search(cardNumber) {
  const value = cardNumber.trim();
  if (!value) {
    statusBox.textContent = "Enter a card number first.";
    return;
  }

  button.disabled = true;
  button.textContent = "Searching…";
  statusBox.textContent = `Searching stores for ${value}…`;
  resultsBox.replaceChildren();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SEARCH_CARD",
      cardNumber: value,
      game: game.value
    });

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

form.addEventListener("submit", event => {
  event.preventDefault();
  search(input.value);
});

autoToggle.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    settings: { autoCompare: autoToggle.checked }
  });
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

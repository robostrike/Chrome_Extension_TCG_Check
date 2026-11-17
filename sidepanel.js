import { normalizeCardNumber } from "./matching.js";

const form = document.getElementById("search-form");
const input = document.getElementById("card-number");
const quantityInput = document.getElementById("search-qty");
const game = document.getElementById("game");
const button = document.getElementById("search-button");
const statusBox = document.getElementById("status");
const resultsBox = document.getElementById("results");
const autoToggle = document.getElementById("auto-toggle");
const buyListInput = document.getElementById("buy-list");
const defaultQtyInput = document.getElementById("default-qty");
const sortModeSelect = document.getElementById("sort-mode");
const buyListButton = document.getElementById("buy-list-button");
const saveListButton = document.getElementById("save-list-button");
const copyOrderButton = document.getElementById("copy-order-button");
const buyStatus = document.getElementById("buy-status");
const buyResults = document.getElementById("buy-results");
const perCardResults = document.getElementById("per-card-results");
const historyList = document.getElementById("history-list");

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

function renderResults(data, desiredQty = 1) {
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
    const link = el("a", "product-link", "Visit product");
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

      const controls = el("div", "buy-controls");
      const quantityLabel = el("span", "", "Qty");
      const qtyInput = document.createElement("input");
      qtyInput.type = "number";
      qtyInput.min = "1";
      qtyInput.value = String(desiredQty || 1);
      qtyInput.setAttribute("aria-label", `Desired quantity for ${product.title}`);
      const buyButton = el("a", "product-link", "Add to cart");
      buyButton.href = product.url;
      buyButton.target = "_blank";
      buyButton.rel = "noopener noreferrer";
      controls.append(quantityLabel, qtyInput, buyButton);
      card.append(controls);
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

async function search(cardNumber, desiredQty = Number(quantityInput.value) || 1) {
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
    renderResults(response.data, desiredQty);
  } catch (error) {
    statusBox.textContent = `Error: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Search";
  }
}

function parseList(rawText, fallbackQty) {
  const defaultQty = Number(fallbackQty) || 1;
  const lines = rawText
    .split(/\n|,/)
    .map(line => line.trim())
    .filter(Boolean);

  return lines
    .map(line => {
      const match = line.match(/^([A-Z0-9\-/]+?)(?:\s*[xX*]\s*(\d+))?$/i);
      if (!match) return null;
      const cardNumber = normalizeCardNumber(match[1]);
      if (!cardNumber) return null;
      return {
        cardNumber,
        quantity: Math.max(1, Number(match[2] || defaultQty || 1))
      };
    })
    .filter(Boolean);
}

async function searchBuyList() {
  const entries = parseList(buyListInput.value, defaultQtyInput.value);
  if (!entries.length) {
    buyStatus.textContent = "Add at least one card number to the buy list.";
    buyResults.replaceChildren();
    perCardResults.replaceChildren();
    return;
  }

  buyStatus.textContent = "Checking which stores cover the cards in your list…";
  buyResults.replaceChildren();
  perCardResults.replaceChildren();

  try {
    const perCardEntries = await Promise.all(entries.map(async ({ cardNumber, quantity }) => {
      const response = await chrome.runtime.sendMessage({ type: "SEARCH_CARD", cardNumber, game: game.value });
      if (!response?.ok) return { cardNumber, quantity, products: [] };
      const products = (response.data.products || []).filter(product =>
        (product.variants || []).some(variant => variant.available)
      );
      return { cardNumber, quantity, products };
    }));

    const storeMap = new Map();
    const cardSummaries = [];

    for (const entry of perCardEntries) {
      const desiredQty = Math.max(1, Number(entry.quantity) || 1);
      const bestOptions = [];

      for (const product of entry.products) {
        const storeId = product.storeId;
        const store = storeMap.get(storeId) || {
          storeId,
          storeName: product.storeName,
          coveredUnits: 0,
          coveredCards: 0,
          totalPrice: 0,
          currency: product.currency || "CAD",
          cards: new Map()
        };

        if (!store.cards.has(entry.cardNumber)) {
          const cheapest = (product.variants || [])
            .filter(variant => variant.available)
            .sort((a, b) => a.price - b.price)[0];

          if (!cheapest) continue;

          const currency = product.currency || store.currency || "CAD";
          const cardTotal = cheapest.price * desiredQty;
          store.coveredUnits += desiredQty;
          store.coveredCards += 1;
          store.totalPrice += cardTotal;
          store.currency = currency;
          store.cards.set(entry.cardNumber, {
            quantity: desiredQty,
            totalPrice: cardTotal,
            unitPrice: cheapest.price
          });
        }

        const cheapestAvailable = (product.variants || [])
          .filter(variant => variant.available)
          .sort((a, b) => a.price - b.price)[0];

        if (cheapestAvailable) {
          bestOptions.push({
            storeName: product.storeName,
            price: cheapestAvailable.price,
            totalPrice: cheapestAvailable.price * desiredQty,
            currency: product.currency || "CAD",
            url: product.url
          });
        }

        storeMap.set(storeId, store);
      }

      cardSummaries.push({
        cardNumber: entry.cardNumber,
        quantity: desiredQty,
        bestOption: bestOptions.sort((a, b) => a.totalPrice - b.totalPrice)[0] || null
      });
    }

    const ranked = [...storeMap.values()]
      .map(store => ({
        storeId: store.storeId,
        storeName: store.storeName,
        coveredUnits: store.coveredUnits,
        coveredCards: store.coveredCards,
        totalPrice: store.totalPrice,
        currency: store.currency || "CAD",
        cards: [...store.cards.entries()].map(([cardNumber, data]) => ({
          cardNumber,
          quantity: data.quantity,
          totalPrice: data.totalPrice,
          unitPrice: data.unitPrice
        }))
      }))
      .sort((a, b) => {
        const mode = sortModeSelect.value;
        if (mode === "cheapest") {
          return a.totalPrice - b.totalPrice || b.coveredUnits - a.coveredUnits || b.coveredCards - a.coveredCards || a.storeName.localeCompare(b.storeName);
        }
        return b.coveredUnits - a.coveredUnits || a.totalPrice - b.totalPrice || b.coveredCards - a.coveredCards || a.storeName.localeCompare(b.storeName);
      });

    if (!ranked.length) {
      buyStatus.textContent = "No stores in your list returned in-stock matches for the cards you entered.";
      buyResults.replaceChildren();
      perCardResults.replaceChildren();
      return;
    }

    const summary = el("div", "best-price");
    const strongest = ranked[0];
    summary.append(
      el("strong", "", "Best coverage and price"),
      el("span", "", `${strongest.storeName} covers ${strongest.coveredUnits} unit(s) across ${strongest.coveredCards} card(s) for ${money(strongest.totalPrice, strongest.currency || "CAD")}`)
    );
    buyResults.append(summary);

    const tableWrap = el("div", "buy-store-table-wrap");
    const table = document.createElement("table");
    table.className = "buy-store-table";
    const thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Store</th><th>Units</th><th>Cards</th><th>Total</th><th>Checklist</th></tr>";
    table.append(thead);

    const tbody = document.createElement("tbody");
    ranked.forEach(store => {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      const units = document.createElement("td");
      const cards = document.createElement("td");
      const total = document.createElement("td");
      const checklist = document.createElement("td");

      name.innerHTML = `<strong>${store.storeName}</strong>`;
      units.textContent = `${store.coveredUnits}`;
      cards.textContent = `${store.coveredCards}`;
      total.textContent = money(store.totalPrice, store.currency || "CAD");
      checklist.textContent = store.cards
        .map(({ cardNumber, quantity, totalPrice }) => `${cardNumber} x${quantity} (${money(totalPrice, store.currency || "CAD")})`)
        .join(" • ");

      row.append(name, units, cards, total, checklist);
      tbody.append(row);
    });

    table.append(tbody);
    tableWrap.append(table);
    buyResults.append(tableWrap);

    const perCardHeading = el("div", "section-title", "Per-card best options");
    perCardResults.append(perCardHeading);
    cardSummaries.forEach(({ cardNumber, quantity, bestOption }) => {
      const item = el("div", "buy-store-item");
      const info = el("div");
      info.append(
        el("strong", "", `${cardNumber} x${quantity}`),
        el("div", "buy-store-meta", bestOption ? `${bestOption.storeName} · ${money(bestOption.totalPrice, bestOption.currency || "CAD")}` : "No in-stock match")
      );
      if (bestOption) {
        const link = el("a", "product-link", "Open listing");
        link.href = bestOption.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        item.append(info, link);
      } else {
        item.append(info);
      }
      perCardResults.append(item);
    });

    buyStatus.textContent = `Best store for your checklist based on ${sortModeSelect.value === "cheapest" ? "lowest total cost" : "stock coverage"} across ${entries.length} card(s).`;
  } catch (error) {
    buyStatus.textContent = `Error: ${error.message}`;
  }
}

async function saveBuyList() {
  const entries = parseList(buyListInput.value, defaultQtyInput.value);
  if (!entries.length) {
    buyStatus.textContent = "Nothing to save yet; add card numbers to the buy list first.";
    return;
  }

  const saved = await chrome.storage.local.get({ savedBuyLists: [] });
  const existing = saved.savedBuyLists || [];
  const payload = {
    savedAt: new Date().toISOString(),
    game: game.value,
    entries
  };

  const next = [payload, ...existing].slice(0, 10);
  await chrome.storage.local.set({ savedBuyLists: next });
  renderSavedHistory();
  buyStatus.textContent = "Buy list saved locally.";
}

async function copyStoreOrder() {
  const ranked = buyResults.querySelectorAll(".buy-store-table tbody tr");
  const fallback = buyResults.querySelectorAll(".buy-store-item");
  const rows = ranked.length ? ranked : fallback;
  if (!rows.length) {
    buyStatus.textContent = "Run the checklist first so there is a store order to copy.";
    return;
  }

  const lines = Array.from(rows).map((node, index) => {
    const title = node.querySelector("strong")?.textContent || node.cells?.[0]?.textContent || `Store ${index + 1}`;
    const meta = node.querySelector(".buy-store-meta")?.textContent || node.cells?.[4]?.textContent || node.cells?.[3]?.textContent || "";
    return `${index + 1}. ${title} — ${meta}`;
  });

  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    buyStatus.textContent = "Store order copied to clipboard.";
  } catch (error) {
    buyStatus.textContent = `Clipboard copy failed: ${error.message}`;
  }
}

function renderSavedHistory() {
  chrome.storage.local.get({ savedBuyLists: [] }).then(({ savedBuyLists = [] }) => {
    historyList.replaceChildren();

    if (!savedBuyLists.length) {
      historyList.append(el("div", "history-item", "No saved buy lists yet."));
      return;
    }

    savedBuyLists.forEach((entry, index) => {
      const item = el("div", "history-item");
      const meta = el("div", "history-meta");
      const label = el("strong", "", `List ${savedBuyLists.length - index}`);
      const time = el("span", "", new Date(entry.savedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }));
      meta.append(label, time);

      const cardText = (entry.entries || []).map(({ cardNumber, quantity }) => `${cardNumber} x${quantity}`).join(" • ");
      const cards = el("div", "history-cards", cardText || "No cards saved");

      const actions = el("div", "history-actions");
      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.textContent = "Load";
      loadButton.addEventListener("click", () => {
        buyListInput.value = (entry.entries || []).map(({ cardNumber, quantity }) => `${cardNumber} x${quantity}`).join("\n");
        buyStatus.textContent = `Loaded saved list from ${new Date(entry.savedAt).toLocaleString()}.`;
      });

      const compareButton = document.createElement("button");
      compareButton.type = "button";
      compareButton.textContent = "Compare";
      compareButton.addEventListener("click", () => {
        const currentEntries = parseList(buyListInput.value, defaultQtyInput.value);
        const savedEntries = entry.entries || [];
        const currentSet = new Set(currentEntries.map(({ cardNumber }) => cardNumber));
        const savedSet = new Set(savedEntries.map(({ cardNumber }) => cardNumber));
        const overlap = [...currentSet].filter(card => savedSet.has(card));
        buyStatus.textContent = `Compare: ${savedEntries.length} saved cards, ${currentEntries.length} current cards, ${overlap.length} overlap.`;
      });

      actions.append(loadButton, compareButton);
      item.append(meta, cards, actions);
      historyList.append(item);
    });
  });
}

form.addEventListener("submit", event => {
  event.preventDefault();
  search(input.value, Number(quantityInput.value) || 1);
});

buyListButton.addEventListener("click", searchBuyList);
saveListButton.addEventListener("click", saveBuyList);
copyOrderButton.addEventListener("click", copyStoreOrder);
sortModeSelect.addEventListener("change", () => {
  if (buyResults.childElementCount) searchBuyList();
});

autoToggle.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    settings: { autoCompare: autoToggle.checked }
  });
});

(async () => {
  renderSavedHistory();

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
      const host = url.hostname.replace(/^www\./, "");
      if (["kanzengames.com", "untouchables.ca", "cardifyhobby.com", "elitecardstoronto.com", "bananagames.ca", "kadoone.ca", "rotostcg.ca", "401games.com"].includes(host)) {
        const match = decodeURIComponent(url.pathname).match(/([A-Z]{1,5}\d{1,3}-\d{2,4})/i);
        if (match && !input.value) input.value = match[1].toUpperCase();
      }
    } catch {}
  }
})();

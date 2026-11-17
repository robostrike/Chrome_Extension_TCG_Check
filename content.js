(() => {
  const STORE_HOSTS = [
    "kanzengames.com",
    "untouchables.ca",
    "cardifyhobby.com",
    "elitecardstoronto.com",
    "bananagames.ca",
    "kadoone.ca",
    "rotostcg.ca",
    "401games.com",
    "www.401games.com"
  ];
  const hostname = location.hostname.replace(/^www\./, "");
  if (!STORE_HOSTS.includes(hostname)) return;

  const CARD_PATTERNS = [
    /\b[A-Z]{1,5}\d{1,3}-\d{2,4}\b/i,          // Gundam, One Piece, many TCGs
    /\b[A-Z]{2,5}\s*\d{1,3}\s*\/\s*\d{1,3}\b/i // Pokémon-style collector number
  ];

  function detect() {
    const title = document.querySelector("h1")?.innerText || "";
    const urlText = location.pathname;
    const text = `${title} ${urlText}`;
    for (const pattern of CARD_PATTERNS) {
      const match = text.match(pattern);
      if (match) return match[0].toUpperCase().replace(/\s+/g, "");
    }
    return null;
  }

  function makePanel() {
    if (document.getElementById("tcg-price-widget")) return;
    const panel = document.createElement("section");
    panel.id = "tcg-price-widget";
    const header = document.createElement("div");
    header.className = "tcg-widget-header";
    const heading = document.createElement("strong");
    heading.textContent = "TCG Price Checker";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close price comparison");
    close.addEventListener("click", () => panel.remove());
    header.append(heading, close);

    const body = document.createElement("div");
    body.id = "tcg-widget-body";
    body.textContent = "Looking for competing prices…";
    panel.append(header, body);
    document.body.append(panel);
  }

  function render(data) {
    const body = document.getElementById("tcg-widget-body");
    if (!body) return;
    body.replaceChildren();

    const intro = document.createElement("p");
    intro.className = "tcg-widget-note";
    intro.textContent = `Card: ${data.cardNumber}`;
    body.append(intro);

    if (!data.products.length) {
      const empty = document.createElement("p");
      empty.textContent = "No exact matches found at the other supported stores.";
      body.append(empty);
      return;
    }

    data.products.forEach(product => {
      const item = document.createElement("div");
      item.className = "tcg-widget-item";
      const name = document.createElement("strong");
      name.textContent = `${product.storeName}: ${product.title}`;
      item.append(name);

      (product.variants || []).forEach(variant => {
        const line = document.createElement("p");
        const currency = product.currency || "";
        line.textContent = `${variant.title}: ${currency} ${(variant.price).toFixed(2)} · ${variant.available ? "In stock" : "Sold out"}`;
        item.append(line);
      });

      const link = document.createElement("a");
      link.href = product.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "View listing";
      item.append(link);
      body.append(item);
    });
  }

  async function run() {
    const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (!response?.ok || response.settings.autoCompare === false) return;

    const cardNumber = detect();
    if (!cardNumber) return;

    makePanel();
    try {
      const result = await chrome.runtime.sendMessage({
        type: "SEARCH_CARD",
        cardNumber
      });
      if (result?.ok) render(result.data);
      else {
        const body = document.getElementById("tcg-widget-body");
        if (body) body.textContent = result?.error || "Price search failed.";
      }
    } catch (error) {
      const body = document.getElementById("tcg-widget-body");
      if (body) body.textContent = error.message;
    }
  }

  run();
})();

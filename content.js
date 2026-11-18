(() => {
  const CARD_PATTERNS = [
    /\b[A-Z]{1,5}\d{1,3}-\d{2,4}\b/i,
    /\b[A-Z]{2,5}\s*\d{1,3}\s*\/\s*\d{1,3}\b/i
  ];

  function detect() {
    const tcgplayerProduct = location.hostname === "www.tcgplayer.com"
      ? location.pathname.match(/^\/product\/(\d+)/i)
      : null;
    const title = document.querySelector("h1")?.innerText || document.title || "";
    const metaTitle = document.querySelector('meta[property="og:title"]')?.content || "";
    const pageText = [title, metaTitle, location.pathname, document.body?.innerText || ""].join(" ");
    let cardNumber = null;
    for (const pattern of CARD_PATTERNS) {
      const match = pageText.match(pattern);
      if (match) {
        cardNumber = match[0].toUpperCase().replace(/\s+/g, "");
        break;
      }
    }
    const cleanTitle = (metaTitle || title)
      .replace(/\s*[|–—-]\s*TCGplayer.*$/i, "")
      .replace(/\s*\(.*\)\s*$/, "")
      .trim();
    return {
      cardNumber,
      title: cleanTitle || null,
      tcgplayerProductId: tcgplayerProduct?.[1] || null
    };
  }

  // The page script only reports a detected reference when the extension asks.
  // It never inserts UI, runs a search, or changes the retailer page.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_DETECTED_CARD") {
      sendResponse({ ok: true, ...detect() });
    }
  });
})();

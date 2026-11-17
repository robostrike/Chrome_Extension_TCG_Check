(() => {
  const CARD_PATTERNS = [
    /\b[A-Z]{1,5}\d{1,3}-\d{2,4}\b/i,
    /\b[A-Z]{2,5}\s*\d{1,3}\s*\/\s*\d{1,3}\b/i
  ];

  function detect() {
    const title = document.querySelector("h1")?.innerText || document.title || "";
    const text = `${title} ${location.pathname}`;
    for (const pattern of CARD_PATTERNS) {
      const match = text.match(pattern);
      if (match) return match[0].toUpperCase().replace(/\s+/g, "");
    }
    return null;
  }

  // The page script only reports a detected reference when the extension asks.
  // It never inserts UI, runs a search, or changes the retailer page.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_DETECTED_CARD") {
      sendResponse({ ok: true, cardNumber: detect() });
    }
  });
})();

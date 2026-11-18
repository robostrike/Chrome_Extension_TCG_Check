const CARD_PRODUCTS = {
  "GD06-066": {
    productId: "724387"
  }
};

export function getTCGplayerCard(cardNumber) {
  const normalized = String(cardNumber || "").trim().toUpperCase().replace(/\s+/g, "");
  const card = CARD_PRODUCTS[normalized];
  if (!card) return null;
  return {
    ...card,
    url: `https://www.tcgplayer.com/product/${card.productId}?Language=English`,
    image: `https://product-images.tcgplayer.com/fit-in/400x400/${card.productId}.jpg`
  };
}

export function getTCGplayerCardByProductId(productId) {
  const normalized = String(productId || "").trim();
  const entry = Object.entries(CARD_PRODUCTS).find(([, card]) => card.productId === normalized);
  if (!entry) return null;
  return { ...getTCGplayerCard(entry[0]), cardNumber: entry[0] };
}

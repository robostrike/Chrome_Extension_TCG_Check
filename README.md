# TCG Price Checker v2

A local Chrome Manifest V3 extension for manual and automatic trading-card price comparison.

## Included retailers

- KanZenGames — Shopify Ajax adapter
- Untouchables — Shopify Ajax adapter

## Supported game modes

- Auto / Any TCG
- Gundam Card Game
- Pokémon
- One Piece Card Game
- Magic: The Gathering

The game selector is currently a search-mode hint/UI choice. The store search is based on the exact text entered. It does not use an authoritative card database.

## Windows installation

1. Download and extract `tcg-price-checker-v2.zip`.
2. Open Google Chrome.
3. Visit `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted `tcg-price-checker-v2` folder (the folder containing `manifest.json`).
7. Pin **TCG Price Checker** from Chrome's Extensions menu.
8. Visit a supported store product page, or click the extension icon and enter a card number such as `GD06-066`.

## Add a Shopify store

1. Open `stores.js`.
2. Add a record with a unique `id`, display `name`, `origin`, `platform: "shopify"`, and `enabled: true`.
3. Add that domain to `host_permissions` in `manifest.json`.
4. Add that domain to the `matches` array in `manifest.json` and `STORE_HOSTS` in `content.js` if automatic page detection is wanted.
5. Reload the extension from `chrome://extensions`.

Example:

```js
{
  id: "example",
  name: "Example Cards",
  origin: "https://example.ca",
  platform: "shopify",
  enabled: true
}
```

## Testing retailer endpoints

For a Shopify retailer, try these URLs in a browser:

- `https://STORE-DOMAIN/search/suggest.json?q=GD06-066&resources[type]=product&resources[limit]=10`
- `https://STORE-DOMAIN/products/PRODUCT-HANDLE.js`

A store may block or customize these endpoints. If so, it needs a custom adapter.

## Important limitations

- Shopify Ajax API is not guaranteed to be enabled on every Shopify storefront or custom storefront.
- Product search can omit products that the retailer's search index does not return.
- Exact card-number matching is intentionally conservative; product names, variants, finishes and conditions still need human review.
- Price comparison does not yet normalize CAD/USD, shipping, taxes, coupons, or condition.
- A variant named "Default" is not proof of Near Mint or any other condition.
- The extension does not buy products, add to cart, log in, or access customer information.
- Use reasonable request rates and comply with retailer terms and applicable laws.
- The included stores are starter examples, not an endorsement or guarantee of retailer API behavior.

## Debugging

- Popup: right-click the popup and choose **Inspect**.
- Service worker: `chrome://extensions` → TCG Price Checker → **Service worker** → Inspect.
- Content script: open the retailer page, press F12, and inspect the Console.
- After editing files, return to `chrome://extensions` and click the extension's Reload icon.

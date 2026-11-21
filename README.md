# Real Deal Tracker

Track the selling price of a specific product and flag meaningful drops. A TV that usually sells for $800 triggers a $100-savings alert at $700, regardless of its advertised list price.

## Try it

Run these commands from the project directory with Node.js 22 or later. There are no dependencies to install.

```sh
node check.mjs --demo
node --test
```

## Track a product

1. Copy `watchlist.example.json` to `watchlist.json`. Add the exact model and direct product URL for each store you want to check.
2. Set `minimumSavings` in USD. Set `usualPrice` if you already know the typical selling price, or omit it to let the tracker learn from observations.
3. Run `node check.mjs` from this directory. Each run checks the configured pages and prints new deals to the terminal. Run checks one at a time.

If you supply a usual price, the tracker keeps using it. Otherwise, it estimates a baseline from the median of prior daily observations in the past 60 days once it has seven such days for a store and model. A qualifying price triggers an alert the first time it appears and again if it drops further. A successful check below your savings threshold resets the alert.

The first version reads structured product data from pages that publish an identifiable, in-stock USD offer. Pages with ambiguous prices, missing model data, blocked requests, or client-side-only offers may require a store-specific integration. Displayed prices exclude shipping and tax. The demo uses the example figures and makes no network requests.

## Check twice a day

```sh
node check.mjs --watch
```

Watch mode checks your list immediately and then at 8 a.m. and 6 p.m. in your computer's local time zone. Keep the terminal open and the computer awake for timely checks. Alerts print in that terminal and request a bell if the terminal supports it. Press Ctrl+C to stop. Use one tracker process at a time.

The tracker checks the product URLs on your watchlist. Your watchlist and price history are local files excluded from Git.

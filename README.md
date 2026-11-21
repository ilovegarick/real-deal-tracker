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

The tracker uses the median of prior daily observations from the past 60 days once it has seven such days for a store and model. Until then it uses your starting baseline, if supplied. A qualifying price triggers an alert the first time it appears and again if it drops further. A successful check below your savings threshold resets the alert.

The first version reads structured product data from pages that publish an identifiable, in-stock USD offer. Pages with ambiguous prices, missing model data, blocked requests, or client-side-only offers may require a store-specific integration. Displayed prices exclude shipping and tax. The demo uses the example figures and makes no network requests.

Your watchlist and price history are local files excluded from Git. Checks run on demand. Alerts appear in the terminal.

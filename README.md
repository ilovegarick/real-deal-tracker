# Real Deal Tracker

Track the selling price of a specific product and flag meaningful drops. A TV that usually sells for $800 triggers a $100-savings alert at $700, regardless of its advertised list price.

## Hosted search and email alerts

The **Price watch** GitHub Actions workflow runs at 8 a.m. and 6 p.m. Pacific, even when your PC is off. Each repository runs one plain-text request at a time. Use a brand, exact model, and price, such as `LG OLED42C4PUA under $700`. Use `at or below` to include the target price.

The tracker searches for product pages and verifies the exact model, brand, and available price at supported U.S. retailers. The workflow log lists supported sellers it could not find or verify. The offer price excludes shipping and tax. It emails the best qualifying offer and emails again for a lower qualifying price. Alert state is cached between runs. A cache eviction can cause a repeat alert.

1. Fork the repository. Open your fork’s **Actions** tab and enable workflows if GitHub prompts you.
2. Under **Settings → Secrets and variables → Actions → Variables**, set `TRACK_REQUEST` to your request. The job skips until this variable is set.
3. Optionally set `RETAILER_HOSTS` to a comma-separated list of retailer hostnames you trust, such as `www.example.com, shop.example.org`. Search results from these hosts still need an exact brand and model match and an available USD price in structured product data. The built-in retailer list is in [discovery.mjs](discovery.mjs).
4. Under **Secrets**, add your own credentials:

- `SERPAPI_API_KEY` from the [SerpApi free plan](https://serpapi.com/pricing).
- `RESEND_API_KEY` from the [Resend free plan](https://resend.com/pricing).
- `ALERT_EMAIL` set to the email address you used to sign up for Resend. Its default sender is for sending to your own account.

Run **Actions → Price watch → Run workflow** once to verify seller coverage. One scheduled watch uses at most two search API calls per check, or 124 in a 31-day month. Other uses of the account and manual runs also consume quota. Use the providers' free plans without enabling paid overages. Public repositories have public workflow logs. Use a private copy if you want to keep search activity private.

The original retailer-link watchlist can still be run locally.

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

## Home Depot checks

Set `"source": "serpapi-home-depot"` on a watchlist entry with the exact model and a U.S. Home Depot product URL containing its Internet number. The tracker uses [SerpApi’s Home Depot Product API](https://serpapi.com/home-depot-product) and checks the returned item, model, retailer link, availability, and price. Availability and pricing may vary by location. API requests may count against your SerpApi quota.

Create a local `.env` file in the project folder with `SERPAPI_API_KEY=your_key_here`. Keep it private. Git ignores this file. Run an initial check, or add `--watch` for the twice-daily schedule.

```sh
node --env-file=.env check.mjs
node --env-file=.env check.mjs --watch
```

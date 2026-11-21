import { readFile, rename, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { baseline, cents, deal, nextCheck, readOffer } from './tracker.mjs';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (amount) => usd.format(amount / 100);

const [, , mode, watchlistPath] = process.argv;
if (mode === '--demo') {
  const result = deal(70000, 80000, 10000);
  console.log(`DEMO · Sample offer $700 · Sample baseline $800 · ${money(result.savings)} difference`);
} else if (mode === '--watch') {
  try {
    await watch(watchlistPath);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
} else {
  process.exitCode = await check(mode);
}

async function watch(path) {
  await check(path, true);
  while (true) {
    const scheduled = nextCheck(new Date());
    console.log(`Next check · ${scheduled.toLocaleString()}`);
    await delay(Math.max(0, scheduled - Date.now()));
    try {
      await check(path, true);
    } catch (error) {
      console.error(`Check failed · ${error.message}`);
    }
  }
}

async function check(path = 'watchlist.json', watching = false) {
  let contents;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error(`Watchlist missing (${path}). Copy watchlist.example.json and enter a product model, retailer URL, and minimum savings.`);
  }
  const config = JSON.parse(contents);
  if (!Array.isArray(config) || config.length === 0) throw new Error('Add at least one watchlist entry.');
  const entries = config.map((entry) => {
    const url = new URL(entry.url);
    const usualPrice = entry.usualPrice == null ? null : cents(entry.usualPrice);
    const threshold = cents(entry.minimumSavings);
    if (!entry.name || !entry.model || url.protocol !== 'https:' || threshold === null ||
        (entry.usualPrice != null && usualPrice === null)) {
      throw new Error('Each entry needs a name, exact model, HTTPS URL, and valid USD amounts.');
    }
    return { ...entry, url, usualPrice, threshold };
  });
  const historyPath = 'history.json';
  let history;
  try {
    history = JSON.parse(await readFile(historyPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    history = {};
  }
  const today = new Date().toISOString().slice(0, 10);
  const messages = [];
  let failures = 0;
  for (const { name, model, url, usualPrice, threshold } of entries) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const price = readOffer(await response.text(), model);
      if (price === null) throw new Error('No unambiguous in-stock USD offer for this exact model');
      const key = JSON.stringify([model, url.href]);
      const state = history[key] ??= { observations: {}, alertedPrice: null };
      const usual = baseline(state.observations, today, usualPrice);
      state.observations[today] = price;
      const { savings, qualifies } = deal(price, usual, threshold);
      const alert = qualifies && (state.alertedPrice === null || price < state.alertedPrice);
      if (alert) state.alertedPrice = price;
      if (!qualifies) state.alertedPrice = null;
      const comparison = usual === null
        ? 'collecting price history'
        : `${money(usual)} ${usualPrice === null ? 'observed median' : 'configured baseline'} · ${savings > 0 ? money(savings) + ' below baseline' : 'no savings'}`;
      const prefix = alert ? `${watching && process.stdout.isTTY ? '\u0007' : ''}ALERT · ` : '';
      messages.push(`${prefix}${name} · ${money(price)} observed · ${comparison} · ${url.href}`);
    } catch (error) {
      failures++;
      console.error(`${name} · ${url.href} · ${error.message}`);
    }
  }
  const temporary = `${historyPath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(history, null, 2) + '\n');
  await rename(temporary, historyPath);
  messages.forEach((message) => console.log(message));
  return failures > 0 ? 1 : 0;
}

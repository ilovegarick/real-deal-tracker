import { readFile, rename, writeFile } from 'node:fs/promises';
import { baseline, cents, deal, readOffer } from './tracker.mjs';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (amount) => usd.format(amount / 100);

if (process.argv[2] === '--demo') {
  const result = deal(70000, 80000, 10000);
  console.log(`DEMO ALERT · LG OLED · $700 today · $800 usual price · ${money(result.savings)} saved`);
} else {
  await check();
}

async function check() {
  const config = JSON.parse(await readFile(process.argv[2] ?? 'watchlist.json', 'utf8'));
  if (!Array.isArray(config) || config.length === 0) throw new Error('Add at least one watchlist entry.');
  const entries = config.map((entry) => {
    const url = new URL(entry.url);
    const fallback = entry.usualPrice == null ? null : cents(entry.usualPrice);
    const threshold = cents(entry.minimumSavings);
    if (!entry.name || !entry.model || url.protocol !== 'https:' || threshold === null ||
        (entry.usualPrice != null && fallback === null)) {
      throw new Error('Each entry needs a name, exact model, HTTPS URL, and valid USD amounts.');
    }
    return { ...entry, url, fallback, threshold };
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
  for (const { name, model, url, fallback, threshold } of entries) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const price = readOffer(await response.text(), model);
      if (price === null) throw new Error('No unambiguous in-stock USD offer for this exact model');
      const key = JSON.stringify([model, url.href]);
      const state = history[key] ??= { observations: {}, alertedPrice: null };
      const usual = baseline(state.observations, today, fallback);
      state.observations[today] = price;
      const { savings, qualifies } = deal(price, usual, threshold);
      const alert = qualifies && (state.alertedPrice === null || price < state.alertedPrice);
      if (alert) state.alertedPrice = price;
      if (!qualifies) state.alertedPrice = null;
      const comparison = usual === null
        ? 'collecting price history'
        : `${money(usual)} usual · ${savings > 0 ? money(savings) + ' saved' : 'no savings'}`;
      messages.push(`${alert ? 'ALERT · ' : ''}${name} · ${money(price)} today · ${comparison} · ${url.href}`);
    } catch (error) {
      failures++;
      console.error(`${name} · ${url.href} · ${error.message}`);
    }
  }
  const temporary = `${historyPath}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(history, null, 2) + '\n');
  await rename(temporary, historyPath);
  messages.forEach((message) => console.log(message));
  if (failures > 0) process.exitCode = 1;
}

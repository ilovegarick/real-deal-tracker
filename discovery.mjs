import { createHash } from 'node:crypto';
import { homeDepotPrice } from './home-depot.mjs';
import { cents, readOffer } from './tracker.mjs';

const defaultRetailers = new Map([
  ['www.homedepot.com', 'Home Depot'],
  ['www.runnings.com', 'Runnings'],
  ['shop.ranch-home.com', 'Ranch & Home'],
  ['www.acmetools.com', 'Acme Tools'],
  ['www.lowes.com', "Lowe's"],
  ['www.acehardware.com', 'Ace Hardware'],
  ['www.maxwarehouse.com', 'Max Warehouse'],
  ['www.reedssports.com', 'Reeds'],
  ['mrheater.com', 'Mr. Heater'],
]);
const maxCandidatesPerRetailer = 3;
const usd = new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' });
const money = (price) => usd.format(price / 100);

export function parseRequest(text) {
  const match = /^(?:genuine\s+)?(.+?)\s+(under|below|at or below|up to)\s*\$\s*(\d+(?:\.\d{1,2})?)$/i
    .exec(text.trim());
  const query = match?.[1];
  const split = query?.match(/^(.+?)\s+([A-Z0-9-]+)$/i);
  const model = split?.[2];
  const target = cents(match?.[3]);
  if (!model || !/\d/.test(model) || target === null) {
    throw new Error('Enter a brand, exact model, and price, such as “Mr. Heater F273704 under $25”.');
  }
  return {
    query, model: model.toUpperCase(), brand: split[1], target,
    inclusive: /^(at or below|up to)$/i.test(match[2]),
  };
}

export function supportedRetailers(additionalHosts = '') {
  const retailers = new Map(defaultRetailers);
  for (const value of additionalHosts.split(',')) {
    const host = value.trim().toLowerCase();
    if (!host) continue;
    if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(host)) {
      throw new Error('RETAILER_HOSTS must contain comma-separated retailer hostnames.');
    }
    if (!retailers.has(host)) retailers.set(host, host);
  }
  return retailers;
}

export async function checkRequest(text, previous, credentials, request = fetch, log = console.log) {
  const watch = parseRequest(text);
  const retailers = supportedRetailers(credentials.retailerHosts);
  if (!credentials.searchKey || !credentials.emailKey || !credentials.recipient) {
    throw new Error('Set SERPAPI_API_KEY, RESEND_API_KEY, and ALERT_EMAIL to run hosted checks.');
  }
  const endpoint = new URL('https://serpapi.com/search.json');
  endpoint.search = new URLSearchParams({
    engine: 'google', q: `"${watch.model}" ${watch.brand} buy`, gl: 'us', hl: 'en',
    api_key: credentials.searchKey,
  });
  const data = await providerJson(request, endpoint, 'SerpApi');
  if (data.error || (data.search_metadata?.status && data.search_metadata.status !== 'Success')) {
    throw new Error('SerpApi could not complete the seller search.');
  }
  const candidates = new Map();
  for (const result of data.organic_results ?? []) {
    const url = typeof result.link === 'string' ? URL.parse(result.link) : null;
    if (!url || url.protocol !== 'https:' || url.port || url.username || url.password ||
        !retailers.has(url.hostname)) continue;
    if (!String(result.title).toUpperCase().includes(watch.model)) continue;
    url.hash = '';
    url.search = '';
    const links = candidates.get(url.hostname) ?? new Set();
    if (links.size >= maxCandidatesPerRetailer) continue;
    links.add(url.href);
    candidates.set(url.hostname, links);
  }

  const offers = [];
  for (const [host, links] of candidates) {
    const seller = retailers.get(host);
    for (const link of links) {
      const url = new URL(link);
      try {
        const price = host === 'www.homedepot.com'
          ? await homeDepotPrice({ ...watch, url }, credentials.searchKey, request)
          : await retailerPrice(request, url, watch);
        offers.push({ seller, price, url: link });
        log(`${seller} · ${money(price)} verified`);
      } catch {
        log(`${seller} · price or availability could not be verified`);
      }
    }
  }
  const skipped = [...retailers].filter(([host]) => !candidates.has(host)).map(([, seller]) => seller);
  if (skipped.length) log(`No matching search result · ${skipped.join(', ')}`);
  if (!offers.length) throw new Error('No supported retailer returned a verifiable offer.');

  offers.sort((a, b) => a.price - b.price);
  const key = JSON.stringify([watch.brand.toLowerCase(), watch.model, watch.target, watch.inclusive]);
  const state = previous.key === key ? previous : { key, alertedPrice: null };
  const best = offers[0];
  const qualifies = watch.inclusive ? best.price <= watch.target : best.price < watch.target;
  if (!qualifies) return state;
  if (state.alertedPrice !== null && best.price >= state.alertedPrice) return state;

  const alertId = createHash('sha256').update(JSON.stringify([key, best.price])).digest('hex');
  const delivery = await providerJson(request, new URL('https://api.resend.com/emails'), 'Resend', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.emailKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': alertId,
    },
    body: JSON.stringify({
      from: 'Real Deal Tracker <onboarding@resend.dev>',
      to: [credentials.recipient],
      subject: `Deal found: ${watch.query} at ${money(best.price)}`,
      text: `${best.seller} · ${money(best.price)} before tax and shipping\n${best.url}`,
    }),
  });
  if (typeof delivery?.id !== 'string' || !delivery.id) {
    throw new Error('Resend did not confirm it accepted the deal email.');
  }
  log('Deal email accepted by Resend.');
  return { key, alertedPrice: best.price };
}

async function retailerPrice(request, url, watch) {
  const response = await request(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!response.ok) throw new Error('Retailer lookup failed.');
  const price = readOffer(await response.text(), watch.model, watch.brand);
  if (price === null) throw new Error('Could not verify a matching offer.');
  return price;
}

async function providerJson(request, url, provider, options = {}) {
  let response;
  try {
    response = await request(url, { ...options, signal: AbortSignal.timeout(15000), redirect: 'error' });
  } catch {
    throw new Error(`${provider} could not be reached.`);
  }
  if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}.`);
  return response.json().catch(() => { throw new Error(`${provider} returned invalid data.`); });
}

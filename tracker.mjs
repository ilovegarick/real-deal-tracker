export function deal(price, usual, threshold) {
  const savings = usual === null ? null : usual - price;
  return { savings, qualifies: savings !== null && savings >= threshold };
}

export function cents(value) {
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(String(value))) return null;
  const amount = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function matchesBrand(actual, expected) {
  const name = typeof actual === 'string' ? actual : actual?.name;
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return !expected || (typeof name === 'string' && normalize(name) === normalize(expected));
}

export function readOffer(html, model, brand) {
  const prices = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if ([node.model, node.mpn, node.sku].includes(model) && node['@type'] === 'Product' &&
        matchesBrand(node.brand, brand)) {
      for (const offer of [node.offers].flat()) {
        if (offer?.['@type'] !== 'Offer' || offer.priceCurrency !== 'USD') continue;
        if (!/(?:^|\/)InStock$/.test(offer.availability ?? '')) continue;
        if (offer.itemCondition && !/(?:^|\/)NewCondition$/.test(offer.itemCondition)) continue;
      if (offer.validForMemberTier != null) continue;
        const price = cents(offer.price);
        if (price !== null) prices.push(price);
      }
    }
    for (const child of Object.values(node)) visit(child);
  }

  const scripts = /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const [, json] of html.matchAll(scripts)) {
    let document;
    try {
      document = JSON.parse(json);
    } catch {
      continue;
    }
    visit(document);
  }
  const unique = [...new Set(prices)];
  return unique.length === 1 ? unique[0] : null;
}

export function baseline(history, today, usualPrice) {
  if (usualPrice !== null) return usualPrice;
  const cutoff = new Date(Date.parse(today) - 60 * 86400000).toISOString().slice(0, 10);
  const prices = Object.entries(history)
    .filter(([date]) => date >= cutoff && date < today)
    .map(([, price]) => price)
    .sort((a, b) => a - b);
  if (prices.length < 7) return null;
  const middle = Math.floor(prices.length / 2);
  return Math.round((prices[middle] + prices[Math.floor((prices.length - 1) / 2)]) / 2);
}

export function nextCheck(now) {
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);
  if (next > now) return next;
  next.setHours(18);
  if (next > now) return next;
  next.setDate(next.getDate() + 1);
  next.setHours(8);
  return next;
}

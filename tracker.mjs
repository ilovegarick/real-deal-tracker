export function deal(price, usual, threshold) {
  const savings = usual === null ? null : usual - price;
  return { savings, qualifies: savings !== null && savings >= threshold };
}

export function cents(value) {
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(String(value))) return null;
  const amount = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function readOffer(html, model) {
  const prices = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if ([node.model, node.mpn, node.sku].includes(model) && node['@type'] === 'Product') {
      for (const offer of [node.offers].flat()) {
        if (offer?.['@type'] !== 'Offer' || offer.priceCurrency !== 'USD') continue;
        if (!/(?:^|\/)InStock$/.test(offer.availability ?? '')) continue;
        if (offer.itemCondition && !/(?:^|\/)NewCondition$/.test(offer.itemCondition)) continue;
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

export function baseline(history, today, fallback) {
  const cutoff = new Date(Date.parse(today) - 60 * 86400000).toISOString().slice(0, 10);
  const prices = Object.entries(history)
    .filter(([date]) => date >= cutoff && date < today)
    .map(([, price]) => price)
    .sort((a, b) => a - b);
  if (prices.length < 7) return fallback;
  const middle = Math.floor(prices.length / 2);
  return Math.round((prices[middle] + prices[Math.floor((prices.length - 1) / 2)]) / 2);
}

import { cents } from './tracker.mjs';

function itemId(url) {
  if (url?.origin !== 'https://www.homedepot.com') return null;
  return /^\/p\/(?:[^/]+\/)?([0-9]+)\/?$/.exec(url.pathname)?.[1] ?? null;
}

export async function homeDepotPrice(entry, apiKey, request = fetch) {
  const productId = itemId(entry.url);
  if (!productId) throw new Error('Use a Home Depot product URL with an Internet number.');
  if (!apiKey?.trim()) throw new Error('Set SERPAPI_API_KEY to enable this Home Depot check.');

  const endpoint = new URL('https://serpapi.com/search.json');
  endpoint.search = new URLSearchParams({
    engine: 'home_depot_product',
    product_id: productId,
    api_key: apiKey.trim(),
  });
  let response;
  try {
    response = await request(endpoint, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  } catch {
    throw new Error('Could not reach SerpApi. The tracker will retry on the next check.');
  }
  if (!response.ok) throw new Error(`SerpApi returned HTTP ${response.status}. Check your key and usage limits.`);

  const { product_results: product } = await response.json().catch(() => ({}));
  const link = typeof product?.link === 'string' ? URL.parse(product.link) : null;
  const available = ['Available', 'Limited Stock', 'In Stock Nearby', 'Limited Stock Nearby']
    .includes(product?.availability_type);
  const price = cents(product?.price);
  if (String(product?.product_id) !== productId || product?.model_number !== entry.model ||
      itemId(link) !== productId || !available || price === null) {
    throw new Error('Could not verify an available Home Depot price for this exact item.');
  }
  return price;
}

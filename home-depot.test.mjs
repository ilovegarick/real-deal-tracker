import assert from 'node:assert/strict';
import test from 'node:test';
import { homeDepotPrice } from './home-depot.mjs';

const entry = { model: 'F273704', url: new URL('https://www.homedepot.com/p/305092305') };
const product = {
  product_id: '305092305',
  model_number: 'F273704',
  link: entry.url.href,
  price: 24.99,
  availability_type: 'Available',
};

test('looks up Home Depot by exact item and returns the available unit price', async () => {
  const price = await homeDepotPrice(entry, 'test-key', async (url) => {
    assert.equal(url.origin, 'https://serpapi.com');
    assert.equal(url.searchParams.get('engine'), 'home_depot_product');
    assert.equal(url.searchParams.get('product_id'), '305092305');
    assert.equal(url.searchParams.get('api_key'), 'test-key');
    return Response.json({ product_results: product });
  });
  assert.equal(price, 2499);
});

test('rejects unavailable products and mismatched listings', async () => {
  for (const change of [
    { model_number: 'F273701' },
    { product_id: '304910655' },
    { link: 'https://example.com/p/305092305' },
    { availability_type: 'Out of Stock' },
    { availability_type: undefined },
    { price: null },
  ]) {
    const request = async () => Response.json({ product_results: { ...product, ...change } });
    await assert.rejects(homeDepotPrice(entry, 'test-key', request), /could not verify/i);
  }
});

test('rejects missing credentials without making a request', async () => {
  await assert.rejects(homeDepotPrice(entry, '', () => assert.fail('unexpected request')), /SERPAPI_API_KEY/);
});

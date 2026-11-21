import assert from 'node:assert/strict';
import test from 'node:test';
import { baseline, deal, readOffer } from './tracker.mjs';

test('compares the sale against the usual price in cents', () => {
  assert.deepEqual(deal(70000, 80000, 10000), { savings: 10000, qualifies: true });
  assert.equal(deal(70001, 80000, 10000).qualifies, false);
  assert.equal(deal(70000, null, 10000).qualifies, false);
});

test('reads an in-stock matching model and ignores its list price', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@graph': [{ '@type': 'Product', model: 'OLED42C4PUA', offers: [
      { '@type': 'Offer', price: '600', priceCurrency: 'USD', availability: 'https://schema.org/OutOfStock' },
      { '@type': 'Offer', price: '700', priceCurrency: 'USD', availability: 'https://schema.org/InStock', highPrice: '1399' },
    ] }],
  })}</script>`;
  assert.equal(readOffer(html, 'OLED42C4PUA'), 70000);
  assert.equal(readOffer(html, 'OLED48C4PUA'), null);
});

test('learns the usual price from prior days and excludes stale and current observations', () => {
  const history = {
    '2026-01-01': 100000,
    '2026-11-01': 70000,
    '2026-11-02': 76000,
    '2026-11-03': 80000,
    '2026-11-04': 80000,
    '2026-11-05': 82000,
    '2026-11-06': 83000,
    '2026-11-07': 85000,
    '2026-11-08': 60000,
  };
  assert.equal(baseline(history, '2026-11-08', 79000), 80000);
  assert.equal(baseline(history, '2026-11-07', 79000), 79000);
});

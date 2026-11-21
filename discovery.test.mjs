import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRequest, parseRequest, supportedRetailers } from './discovery.mjs';

const watch = 'genuine Mr. Heater F273704 under $25';
const retailerLink = 'https://www.runnings.com/product';
const homeDepotLink = 'https://www.homedepot.com/p/hose/305092305';

test('parses a typed watch request without a retailer URL', () => {
  assert.deepEqual(parseRequest(watch), {
    query: 'Mr. Heater F273704', model: 'F273704', brand: 'Mr. Heater', target: 2500, inclusive: false,
  });
  assert.equal(parseRequest('Mr. Heater F273704 at or below $25').inclusive, true);
  assert.throws(() => parseRequest('heater hose'), /model/i);
});

test('accepts trusted retailer hostnames without changing built-in retailers', () => {
  const retailers = supportedRetailers(' WWW.Example.com, www.homedepot.com ');
  assert.equal(retailers.get('www.example.com'), 'www.example.com');
  assert.equal(retailers.get('www.homedepot.com'), 'Home Depot');
  assert.throws(() => supportedRetailers('https://example.com/shop'), /hostnames/);
});

test('discovers sellers, vets brand and model, and emails a deal only once', async () => {
  let emails = 0;
  let dealPrice = 25;
  const request = async (url, options) => {
    if (url.host === 'api.resend.com') {
      emails++;
      const message = JSON.parse(options.body);
      assert.match(message.text, /Home Depot.*\$24\.99/s);
      return Response.json({ id: 'test-email' });
    }
    if (url.host === 'serpapi.com') {
      if (url.searchParams.get('engine') === 'google') {
        return Response.json({ organic_results: [
          { link: retailerLink, title: 'Mr. Heater F273704' },
          { link: homeDepotLink, title: 'Mr. Heater F273704' },
          { link: 'https://unverified.example/cheap', title: 'Mr. Heater F273704' },
        ] });
      }
      return Response.json({ product_results: {
        product_id: '305092305', model_number: 'F273704', link: homeDepotLink,
        brand: { name: 'Mr. Heater' }, availability_type: 'Available', price: dealPrice,
      } });
    }
    assert.equal(url.href, retailerLink);
    const product = { '@type': 'Product', mpn: 'F273704', brand: { name: 'Clone' }, offers: {
      '@type': 'Offer', price: '10', priceCurrency: 'USD', availability: 'InStock',
    } };
    return new Response(`<script type="application/ld+json">${JSON.stringify(product)}</script>`);
  };
  const credentials = { searchKey: 'search', emailKey: 'email', recipient: 'owner@example.com' };
  const log = () => {};
  const atTarget = await checkRequest(watch, {}, credentials, request, log);
  assert.equal(atTarget.alertedPrice, null);
  assert.equal(emails, 0);
  dealPrice = 24.99;
  const first = await checkRequest(watch, atTarget, credentials, request, log);
  assert.equal(first.alertedPrice, 2499);
  await checkRequest(watch, first, credentials, request, log);
  assert.equal(emails, 1);
});

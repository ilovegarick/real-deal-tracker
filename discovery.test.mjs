import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRequest, parseRequest, supportedRetailers } from './discovery.mjs';

const watch = 'genuine Mr. Heater F273704 under $25';
const retailerLink = 'https://www.runnings.com/product';
const homeDepotLink = 'https://www.homedepot.com/p/hose/305092305';

test('keeps alert history when the only matching product is unavailable', async () => {
  const credentials = { searchKey: 'search', emailKey: 'email', recipient: 'owner@example.com' };
  const previous = { key: JSON.stringify(['mr. heater', 'F273704', 2500, false]), alertedPrice: 2499 };
  const logs = [];
  const request = async (url) => {
    assert.equal(url.host, 'serpapi.com');
    if (url.searchParams.get('engine') === 'google') {
      return Response.json({ organic_results: [{ link: homeDepotLink, title: 'Mr. Heater F273704' }] });
    }
    return Response.json({ product_results: {
      product_id: '305092305', model_number: 'F273704', link: homeDepotLink,
      brand: { name: 'Mr. Heater' }, availability_type: 'Out of Stock', price: 20,
    } });
  };
  assert.deepEqual(await checkRequest(watch, previous, credentials, request, (line) => logs.push(line)), previous);
  assert.match(logs.at(-1), /no supported retailer returned a verifiable offer/i);
});

test('reports a Home Depot provider error when no other offer can be verified', async () => {
  const credentials = { searchKey: 'search', emailKey: 'email', recipient: 'owner@example.com' };
  const request = async (url) => {
    assert.equal(url.host, 'serpapi.com');
    if (url.searchParams.get('engine') === 'google') {
      return Response.json({ organic_results: [{ link: homeDepotLink, title: 'Mr. Heater F273704' }] });
    }
    return new Response(null, { status: 429 });
  };
  await assert.rejects(checkRequest(watch, {}, credentials, request, () => {}), /SerpApi returned HTTP 429/);
});

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

test('checks later distinct results from the same retailer for a better offer', async () => {
  const checked = [];
  const messages = [];
  const results = ['/missing?ref=search', '/missing#details', '/expensive', '/deal', '/beyond-limit'];
  const credentials = { searchKey: 'search', emailKey: 'email', recipient: 'owner@example.com' };
  const request = async (url, options) => {
    if (url.host === 'serpapi.com') {
      return Response.json({ organic_results: results.map((path) => ({
        link: new URL(path, retailerLink).href, title: 'Mr. Heater F273704',
      })) });
    }
    if (url.host === 'api.resend.com') {
      messages.push(JSON.parse(options.body));
      return Response.json({ id: 'test-email' });
    }
    checked.push(url.pathname);
    if (url.pathname === '/missing') return new Response(null, { status: 404 });
    const product = { '@type': 'Product', mpn: 'F273704', brand: { name: 'Mr. Heater' }, offers: {
      '@type': 'Offer', price: url.pathname === '/expensive' ? '30' : '20',
      priceCurrency: 'USD', availability: 'InStock',
    } };
    return new Response(`<script type="application/ld+json">${JSON.stringify(product)}</script>`);
  };

  const state = await checkRequest(watch, {}, credentials, request, () => {});
  assert.deepEqual(checked, ['/missing', '/expensive', '/deal']);
  assert.equal(state.alertedPrice, 2000);
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /https:\/\/www\.runnings\.com\/deal$/);
});

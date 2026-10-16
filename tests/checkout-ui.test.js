import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

for (const fails of [false, true]) {
  test(`checkout ${fails ? 'failure' : 'confirmation'} is visible inside the cart`, async () => {
    const elements = new Map();
    const element = id => {
      if (!elements.has(id)) elements.set(id, {hidden: false, disabled: false, textContent: ''});
      return elements.get(id);
    };
    const context = vm.createContext({
      document: {getElementById: element}, Intl,
      crypto: {randomUUID: () => 'test-checkout-key'},
      fetch: async () => ({ok: !fails, json: async () => fails
        ? {error: 'service_unavailable'} : {id: 'order-123', total: 3600}}),
    });
    // Load handlers without bootstrapping the product-list DOM.
    vm.runInContext(source.replace(/;start\(\);\s*$/, ';'), context);
    await element('checkout').onclick();
    assert.equal(element('cart-panel').hidden, false);
    assert.match(element('checkout-status').textContent,
      fails ? /service_unavailable/ : /Order order-123 confirmed.*\$36\.00/);
    assert.equal(element('checkout').disabled, false);
  });
}

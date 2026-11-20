import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { waNumber, waLink } from '../src/utils/whatsapp.js';

test('Malaysian numbers become 60…', () => {
  assert.equal(waNumber('012-345 6789'), '60123456789');
  assert.equal(waNumber('+60 12-345 6789'), '60123456789');
  assert.equal(waNumber('60123456789'), '60123456789');
  assert.equal(waNumber('12-345 6789'), '60123456789');
  assert.equal(waNumber('011-2345 6789'), '601123456789');
  assert.equal(waNumber(''), '');
});

test('wa.me link with and without a number', () => {
  assert.equal(waLink('012-3456789', 'Hi 你好'), 'https://wa.me/60123456789?text=Hi%20%E4%BD%A0%E5%A5%BD');
  assert.equal(waLink('', 'x'), 'https://wa.me/?text=x');
});

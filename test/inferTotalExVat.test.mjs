import test from 'node:test';
import assert from 'node:assert/strict';
import { inferTotalExVat } from '../src/parsing/inferTotalExVat.mjs';

test('prefers prioritized ex-vat signal over max currency amount', () => {
  const text = [
    'Subtotal £120.00',
    'VAT £24.00',
    'Total inc VAT £144.00',
  ].join('\n');

  const parsed = inferTotalExVat(text);
  assert.equal(parsed.value, 120);
  assert.equal(parsed.extractionConfidence, 'high');
});

test('deprioritizes vat/tax labels unless no alternatives exist', () => {
  const text = [
    'VAT total £20.00',
    'Balance due £120.00',
  ].join('\n');

  const parsed = inferTotalExVat(text);
  assert.equal(parsed.value, 20);
  assert.equal(parsed.extractionConfidence, 'low');
  assert.match(parsed.warning, /Low confidence|Unable to confidently infer/);
});

test('uses nearest known total labels when signal rank ties', () => {
  const text = [
    'Net £100.00',
    'Notes row 1',
    'Invoice total',
    'Net £90.00',
  ].join('\n');

  const parsed = inferTotalExVat(text);
  assert.equal(parsed.value, 90);
});

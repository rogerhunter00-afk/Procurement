import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferTotalExVat,
  parseItems,
  normalizeOcrText,
  parseNumber,
} from '../index.mjs';

test('root index re-exports parsing helpers', () => {
  const normalized = normalizeOcrText('Subtotal\u00A0£120,00');
  assert.match(normalized, /Subtotal £120.00/);

  const number = parseNumber('£1,250.50');
  assert.equal(number, 1250.5);

  const parsedItems = parseItems('1 x Site visit 100 100\nSubtotal 100');
  assert.equal(parsedItems.rows.length, 1);
  assert.equal(parsedItems.computedSubtotal, 100);

  const inferred = inferTotalExVat('Total ex VAT £100.00');
  assert.equal(inferred.value, 100);
});

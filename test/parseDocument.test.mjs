import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from '../src/parser.js';

test('extracts compact supplier name and focused item summary from OCR-heavy quote text', () => {
  const source = [
    'QUOTATION OP01 - 02.6 Uncontrolled When Printed Westerton Road North, Keith AB55 5FL | t: 01542 880100 | e: info@clarkandsutherland.co.uk www.clarkandsutherland.co.uk Clark & Sutherland Limited.',
    'Registered in Scotland. Company no: SC204015. Registered office: Scott Moncrieff & Co, 39 South Street, Elgin, IV30 1JZ',
    'Dear Sirs, Ref : Industrial washing machine repairs Herewith budget quotation for the repair to Industrial washing machines.',
    ': Item Description Cost 1 Washing machine repairs 1. Bearing and pulley to be removed, new seal and bearing installed.',
    '2. Rear bearing to be stripped, inspected and repaired to realign main shaft. 2 Isla bank site £880.00',
    'Above quotation is exclusive of the following • Any parts required • VAT at the current rate',
    'Yours Faithfully On behalf of Clark & Sutherland Ltd',
  ].join(' ');

  const parsed = parseDocument(source);

  assert.equal(parsed.supplier, 'Clark & Sutherland Limited');
  assert.equal(parsed.total, '£880.00');
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].description, '1 Washing machine repairs 1.');
});

test('maps parsed tabular quote data into qty/unit/line item fields', () => {
  const source = [
    'Supplier: Simply Bearings Ltd',
    'Quote: 6502669',
    '1 Dodge SC-17M Bearing Insert with 17mm Internal Diameter DODGE Please Allow 2-3 Working Days to Us £31.68 £31.68',
    'Subtotal £31.68',
  ].join('\n');

  const parsed = parseDocument(source);

  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].qty, 1);
  assert.equal(parsed.items[0].unit, 31.68);
  assert.equal(parsed.items[0].lineTotal, 31.68);
  assert.equal(parsed.total, '£31.68');
});

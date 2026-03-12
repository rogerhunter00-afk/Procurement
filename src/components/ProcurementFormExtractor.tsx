import React, { useMemo, useState } from 'react';

export type ProcurementItem = {
  description: string;
  qty: number;
  unit: number;
  line: number;
  notes: string;
};

export type ProcurementDoc = {
  supplier: string;
  reference: string;
  date: string;
  site: string;
  status: string;
  deliveryTo: string;
  equipment: string;
  notes: string;
  items: ProcurementItem[];
  totalExVat: number;
  vat: number;
  totalInc: number;
};

type Props = {
  extractedDoc: ProcurementDoc;
  vatRate?: number;
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const displayOrPlaceholder = (value: string, placeholder: string) => {
  const trimmed = value.trim();
  return trimmed ? escapeHtml(trimmed) : `<span class="placeholder">${escapeHtml(placeholder)}</span>`;
};

const recalculateFromItems = (items: ProcurementItem[], vatRate: number) => {
  const totalExVat = roundCurrency(
    items.reduce((sum, item) => sum + roundCurrency(item.qty * item.unit), 0),
  );
  const vat = roundCurrency(totalExVat * vatRate);
  const totalInc = roundCurrency(totalExVat + vat);

  return { totalExVat, vat, totalInc };
};

const buildGeneratedHtml = (doc: ProcurementDoc) => {
  const rows = doc.items
    .map(
      (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${displayOrPlaceholder(item.description, '[Part / service description]')}</td>
          <td>${item.qty.toFixed(2)}</td>
          <td>${item.unit.toFixed(2)}</td>
          <td>${displayOrPlaceholder(item.notes, '[Relevant note / exclusions / lead time / application]')}</td>
          <td>${item.line.toFixed(2)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Internal Supply Request</title>
    <style>
      @page { size: A4; margin: 8mm; }
      html,body { margin:0; background:#fff; }
      * { box-sizing:border-box; }
      :root {
        --brand:#0a2a84;
        --ink:#0b0f1a;
        --muted:#525a6b;
        --line:#d4d8e5;
        --radius:8px;
      }
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        font-size:9.5pt;
        line-height:1.3;
        color:var(--ink);
      }
      .page { width:190mm; min-height:277mm; margin:0 auto; }
      .header { display:grid; grid-template-columns:auto 1fr 60mm; gap:10px; border-bottom:2px solid var(--brand); padding-bottom:8px; align-items:flex-start; }
      .header img { max-height:18mm; max-width:70mm; object-fit:contain; }
      .title { font-size:15pt; font-weight:700; color:var(--brand); margin:0; }
      .subtitle { font-size:8.5pt; color:var(--muted); }
      .meta-table, table { width:100%; border-collapse:collapse; }
      .meta-table th, .meta-table td, th, td { border:1px solid var(--line); padding:4px 5px; text-align:left; }
      thead th, .meta-table th { background:#e3e9ff; color:var(--brand); font-weight:700; }
      .card { border:1px solid var(--line); border-radius:var(--radius); padding:6px 8px; margin-top:6px; }
      .card h2 { margin:0 0 4px 0; font-size:10.5pt; color:var(--brand); }
      .kv { display:grid; grid-template-columns:32mm 1fr; gap:4px; margin-bottom:3px; }
      .label { font-weight:600; color:var(--muted); font-size:8.6pt; }
      .num { text-align:right; }
      .placeholder { color:#7a8195; font-style:italic; }
    </style>
    </head>
    <body>
    <div class="page">
      <div class="header">
        <img src="LOGOlesswhitespace.png" alt="Aberdeen Laundry Services"/>
        <div>
          <p class="title">Internal Supply Request</p>
          <p class="subtitle">${displayOrPlaceholder(doc.reference, '[Enter request title / supplier / item / project here]')}</p>
        </div>
        <table class="meta-table">
          <tr><th>Form #</th><td>ALS-SUP-REQ</td></tr>
          <tr><th>Date</th><td>${displayOrPlaceholder(doc.date, '[dd/mm/yyyy]')}</td></tr>
          <tr><th>Site</th><td>${displayOrPlaceholder(doc.site, '[EK / MM / Keith / BY / other]')}</td></tr>
          <tr><th>Status</th><td>${displayOrPlaceholder(doc.status, '[To Order / To Approve / Retrospective Approval / Completed / etc.]')}</td></tr>
        </table>
      </div>

      <div class="card">
        <h2>Requester &amp; Supplier</h2>
        <div class="kv"><div class="label">Supplier</div><div>${displayOrPlaceholder(doc.supplier, '[Supplier name and address]')}</div></div>
        <div class="kv"><div class="label">Reference</div><div>${displayOrPlaceholder(doc.reference, '[Quote / invoice / delivery note / PO / revision / date]')}</div></div>
        <div class="kv"><div class="label">Summary</div><div>${displayOrPlaceholder(doc.notes, '[Short summary of what is being purchased or approved.]')}</div></div>
      </div>

      <div class="card">
        <h2>Delivery / Asset Details</h2>
        <div class="kv"><div class="label">Deliver To / Site Address</div><div>${displayOrPlaceholder(doc.deliveryTo, '[Delivery address or site address]')}</div></div>
        <div class="kv"><div class="label">Equipment / Asset</div><div>${displayOrPlaceholder(doc.equipment, '[Machine / asset / area / project]')}</div></div>
      </div>

      <div class="card">
        <h2>Requested / Invoiced Items</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit £ (ex VAT)</th>
              <th>Notes</th>
              <th>Line £ (ex VAT)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr><td colspan="5" class="num">Subtotal (ex VAT)</td><td class="num">${doc.totalExVat.toFixed(2)}</td></tr>
            <tr><td colspan="5" class="num">VAT @ 20%</td><td class="num">${doc.vat.toFixed(2)}</td></tr>
            <tr><td colspan="5" class="num">Total inc VAT</td><td class="num">${doc.totalInc.toFixed(2)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>
    </body>
    </html>
  `;
};

export const ProcurementFormExtractor: React.FC<Props> = ({
  extractedDoc,
  vatRate = 0.2,
}) => {
  const [doc, setDoc] = useState<ProcurementDoc>(() => ({
    ...extractedDoc,
    items: extractedDoc.items.map((item) => ({
      ...item,
      line: roundCurrency(item.qty * item.unit),
    })),
  }));

  const [isManualTotalsOverride, setIsManualTotalsOverride] = useState(false);

  const autoTotals = useMemo(
    () => recalculateFromItems(doc.items, vatRate),
    [doc.items, vatRate],
  );

  const totals = isManualTotalsOverride
    ? {
        totalExVat: doc.totalExVat,
        vat: doc.vat,
        totalInc: doc.totalInc,
      }
    : autoTotals;

  const generatedHtml = useMemo(
    () =>
      buildGeneratedHtml({
        ...doc,
        ...totals,
      }),
    [doc, totals],
  );

  const setHeaderField = (field: keyof Omit<ProcurementDoc, 'items' | 'totalExVat' | 'vat' | 'totalInc'>, value: string) => {
    setDoc((prev) => ({ ...prev, [field]: value }));
  };

  const setItemField = (
    index: number,
    field: keyof Omit<ProcurementItem, 'line'>,
    value: string,
  ) => {
    setDoc((prev) => {
      const items = prev.items.map((item, i) => {
        if (i !== index) return item;

        const next = {
          ...item,
          [field]: field === 'description' || field === 'notes' ? value : Number(value) || 0,
        } as ProcurementItem;

        return {
          ...next,
          line: roundCurrency(next.qty * next.unit),
        };
      });

      return {
        ...prev,
        items,
      };
    });
  };

  const resetToExtractedValues = () => {
    setDoc({
      ...extractedDoc,
      items: extractedDoc.items.map((item) => ({
        ...item,
        line: roundCurrency(item.qty * item.unit),
      })),
    });
    setIsManualTotalsOverride(false);
  };

  return (
    <div>
      <h2>Procurement Form Extractor</h2>

      <fieldset>
        <legend>Header</legend>
        <label>
          Supplier
          <input value={doc.supplier} onChange={(e) => setHeaderField('supplier', e.target.value)} />
        </label>
        <label>
          Reference
          <input value={doc.reference} onChange={(e) => setHeaderField('reference', e.target.value)} />
        </label>
        <label>
          Date
          <input value={doc.date} onChange={(e) => setHeaderField('date', e.target.value)} />
        </label>
        <label>
          Site
          <input value={doc.site} onChange={(e) => setHeaderField('site', e.target.value)} />
        </label>
        <label>
          Status
          <input value={doc.status} onChange={(e) => setHeaderField('status', e.target.value)} />
        </label>
        <label>
          Delivery To
          <input value={doc.deliveryTo} onChange={(e) => setHeaderField('deliveryTo', e.target.value)} />
        </label>
        <label>
          Equipment
          <input value={doc.equipment} onChange={(e) => setHeaderField('equipment', e.target.value)} />
        </label>
        <label>
          Notes
          <textarea value={doc.notes} onChange={(e) => setHeaderField('notes', e.target.value)} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Items</legend>
        {doc.items.map((item, index) => (
          <div key={index}>
            <label>
              Description
              <input
                value={item.description}
                onChange={(e) => setItemField(index, 'description', e.target.value)}
              />
            </label>
            <label>
              Qty
              <input
                type="number"
                value={item.qty}
                onChange={(e) => setItemField(index, 'qty', e.target.value)}
              />
            </label>
            <label>
              Unit
              <input
                type="number"
                value={item.unit}
                onChange={(e) => setItemField(index, 'unit', e.target.value)}
              />
            </label>
            <label>
              Notes
              <input value={item.notes} onChange={(e) => setItemField(index, 'notes', e.target.value)} />
            </label>
            <output>Line: {item.line.toFixed(2)}</output>
          </div>
        ))}
      </fieldset>

      <fieldset>
        <legend>Totals</legend>
        <label>
          <input
            type="checkbox"
            checked={isManualTotalsOverride}
            onChange={(e) => setIsManualTotalsOverride(e.target.checked)}
          />
          Manual totals override
        </label>

        <label>
          Total Ex VAT
          <input
            type="number"
            disabled={!isManualTotalsOverride}
            value={isManualTotalsOverride ? doc.totalExVat : autoTotals.totalExVat}
            onChange={(e) => setDoc((prev) => ({ ...prev, totalExVat: Number(e.target.value) || 0 }))}
          />
        </label>
        <label>
          VAT
          <input
            type="number"
            disabled={!isManualTotalsOverride}
            value={isManualTotalsOverride ? doc.vat : autoTotals.vat}
            onChange={(e) => setDoc((prev) => ({ ...prev, vat: Number(e.target.value) || 0 }))}
          />
        </label>
        <label>
          Total Inc
          <input
            type="number"
            disabled={!isManualTotalsOverride}
            value={isManualTotalsOverride ? doc.totalInc : autoTotals.totalInc}
            onChange={(e) => setDoc((prev) => ({ ...prev, totalInc: Number(e.target.value) || 0 }))}
          />
        </label>
      </fieldset>

      <button type="button" onClick={resetToExtractedValues}>
        Reset to extracted values
      </button>

      <fieldset>
        <legend>Generated HTML (derived from current doc)</legend>
        <textarea readOnly value={generatedHtml} rows={16} />
      </fieldset>
    </div>
  );
};

export default ProcurementFormExtractor;

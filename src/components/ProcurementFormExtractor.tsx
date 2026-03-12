import React, { useMemo, useState } from 'react';

type PdfJsTextItem = { str?: string };
type PdfJsTextContent = { items: PdfJsTextItem[] };
type PdfJsPage = { getTextContent: () => Promise<PdfJsTextContent> };
type PdfJsDocument = { numPages: number; getPage: (pageNumber: number) => Promise<PdfJsPage> };
type PdfJsModule = {
  getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<PdfJsDocument> };
  GlobalWorkerOptions: { workerSrc: string };
};

const PDFJS_CDN_VERSION = '4.10.38';
const PDFJS_MODULE_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_CDN_VERSION}/build/pdf.mjs`;
const PDFJS_WORKER_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_CDN_VERSION}/build/pdf.worker.mjs`;

let pdfJsLoadPromise: Promise<PdfJsModule | null> | null = null;

const loadPdfJs = async (): Promise<PdfJsModule | null> => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!pdfJsLoadPromise) {
    pdfJsLoadPromise = import(/* @vite-ignore */ PDFJS_MODULE_URL)
      .then((module) => {
        const pdfjs = module as PdfJsModule;
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return pdfjs;
      })
      .catch(() => null);
  }

  return pdfJsLoadPromise;
};

const extractPdfText = async (file: File): Promise<string> => {
  const pdfjs = await loadPdfJs();
  if (!pdfjs) {
    throw new Error('pdf.js is unavailable in this deployment.');
  }

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => item.str ?? '')
      .join(' ')
      .trim();

    pages.push(pageText);
  }

  return pages.filter(Boolean).join('\n\n');
};

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


const INLINE_LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 170" role="img" aria-label="Aberdeen Laundry Services">
    <rect width="500" height="170" fill="white"/>
    <text x="10" y="62" font-family="Arial, Helvetica, sans-serif" font-size="72" fill="#0a2a84" font-weight="700">aberdeen</text>
    <text x="10" y="128" font-family="Arial, Helvetica, sans-serif" font-size="112" fill="#0a2a84" font-weight="800">Laundry</text>
    <text x="270" y="160" font-family="Arial, Helvetica, sans-serif" font-size="64" fill="#0a2a84" font-weight="500">services</text>
  </svg>`,
)}`;

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
          <td class="num">${item.qty.toFixed(2)}</td>
          <td class="num">${item.unit.toFixed(2)}</td>
          <td>${displayOrPlaceholder(item.notes, '[Relevant note / exclusions / lead time / application]')}</td>
          <td class="num">${item.line.toFixed(2)}</td>
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
    <title>Internal Supply Request Template</title>
    <style>
      @page { size: A4; margin: 8mm; }
      html,body { margin:0; background:#fff; }
      * { box-sizing:border-box; }
      @media print {
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        table { page-break-inside:auto; }
        tr, td, th { page-break-inside: avoid; break-inside: avoid; }
        .card, .section-block { page-break-inside: avoid; break-inside: avoid; }
      }
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
      .page {
        width:190mm;
        min-height:277mm;
        margin:0 auto;
        display:flex;
        flex-direction:column;
      }
      .header {
        display:grid;
        grid-template-columns:auto 1fr 60mm;
        gap:10px;
        border-bottom:2px solid var(--brand);
        padding-bottom:8px;
        align-items:flex-start;
      }
      .header img {
        max-height:18mm;
        max-width:70mm;
        object-fit:contain;
      }
      .titlewrap { line-height:1.05; }
      .title {
        font-size:15pt;
        font-weight:700;
        color:var(--brand);
        margin:0;
      }
      .subtitle {
        font-size:8.5pt;
        color:var(--muted);
      }

      .meta-table {
        width:100%;
        border:1px solid var(--line);
        border-collapse:collapse;
        font-size:8.5pt;
      }
      .meta-table th {
        border:1px solid var(--line);
        padding:3px 5px;
        white-space:nowrap;
        background:#e3e9ff;
        text-align:left;
      }
      .meta-table td {
        border:1px solid var(--line);
        padding:3px 5px;
        white-space:normal;
      }

      .card {
        border:1px solid var(--line);
        border-radius:var(--radius);
        padding:6px 8px;
        margin-top:6px;
      }
      .card h2 {
        margin:0 0 4px 0;
        font-size:10.5pt;
        color:var(--brand);
        display:flex;
        align-items:center;
        gap:8px;
      }
      .rule { flex:1; border-bottom:1.4px solid rgba(10,42,132,.35); }

      .grid2 {
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:4px 10px;
      }
      .kv {
        display:grid;
        grid-template-columns:32mm 1fr;
        gap:4px;
        align-items:start;
      }
      .kv.full { grid-column:1 / -1; }
      .label {
        font-weight:600;
        color:var(--muted);
        font-size:8.6pt;
      }

      table {
        width:100%;
        border-collapse:collapse;
      }
      thead th {
        background:#e3e9ff;
        color:var(--brand);
        font-weight:700;
        font-size:8.6pt;
      }
      th, td {
        border:1px solid var(--line);
        padding:4px 5px;
        vertical-align:top;
        word-wrap:break-word;
        overflow-wrap:break-word;
        white-space:normal;
      }
      .num { text-align:right; }

      .bottom-row {
        display:grid;
        grid-template-columns:1fr;
        gap:6px;
        margin-top:6px;
      }
      .section-block {
        border:1px solid var(--line);
        border-radius:var(--radius);
        padding:6px 8px 4px;
      }
      .section-title {
        font-weight:700;
        color:var(--brand);
        border-bottom:1px solid rgba(10,42,132,.2);
        margin-bottom:4px;
        padding-bottom:1px;
      }
      .supplier-grid {
        display:grid;
        grid-template-columns:1.2fr 1fr;
        gap:4px 18px;
      }
      .field-label {
        font-size:8pt;
        color:var(--muted);
        margin-bottom:1px;
      }
      .line {
        border-bottom:1px solid #cbd2e6;
        height:5mm;
      }
      .tiny {
        font-size:7.5pt;
        color:var(--muted);
      }
      .placeholder {
        color:#7a8195;
        font-style:italic;
      }
    </style>
    </head>
    <body>
    <div class="page">

      <div class="header">
        <img src="${INLINE_LOGO_DATA_URI}" alt="Aberdeen Laundry Services"/>
        <div class="titlewrap">
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
        <h2>Requester &amp; Supplier <span class="rule"></span></h2>
        <div class="grid2">
          <div class="kv"><div class="label">Requester</div><div><span class="placeholder">[Name / role]</span></div></div>
          <div class="kv"><div class="label">Cost Centre</div><div><span class="placeholder">[e.g. 7701_Engineering Parts/Fabrications]</span></div></div>
          <div class="kv"><div class="label">Email</div><div><span class="placeholder">[email]</span></div></div>
          <div class="kv"><div class="label">Phone</div><div><span class="placeholder">[phone]</span></div></div>
          <div class="kv"><div class="label">Supplier</div><div>${displayOrPlaceholder(doc.supplier, '[Supplier name and address]')}</div></div>
          <div class="kv"><div class="label">Reference</div><div>${displayOrPlaceholder(doc.reference, '[Quote / invoice / delivery note / PO / revision / date]')}</div></div>
          <div class="kv full"><div class="label">Summary</div><div>${displayOrPlaceholder(doc.notes, '[Short summary of what is being purchased or approved, why, and any key context.]')}</div></div>
        </div>
      </div>

      <div class="card">
        <h2>Delivery / Asset Details <span class="rule"></span></h2>
        <div class="grid2">
          <div class="kv full"><div class="label">Deliver To / Site Address</div><div>${displayOrPlaceholder(doc.deliveryTo, '[Delivery address or site address]')}</div></div>
          <div class="kv"><div class="label">Equipment / Asset</div><div>${displayOrPlaceholder(doc.equipment, '[Machine / asset / area / project]')}</div></div>
          <div class="kv"><div class="label">Notes</div><div>${displayOrPlaceholder(doc.notes, '[Lead time / urgency / background / exclusions / install notes / retrospective context]')}</div></div>
        </div>
      </div>

      <div class="card">
        <h2>Requested / Invoiced Items <span class="rule"></span></h2>
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
        <p class="tiny" style="margin-top:3px;"><span class="placeholder">[Use this line for quotation / invoice notes, exclusions, validity period, delivery terms, or any pricing caveats.]</span></p>
      </div>

      <div class="bottom-row">
        <div class="section-block">
          <div class="section-title">Supplier &amp; Alternatives</div>
          <div class="supplier-grid">
            <div>
              <div class="field-label">Vendor Name</div>
              <div>${displayOrPlaceholder(doc.supplier, '[Primary supplier]')}</div>
            </div>
            <div>
              <div class="field-label">Reason for Selection</div>
              <div><span class="placeholder">[Why this supplier was chosen]</span></div>
            </div>
            <div>
              <div class="field-label">Alternative Supplier / Options</div>
              <div><span class="placeholder">[Alternative suppliers / OEM / other approaches]</span></div>
            </div>
            <div>
              <div class="field-label">Why Alternative Rejected</div>
              <div><span class="placeholder">[Cost / lead time / availability / compatibility / urgency / no OEM available etc.]</span></div>
            </div>
            <div>
              <div class="field-label">Criteria Used</div>
              <div><span class="placeholder">[What was considered: cost, lead time, OEM, compatibility, urgency, etc.]</span></div>
            </div>
            <div>
              <div class="field-label">Notes</div>
              <div><span class="placeholder">[Any final procurement notes, credit account form, future payment setup, retrospective context, etc.]</span></div>
            </div>
          </div>
        </div>

        <div class="section-block">
          <div class="section-title">Approvals</div>
          <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:12px;">
            <div>
              <div class="field-label">Approved by</div>
              <div class="line"></div>
            </div>
            <div>
              <div class="field-label">Signature</div>
              <div class="line"></div>
            </div>
          </div>
        </div>

        <div class="section-block">
          <div class="section-title">For Procurement / Finance Use Only</div>
          <div class="grid2" style="grid-template-columns:1fr 1fr;">
            <div><div class="field-label">Procurement Officer / Processed by</div><div class="line"></div></div>
            <div><div class="field-label">Date of Approval / Processed</div><div class="line"></div></div>
          </div>
          <div style="display:flex; gap:14px; margin-top:3px;">
            <label><span style="width:5mm; height:5mm; border:1px solid #000; display:inline-block; margin-right:3px;"></span> Approved</label>
            <label><span style="width:5mm; height:5mm; border:1px solid #000; display:inline-block; margin-right:3px;"></span> Denied</label>
            <label><span style="width:5mm; height:5mm; border:1px solid #000; display:inline-block; margin-right:3px;"></span> On Hold</label>
          </div>
          <p class="tiny" style="margin-top:3px;">Attach the relevant quote / invoice / delivery note / supporting documents when submitting this form.</p>
        </div>
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
  const [sourceText, setSourceText] = useState('');
  const [fileStatus, setFileStatus] = useState('No PDF selected.');
  const [pdfJsAvailable, setPdfJsAvailable] = useState<boolean | null>(null);

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

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFileStatus('No PDF selected.');
      return;
    }

    setFileStatus(`Loading PDF: ${file.name}...`);
    try {
      const extractedText = await extractPdfText(file);
      setSourceText(extractedText);
      setPdfJsAvailable(true);
      setFileStatus(`PDF text extraction succeeded (${file.name}, ${extractedText.length} chars).`);
    } catch (error) {
      setPdfJsAvailable(false);
      setFileStatus(
        `PDF text extraction failed for ${file.name}. You can continue with pasted text instead.`,
      );
      console.error(error);
    }
  };

  return (
    <div>
      <h2>Procurement Form Extractor</h2>

      <fieldset>
        <legend>Source Text</legend>
        <label>
          Upload PDF
          <input type="file" accept="application/pdf" onChange={onFileChange} />
        </label>
        <p>{fileStatus}</p>
        {pdfJsAvailable === false ? (
          <p>
            PDF extraction is currently unavailable; fallback input is pasted text in the box below.
          </p>
        ) : null}
        <label>
          Pasted / extracted text
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            rows={8}
          />
        </label>
      </fieldset>

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

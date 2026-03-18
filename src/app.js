import { parseDocument } from './parser.js';

const sourceTextEl = document.getElementById('sourceText');
const quoteFileEl = document.getElementById('quoteFile');
const fileStatusEl = document.getElementById('fileStatus');
const generateBtn = document.getElementById('generateBtn');
const reextractBtn = document.getElementById('reextractBtn');
const htmlFileLinkEl = document.getElementById('htmlFileLink');
const requesterPresetEl = document.getElementById('requesterPreset');
const customRequesterNameEl = document.getElementById('customRequesterName');
const customRequesterTitleEl = document.getElementById('customRequesterTitle');
const supplierFieldEl = document.getElementById('supplierField');
const referenceFieldEl = document.getElementById('referenceField');
const summaryFieldEl = document.getElementById('summaryField');
const lineItemsFieldEl = document.getElementById('lineItemsField');

let generatedBlobUrl = null;
let pdfJsLoadPromise = null;
let latestParsedDocument = parseDocument('');
let isApplyingAutoFill = false;

const PDFJS_CDN_VERSION = '4.10.38';
const PDFJS_MODULE_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_CDN_VERSION}/build/pdf.mjs`;
const PDFJS_WORKER_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_CDN_VERSION}/build/pdf.worker.mjs`;
const INLINE_LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 170" role="img" aria-label="Aberdeen Laundry Services">
    <rect width="500" height="170" fill="white"/>
    <text x="10" y="62" font-family="Arial, Helvetica, sans-serif" font-size="72" fill="#0a2a84" font-weight="700">aberdeen</text>
    <text x="10" y="128" font-family="Arial, Helvetica, sans-serif" font-size="112" fill="#0a2a84" font-weight="800">Laundry</text>
    <text x="270" y="160" font-family="Arial, Helvetica, sans-serif" font-size="64" fill="#0a2a84" font-weight="500">services</text>
  </svg>`,
)}`;

const reviewedFieldState = new Map([
  ['supplier', { el: supplierFieldEl, overridden: false, lastAutoValue: '' }],
  ['reference', { el: referenceFieldEl, overridden: false, lastAutoValue: '' }],
  ['summary', { el: summaryFieldEl, overridden: false, lastAutoValue: '' }],
  ['items', { el: lineItemsFieldEl, overridden: false, lastAutoValue: '' }],
]);

function debounce(callback, delay = 250) {
  let timeoutId = null;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      callback(...args);
    }, delay);
  };
}

async function loadPdfJs() {
  if (!pdfJsLoadPromise) {
    pdfJsLoadPromise = import(/* @vite-ignore */ PDFJS_MODULE_URL)
      .then((module) => {
        module.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return module;
      })
      .catch((error) => {
        pdfJsLoadPromise = null;
        throw error;
      });
  }

  return pdfJsLoadPromise;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function displayOrPlaceholder(value, placeholder) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? escapeHtml(trimmed) : `<span class="placeholder">${escapeHtml(placeholder)}</span>`;
}

function asCurrencyNumber(value) {
  const cleaned = String(value ?? '').replace(/[^0-9.\-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

const PRESET_REQUESTERS = {
  'jacek-lewandowski': {
    name: 'Jacek Lewandowski',
    title: 'Group Operations Manager',
  },
};

function getRequesterDetails() {
  const selectedRequester = requesterPresetEl.value;

  if (selectedRequester === 'custom') {
    return {
      name: customRequesterNameEl.value.trim(),
      title: customRequesterTitleEl.value.trim(),
    };
  }

  return PRESET_REQUESTERS[selectedRequester] ?? { name: '', title: '' };
}

function syncRequesterInputs() {
  const selectedRequester = requesterPresetEl.value;
  const isCustom = selectedRequester === 'custom';

  customRequesterNameEl.disabled = !isCustom;
  customRequesterTitleEl.disabled = !isCustom;

  if (isCustom) return;

  const preset = PRESET_REQUESTERS[selectedRequester];
  customRequesterNameEl.value = preset?.name ?? '';
  customRequesterTitleEl.value = preset?.title ?? '';
}

function inferTodayDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  return `${day}/${month}/${year}`;
}

function formatItemNotes(item) {
  if (item?.notes) {
    return item.notes;
  }

  if (item?.source === 'legacy') {
    return 'Extracted from quote text';
  }

  if (item?.source) {
    return `Pattern: ${item.source}`;
  }

  return '';
}

function serializeItems(items) {
  return (items ?? [])
    .map((item) => [
      item.description ?? '',
      item.qty ?? '',
      item.unit ?? '',
      formatItemNotes(item),
      item.lineTotal ?? '',
    ].join(' | '))
    .join('\n');
}

function parseReviewedItems(value, fallbackItems = []) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return fallbackItems;
  }

  return trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [description = '', qty = '', unit = '', notes = '', lineTotal = ''] = line.split('|').map((part) => part.trim());
      return {
        line: index + 1,
        description,
        qty: qty || null,
        unit: unit || null,
        notes,
        lineTotal: lineTotal || null,
        source: '',
      };
    });
}

function getReviewedValues(parsed) {
  const supplierState = reviewedFieldState.get('supplier');
  const referenceState = reviewedFieldState.get('reference');
  const summaryState = reviewedFieldState.get('summary');
  const itemsState = reviewedFieldState.get('items');

  return {
    supplier: supplierState?.overridden ? supplierFieldEl.value.trim() : (supplierFieldEl.value.trim() || parsed.supplier),
    referenceId: referenceState?.overridden ? referenceFieldEl.value.trim() : (referenceFieldEl.value.trim() || parsed.referenceId),
    summary: summaryState?.overridden ? summaryFieldEl.value.trim() : (summaryFieldEl.value.trim() || parsed.sourceExcerpt),
    items: itemsState?.overridden
      ? parseReviewedItems(lineItemsFieldEl.value, [])
      : parseReviewedItems(lineItemsFieldEl.value, parsed.items ?? []),
  };
}

function buildDocumentFromParse(parsed, sourceText, requester, reviewedValues = {}) {
  const selectedItems = reviewedValues.items ?? parsed.items ?? [];
  const subtotal = asCurrencyNumber(parsed.total);
  const vat = Math.round(subtotal * 0.2 * 100) / 100;
  const totalIncVat = Math.round((subtotal + vat) * 100) / 100;

  const rows = selectedItems.length
    ? selectedItems
        .map(
          (item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${displayOrPlaceholder(item.description, '[Item description]')}</td>
              <td class="num">${formatNumber(item.qty)}</td>
              <td class="num">${formatNumber(item.unit)}</td>
              <td>${displayOrPlaceholder(formatItemNotes(item), '[Notes]')}</td>
              <td class="num">${formatNumber(item.lineTotal)}</td>
            </tr>
          `,
        )
        .join('')
    : `
        <tr>
          <td>1</td>
          <td>${displayOrPlaceholder('', '[Add item description here]')}</td>
          <td class="num">-</td>
          <td class="num">-</td>
          <td>${displayOrPlaceholder('', '[Add notes here]')}</td>
          <td class="num">-</td>
        </tr>
      `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Internal Supply Request</title>
<style>
  @page { size: A4; margin: 8mm; }
  html, body { margin: 0; background: #fff; }
  * { box-sizing: border-box; }
  :root {
    --brand: #0a2a84;
    --ink: #0b0f1a;
    --muted: #525a6b;
    --line: #d4d8e5;
  }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    font-size: 9.5pt;
    line-height: 1.3;
    color: var(--ink);
  }
  .page { width: 190mm; min-height: 277mm; margin: 0 auto; }
  .header {
    display: grid;
    grid-template-columns: auto 1fr 60mm;
    gap: 10px;
    border-bottom: 2px solid var(--brand);
    padding-bottom: 8px;
    align-items: flex-start;
  }
  .header img { max-height: 18mm; max-width: 70mm; object-fit: contain; }
  .title { font-size: 15pt; font-weight: 700; color: var(--brand); margin: 0; }
  .subtitle { font-size: 8.5pt; color: var(--muted); margin: 4px 0 0; }
  .meta-table, table { width: 100%; border-collapse: collapse; }
  .meta-table th, .meta-table td, th, td {
    border: 1px solid var(--line);
    padding: 4px 5px;
    text-align: left;
  }
  thead th, .meta-table th {
    background: #e3e9ff;
    color: var(--brand);
    font-weight: 700;
  }
  .card {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 6px 8px;
    margin-top: 6px;
  }
  .card h2 { margin: 0 0 4px 0; font-size: 10.5pt; color: var(--brand); }
  .kv {
    display: grid;
    grid-template-columns: 32mm 1fr;
    gap: 4px;
    margin-bottom: 3px;
  }
  .label { font-weight: 600; color: var(--muted); font-size: 8.6pt; }
  .num { text-align: right; }
  .placeholder { color: #7a8195; font-style: italic; }
  .source {
    white-space: pre-wrap;
    border: 1px solid var(--line);
    padding: 8px;
    border-radius: 8px;
    background: #f8fafc;
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <img src="${INLINE_LOGO_DATA_URI}" alt="Aberdeen Laundry Services"/>
    <div>
      <p class="title">Internal Supply Request</p>
      <p class="subtitle">${displayOrPlaceholder(reviewedValues.referenceId ?? parsed.referenceId, '[Request title / reference]')}</p>
    </div>
    <table class="meta-table">
      <tr><th>Form #</th><td>ALS-SUP-REQ</td></tr>
      <tr><th>Date</th><td>${inferTodayDate()}</td></tr>
      <tr><th>Status</th><td>To Approve</td></tr>
      <tr><th>Source</th><td>Quote extraction</td></tr>
    </table>
  </div>

  <div class="card">
    <h2>Requester &amp; Supplier</h2>
    <div class="kv"><div class="label">Requester Name</div><div>${displayOrPlaceholder(requester.name, '[Requester name]')}</div></div>
    <div class="kv"><div class="label">Requester Title</div><div>${displayOrPlaceholder(requester.title, '[Requester job title]')}</div></div>
    <div class="kv"><div class="label">Supplier</div><div>${displayOrPlaceholder(reviewedValues.supplier ?? parsed.supplier, '[Supplier name]')}</div></div>
    <div class="kv"><div class="label">Reference</div><div>${displayOrPlaceholder(reviewedValues.referenceId ?? parsed.referenceId, '[Quote/Invoice reference]')}</div></div>
    <div class="kv"><div class="label">Summary</div><div>${displayOrPlaceholder(reviewedValues.summary ?? parsed.sourceExcerpt, '[Add summary]')}</div></div>
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
        <tr><td colspan="5" class="num">Subtotal (ex VAT)</td><td class="num">${subtotal.toFixed(2)}</td></tr>
        <tr><td colspan="5" class="num">VAT @ 20%</td><td class="num">${vat.toFixed(2)}</td></tr>
        <tr><td colspan="5" class="num">Total inc VAT</td><td class="num">${totalIncVat.toFixed(2)}</td></tr>
      </tfoot>
    </table>
  </div>

  <div class="card">
    <h2>Source quote text</h2>
    <div class="source">${displayOrPlaceholder(sourceText, '[No source text provided]')}</div>
  </div>
</div>
</body>
</html>`;
}

function applyAutoValue(fieldKey, nextValue, force = false) {
  const fieldState = reviewedFieldState.get(fieldKey);
  if (!fieldState) return;

  fieldState.lastAutoValue = nextValue;
  if (fieldState.overridden && !force) {
    return;
  }

  isApplyingAutoFill = true;
  fieldState.el.value = nextValue;
  fieldState.overridden = false;
  isApplyingAutoFill = false;
}

function updateReviewedFieldsFromParse(parsed, { force = false } = {}) {
  applyAutoValue('supplier', parsed.supplier ?? '', force);
  applyAutoValue('reference', parsed.referenceId ?? '', force);
  applyAutoValue('summary', parsed.sourceExcerpt ?? '', force);
  applyAutoValue('items', serializeItems(parsed.items ?? []), force);
}

function refreshParsedPreview({ force = false } = {}) {
  latestParsedDocument = parseDocument(sourceTextEl.value.trim());
  updateReviewedFieldsFromParse(latestParsedDocument, { force });
}

const debouncedRefreshParsedPreview = debounce(() => refreshParsedPreview(), 300);

function setFileLinkDisabledState(isDisabled) {
  if (isDisabled) {
    htmlFileLinkEl.classList.add('disabled');
    htmlFileLinkEl.setAttribute('aria-disabled', 'true');
    htmlFileLinkEl.removeAttribute('href');
    return;
  }

  htmlFileLinkEl.classList.remove('disabled');
  htmlFileLinkEl.setAttribute('aria-disabled', 'false');
}

function updateGeneratedFileLink(html) {
  if (generatedBlobUrl) {
    URL.revokeObjectURL(generatedBlobUrl);
    generatedBlobUrl = null;
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  generatedBlobUrl = URL.createObjectURL(blob);
  htmlFileLinkEl.href = generatedBlobUrl;
  htmlFileLinkEl.download = 'procurement-request.html';
  setFileLinkDisabledState(false);
}

async function readUploadedText(file) {
  const isTextLike = file.type.startsWith('text/') || /\.(txt|csv|md)$/i.test(file.name);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (isTextLike) {
    fileStatusEl.textContent = `Reading ${file.name}...`;
    const text = await file.text();
    sourceTextEl.value = text;
    sourceTextEl.dispatchEvent(new Event('input', { bubbles: true }));
    fileStatusEl.textContent = `Loaded ${file.name} (${text.length} characters).`;
    return;
  }

  if (isPdf) {
    fileStatusEl.textContent = `Extracting text from ${file.name}...`;
    const pdfjs = await loadPdfJs();
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;

    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const rows = textContent.items
        .map((item) => ({
          text: (item.str ?? '').trim(),
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0,
        }))
        .filter((item) => item.text);

      rows.sort((a, b) => {
        const yDiff = b.y - a.y;
        if (Math.abs(yDiff) > 1.5) return yDiff;
        return a.x - b.x;
      });

      const grouped = [];
      for (const row of rows) {
        const lastGroup = grouped[grouped.length - 1];
        if (!lastGroup || Math.abs(lastGroup.y - row.y) > 1.5) {
          grouped.push({ y: row.y, cells: [row] });
        } else {
          lastGroup.cells.push(row);
        }
      }

      const pageText = grouped
        .map((group) => group.cells.sort((a, b) => a.x - b.x).map((cell) => cell.text).join(' '))
        .join('\n')
        .trim();

      pages.push(pageText);
    }

    const extractedText = pages.filter(Boolean).join('\n\n');
    sourceTextEl.value = extractedText;
    sourceTextEl.dispatchEvent(new Event('input', { bubbles: true }));
    fileStatusEl.textContent = `Loaded ${file.name} (${extractedText.length} characters extracted from PDF).`;
    return;
  }

  fileStatusEl.textContent = `"${file.name}" is not a supported file type. Please upload TXT/CSV/MD/PDF or paste text manually.`;
}

quoteFileEl.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    fileStatusEl.textContent = 'No file selected yet.';
    return;
  }

  try {
    await readUploadedText(file);
  } catch (error) {
    fileStatusEl.textContent = `Could not read ${file.name}. Please paste text manually.`;
    console.error(error);
  }
});

sourceTextEl.addEventListener('input', () => {
  debouncedRefreshParsedPreview();
});

for (const fieldState of reviewedFieldState.values()) {
  fieldState.el.addEventListener('input', () => {
    if (isApplyingAutoFill) {
      return;
    }

    fieldState.overridden = true;
  });
}

reextractBtn.addEventListener('click', () => {
  refreshParsedPreview({ force: true });
});

generateBtn.addEventListener('click', () => {
  const sourceText = sourceTextEl.value.trim();
  latestParsedDocument = parseDocument(sourceText);
  const requester = getRequesterDetails();
  const reviewedValues = getReviewedValues(latestParsedDocument);
  const generatedHtml = buildDocumentFromParse(latestParsedDocument, sourceText, requester, reviewedValues);
  updateGeneratedFileLink(generatedHtml);
});

window.addEventListener('beforeunload', () => {
  if (generatedBlobUrl) {
    URL.revokeObjectURL(generatedBlobUrl);
  }
});

sourceTextEl.value = `Supplier: Apex Industrial LLC
Quote: Q-2024-0930
Date: 2024-09-30
Widget A | Qty 4 | Unit Price $120.00 | Amount $480.00
Widget B | Qty 2 | Unit Price $95.00 | Amount $190.00
Total: $670.00`;

requesterPresetEl.addEventListener('change', syncRequesterInputs);
syncRequesterInputs();
refreshParsedPreview({ force: true });

setFileLinkDisabledState(true);

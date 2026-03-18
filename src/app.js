import { parseDocument } from './parser.js';

const sourceTextEl = document.getElementById('sourceText');
const quoteFileEl = document.getElementById('quoteFile');
const fileStatusEl = document.getElementById('fileStatus');
const generateBtn = document.getElementById('generateBtn');
const htmlFileLinkEl = document.getElementById('htmlFileLink');
const requesterPresetEl = document.getElementById('requesterPreset');
const customRequesterNameEl = document.getElementById('customRequesterName');
const customRequesterTitleEl = document.getElementById('customRequesterTitle');
const reviewStatusEl = document.getElementById('reviewStatus');
const reviewFieldsEl = document.getElementById('reviewFields');
const reviewItemsEl = document.getElementById('reviewItems');
const reviewWarningsEl = document.getElementById('reviewWarnings');
const acceptParsedBtn = document.getElementById('acceptParsedBtn');
const resetReviewBtn = document.getElementById('resetReviewBtn');
const addItemBtn = document.getElementById('addItemBtn');

let generatedBlobUrl = null;
let pdfJsLoadPromise = null;
let latestParsed = createParsedFallback();
let reviewForm = createReviewFormFromParsed(latestParsed);
let reviewAccepted = false;
let reviewEditState = createEditState();

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

const PRESET_REQUESTERS = {
  'jacek-lewandowski': {
    name: 'Jacek Lewandowski',
    title: 'Group Operations Manager',
  },
};

const FIELD_DEFINITIONS = [
  {
    key: 'supplier',
    label: 'Supplier',
    placeholder: 'Enter supplier name',
    prompt: 'Supplier missing — enter the supplier name before generating.',
    mediumNote: 'Supplier was inferred indirectly. Please review the extracted value.',
    highNote: 'Supplier was found with a strong match and can be used as-is.',
  },
  {
    key: 'referenceId',
    label: 'Reference',
    placeholder: 'Enter quote, PO, or invoice reference',
    prompt: 'Reference missing — add a quote, PO, or invoice identifier if available.',
    mediumNote: 'Reference looks plausible, but it should be checked before generation.',
    highNote: 'Reference was found with an explicit quote or invoice label.',
  },
  {
    key: 'total',
    label: 'Total (ex VAT)',
    placeholder: 'Enter ex-VAT total',
    prompt: 'Total missing — enter the amount to continue with confidence.',
    mediumNote: 'Total was inferred from fallback logic. Confirm the ex-VAT amount.',
    highNote: 'Total was found with a strong total label and is ready to use.',
  },
];

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

function formatAmountInput(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (/^[£$€]/.test(trimmed)) return trimmed;
  const numeric = Number.parseFloat(trimmed.replace(/,/g, ''));
  return Number.isFinite(numeric) ? numeric.toFixed(2) : trimmed;
}

function inferTodayDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  return `${day}/${month}/${year}`;
}

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

function buildDocumentFromParse(parsed, sourceText, requester) {
  const subtotal = asCurrencyNumber(parsed.total);
  const vat = Math.round(subtotal * 0.2 * 100) / 100;
  const totalIncVat = Math.round((subtotal + vat) * 100) / 100;

  const rows = (parsed.items ?? []).length
    ? parsed.items
        .map(
          (item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${displayOrPlaceholder(item.description, '[Item description]')}</td>
              <td class="num">${formatNumber(item.qty)}</td>
              <td class="num">${formatNumber(item.unit)}</td>
              <td>${displayOrPlaceholder(item.source === 'legacy' ? 'Extracted from quote text' : item.source === 'manual' ? 'Reviewed manually' : `Pattern: ${item.source}`, '[Notes]')}</td>
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
      <p class="subtitle">${displayOrPlaceholder(parsed.referenceId, '[Request title / reference]')}</p>
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
    <div class="kv"><div class="label">Supplier</div><div>${displayOrPlaceholder(parsed.supplier, '[Supplier name]')}</div></div>
    <div class="kv"><div class="label">Reference</div><div>${displayOrPlaceholder(parsed.referenceId, '[Quote/Invoice reference]')}</div></div>
    <div class="kv"><div class="label">Summary</div><div>Reviewed quote extraction from uploaded/pasted source text.</div></div>
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

function createParsedFallback() {
  return {
    supplier: '',
    referenceId: '',
    total: '',
    items: [],
    warnings: [],
    valid: false,
  };
}

function createEmptyItem(source = 'manual') {
  return {
    line: null,
    description: '',
    qty: '',
    unit: '',
    lineTotal: '',
    source,
  };
}

function normalizeItemForForm(item = {}) {
  return {
    line: item.line ?? null,
    description: String(item.description ?? '').trim(),
    qty: item.qty ?? '',
    unit: item.unit ?? '',
    lineTotal: item.lineTotal ?? '',
    source: item.source ?? 'manual',
  };
}

function createReviewFormFromParsed(parsed) {
  return {
    supplier: String(parsed.supplier ?? '').trim(),
    referenceId: String(parsed.referenceId ?? '').trim(),
    total: String(parsed.total ?? '').trim(),
    items: (parsed.items?.length ? parsed.items : [createEmptyItem()]).map(normalizeItemForForm),
  };
}

function createEditState() {
  return {
    supplier: false,
    referenceId: false,
    total: false,
    items: false,
  };
}

function mergeReviewForm(parsed) {
  const parsedForm = createReviewFormFromParsed(parsed);
  return {
    supplier: reviewEditState.supplier ? reviewForm.supplier : parsedForm.supplier,
    referenceId: reviewEditState.referenceId ? reviewForm.referenceId : parsedForm.referenceId,
    total: reviewEditState.total ? reviewForm.total : parsedForm.total,
    items: reviewEditState.items ? reviewForm.items.map(normalizeItemForForm) : parsedForm.items,
  };
}

function getParsedWarningsForField(field) {
  return (latestParsed.warnings ?? []).filter((warning) => warning.field === field);
}

function scalarValueWasEdited(field) {
  const originalValue = String(latestParsed?.[field] ?? '').trim();
  const currentValue = String(reviewForm?.[field] ?? '').trim();
  return originalValue !== currentValue;
}

function parsedItemsSnapshot() {
  return JSON.stringify((latestParsed.items ?? []).map(normalizeItemForForm));
}

function formItemsSnapshot() {
  return JSON.stringify((reviewForm.items ?? []).map(normalizeItemForForm));
}

function itemsWereEdited() {
  return parsedItemsSnapshot() !== formItemsSnapshot();
}

function inferScalarConfidence(field) {
  const value = String(latestParsed?.[field] ?? '').trim();
  const warnings = getParsedWarningsForField(field);
  const hasValue = Boolean(value);
  const sourceText = sourceTextEl.value;

  if (field !== 'referenceId' && warnings.length) {
    return 'low';
  }

  if (!hasValue) {
    return field === 'referenceId' ? 'low' : 'low';
  }

  if (field === 'supplier') {
    return /^(supplier|from)\s*[:\-]/im.test(sourceText) ? 'high' : 'medium';
  }

  if (field === 'referenceId') {
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b(po|invoice|quote|ref(?:erence)?)\\b\\s*[:#-]?\\s*${escapedValue}`, 'i').test(sourceText)
      ? 'high'
      : 'medium';
  }

  if (field === 'total') {
    const explicitTotal = /(total|amount due|grand total)\b/i.test(sourceText);
    return explicitTotal ? 'high' : 'medium';
  }

  return 'medium';
}

function inferItemsConfidence() {
  const warnings = getParsedWarningsForField('items');
  if (warnings.length) return 'low';
  if (!(latestParsed.items ?? []).length) return 'low';
  const allStructured = latestParsed.items.every((item) => item.source && item.source !== 'legacy' && item.lineTotal !== null);
  return allStructured ? 'high' : 'medium';
}

function deriveFieldAssessment(field) {
  const definition = FIELD_DEFINITIONS.find((item) => item.key === field);
  const warningCodes = getParsedWarningsForField(field).map((warning) => warning.code);
  const manuallyEdited = scalarValueWasEdited(field);
  const currentValue = String(reviewForm[field] ?? '').trim();

  if (manuallyEdited && currentValue) {
    return {
      state: 'reviewed',
      label: 'Reviewed',
      note: 'You updated this value manually. It will be used for file generation.',
      warningCodes,
    };
  }

  const confidence = inferScalarConfidence(field);
  if (confidence === 'high') {
    return { state: 'high', label: 'High confidence', note: definition.highNote, warningCodes };
  }

  if (confidence === 'medium') {
    return { state: 'medium', label: 'Review', note: definition.mediumNote, warningCodes };
  }

  return { state: 'low', label: 'Needs input', note: definition.prompt, warningCodes };
}

function deriveItemsAssessment() {
  const warningCodes = getParsedWarningsForField('items').map((warning) => warning.code);
  if (itemsWereEdited() && reviewForm.items.some((item) => String(item.description ?? '').trim())) {
    return {
      state: 'reviewed',
      label: 'Reviewed',
      note: 'You edited the extracted item rows. These reviewed rows will be used for generation.',
      warningCodes,
    };
  }

  const confidence = inferItemsConfidence();
  if (confidence === 'high') {
    return {
      state: 'high',
      label: 'High confidence',
      note: 'Item rows were extracted from structured patterns and can be accepted as-is.',
      warningCodes,
    };
  }

  if (confidence === 'medium') {
    return {
      state: 'medium',
      label: 'Review',
      note: 'Some item rows came from fallback parsing. Review the descriptions and totals.',
      warningCodes,
    };
  }

  return {
    state: 'low',
    label: 'Needs input',
    note: 'No reliable item rows were extracted. Add at least one row manually.',
    warningCodes,
  };
}

function renderFieldCards() {
  reviewFieldsEl.innerHTML = FIELD_DEFINITIONS.map((field) => {
    const assessment = deriveFieldAssessment(field.key);
    return `
      <article class="review-card state-${assessment.state}">
        <div class="review-card-header">
          <h4>${escapeHtml(field.label)}</h4>
          <span class="badge badge-${assessment.state}">${escapeHtml(assessment.label)}</span>
        </div>
        <input
          type="text"
          data-field="${escapeHtml(field.key)}"
          value="${escapeHtml(reviewForm[field.key] ?? '')}"
          placeholder="${escapeHtml(field.placeholder)}"
        />
        <p class="review-note">${escapeHtml(assessment.note)}</p>
        <div class="review-badges">
          ${assessment.warningCodes.map((code) => `<span class="warning-code">${escapeHtml(code)}</span>`).join('')}
        </div>
      </article>
    `;
  }).join('');
}

function renderItems() {
  const itemsAssessment = deriveItemsAssessment();
  const rows = reviewForm.items.length ? reviewForm.items : [createEmptyItem()];

  reviewItemsEl.innerHTML = rows.map((item, index) => {
    const isManual = item.source === 'manual';
    const isLegacy = item.source === 'legacy';
    const rowState = !String(item.description ?? '').trim()
      ? 'low'
      : isManual || isLegacy
        ? itemsAssessment.state === 'high' ? 'medium' : itemsAssessment.state
        : 'high';
    const rowLabel = !String(item.description ?? '').trim()
      ? 'Needs input'
      : isManual
        ? 'Manual'
        : isLegacy
          ? 'Fallback parse'
          : 'Structured parse';

    return `
      <article class="review-item-row state-${rowState}">
        <div class="review-card-header">
          <h4>Row ${index + 1}</h4>
          <span class="badge badge-${rowState}">${escapeHtml(rowLabel)}</span>
        </div>
        <div class="review-item-grid">
          <div>
            <label for="item-description-${index}">Description</label>
            <input id="item-description-${index}" type="text" data-item-index="${index}" data-item-field="description" value="${escapeHtml(item.description ?? '')}" placeholder="Item description" />
          </div>
          <div>
            <label for="item-qty-${index}">Qty</label>
            <input id="item-qty-${index}" type="number" step="any" data-item-index="${index}" data-item-field="qty" value="${escapeHtml(item.qty ?? '')}" placeholder="Qty" />
          </div>
          <div>
            <label for="item-unit-${index}">Unit</label>
            <input id="item-unit-${index}" type="number" step="any" data-item-index="${index}" data-item-field="unit" value="${escapeHtml(item.unit ?? '')}" placeholder="Unit price" />
          </div>
          <div>
            <label for="item-total-${index}">Line total</label>
            <input id="item-total-${index}" type="number" step="any" data-item-index="${index}" data-item-field="lineTotal" value="${escapeHtml(item.lineTotal ?? '')}" placeholder="Line total" />
          </div>
        </div>
        <div class="review-item-meta">
          <p class="review-note">${escapeHtml(!String(item.description ?? '').trim() ? 'Add the missing item details for this row.' : isLegacy ? 'This row came from a fallback parser path and should be checked.' : isManual ? 'This row was added or edited manually.' : 'This row came from a structured parse and is ready to use.')}</p>
          <div class="review-row-actions">
            <span class="warning-code">${escapeHtml(item.source ?? 'manual')}</span>
            <button type="button" class="ghost-btn" data-remove-item="${index}">Remove</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  const statusSummary = reviewAccepted
    ? 'Extracted values accepted. You can still edit any field before generating the file.'
    : `${itemsAssessment.note}`;

  reviewStatusEl.textContent = sourceTextEl.value.trim()
    ? statusSummary
    : 'Paste or upload quote text to see extracted fields and warnings.';
  reviewStatusEl.classList.toggle('reviewed', reviewAccepted && Boolean(sourceTextEl.value.trim()));
}

function renderWarnings() {
  const warnings = latestParsed.warnings ?? [];
  if (!sourceTextEl.value.trim()) {
    reviewWarningsEl.innerHTML = '<li>No source text yet. Parser warnings will appear here after extraction.</li>';
    return;
  }

  if (!warnings.length) {
    reviewWarningsEl.innerHTML = '<li><span class="warning-severity low">OK</span>No parser warnings. The extraction looks complete.</li>';
    return;
  }

  reviewWarningsEl.innerHTML = warnings.map((warning) => `
    <li>
      <span class="warning-severity ${escapeHtml(warning.severity)}">${escapeHtml(warning.severity)}</span>
      ${escapeHtml(warning.message)}
      <div class="warning-code-list"><span class="warning-code">${escapeHtml(warning.code)}</span></div>
    </li>
  `).join('');
}

function renderReviewPanel() {
  renderFieldCards();
  renderItems();
  renderWarnings();
}

function reparseSourceIntoReview() {
  const sourceText = sourceTextEl.value.trim();
  latestParsed = sourceText ? parseDocument(sourceText) : createParsedFallback();
  reviewForm = mergeReviewForm(latestParsed);
  reviewAccepted = false;
  renderReviewPanel();
}

function sanitizeNumericField(value) {
  if (value === '' || value === null || value === undefined) return null;
  const normalized = Number.parseFloat(String(value));
  return Number.isFinite(normalized) ? normalized : null;
}

function getReviewedParsedData() {
  const items = (reviewForm.items ?? [])
    .map((item, index) => ({
      line: index + 1,
      description: String(item.description ?? '').trim(),
      qty: sanitizeNumericField(item.qty),
      unit: sanitizeNumericField(item.unit),
      lineTotal: sanitizeNumericField(item.lineTotal),
      source: item.source ?? 'manual',
    }))
    .filter((item) => item.description || item.qty !== null || item.unit !== null || item.lineTotal !== null);

  return {
    ...latestParsed,
    supplier: String(reviewForm.supplier ?? '').trim(),
    referenceId: String(reviewForm.referenceId ?? '').trim(),
    total: formatAmountInput(reviewForm.total),
    items,
  };
}

async function readUploadedText(file) {
  const isTextLike = file.type.startsWith('text/') || /\.(txt|csv|md)$/i.test(file.name);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (isTextLike) {
    fileStatusEl.textContent = `Reading ${file.name}...`;
    const text = await file.text();
    sourceTextEl.value = text;
    reparseSourceIntoReview();
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
    reparseSourceIntoReview();
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
  reparseSourceIntoReview();
});

reviewFieldsEl.addEventListener('change', (event) => {
  const field = event.target.dataset.field;
  if (!field) return;
  reviewForm[field] = event.target.value;
  reviewEditState[field] = true;
  reviewAccepted = false;
  renderReviewPanel();
});

reviewItemsEl.addEventListener('change', (event) => {
  const { itemIndex, itemField } = event.target.dataset;
  if (itemIndex === undefined || !itemField) return;
  const index = Number.parseInt(itemIndex, 10);
  if (!Number.isInteger(index) || !reviewForm.items[index]) return;
  reviewForm.items[index][itemField] = event.target.value;
  reviewForm.items[index].source = 'manual';
  reviewEditState.items = true;
  reviewAccepted = false;
  renderReviewPanel();
});

reviewItemsEl.addEventListener('click', (event) => {
  const removeIndex = event.target.dataset.removeItem;
  if (removeIndex === undefined) return;
  const index = Number.parseInt(removeIndex, 10);
  reviewForm.items.splice(index, 1);
  if (!reviewForm.items.length) {
    reviewForm.items = [createEmptyItem()];
  }
  reviewEditState.items = true;
  reviewAccepted = false;
  renderReviewPanel();
});

addItemBtn.addEventListener('click', () => {
  reviewForm.items.push(createEmptyItem());
  reviewEditState.items = true;
  reviewAccepted = false;
  renderReviewPanel();
});

acceptParsedBtn.addEventListener('click', () => {
  reviewAccepted = true;
  renderReviewPanel();
});

resetReviewBtn.addEventListener('click', () => {
  reviewEditState = createEditState();
  reviewForm = createReviewFormFromParsed(latestParsed);
  reviewAccepted = false;
  renderReviewPanel();
});

generateBtn.addEventListener('click', () => {
  const sourceText = sourceTextEl.value.trim();
  const parsed = getReviewedParsedData();
  const requester = getRequesterDetails();
  const generatedHtml = buildDocumentFromParse(parsed, sourceText, requester);
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
reviewEditState = createEditState();
reparseSourceIntoReview();
setFileLinkDisabledState(true);

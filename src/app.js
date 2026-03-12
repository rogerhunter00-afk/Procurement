import { parseDocument } from './parser.js';

const sourceTextEl = document.getElementById('sourceText');
const quoteFileEl = document.getElementById('quoteFile');
const fileStatusEl = document.getElementById('fileStatus');
const generateBtn = document.getElementById('generateBtn');
const htmlFileLinkEl = document.getElementById('htmlFileLink');

let generatedBlobUrl = null;
let pdfJsLoadPromise = null;

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

function inferTodayDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear());
  return `${day}/${month}/${year}`;
}

function buildDocumentFromParse(parsed, sourceText) {
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
              <td class="num">-</td>
              <td class="num">-</td>
              <td>${displayOrPlaceholder('Extracted from quote text', '[Notes]')}</td>
              <td class="num">-</td>
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
    <div class="kv"><div class="label">Supplier</div><div>${displayOrPlaceholder(parsed.supplier, '[Supplier name]')}</div></div>
    <div class="kv"><div class="label">Reference</div><div>${displayOrPlaceholder(parsed.referenceId, '[Quote/Invoice reference]')}</div></div>
    <div class="kv"><div class="label">Summary</div><div>Auto-generated from uploaded/pasted quote text.</div></div>
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

async function readUploadedText(file) {
  const isTextLike = file.type.startsWith('text/') || /\.(txt|csv|md)$/i.test(file.name);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (isTextLike) {
    fileStatusEl.textContent = `Reading ${file.name}...`;
    const text = await file.text();
    sourceTextEl.value = text;
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
      const pageText = textContent.items
        .map((item) => item.str ?? '')
        .join(' ')
        .trim();

      pages.push(pageText);
    }

    const extractedText = pages.filter(Boolean).join('\n\n');
    sourceTextEl.value = extractedText;
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

generateBtn.addEventListener('click', () => {
  const sourceText = sourceTextEl.value.trim();
  const parsed = parseDocument(sourceText);
  const generatedHtml = buildDocumentFromParse(parsed, sourceText);
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

setFileLinkDisabledState(true);

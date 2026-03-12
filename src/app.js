import { parseDocument } from './parser.js';

const sourceTextEl = document.getElementById('sourceText');
const parseBtn = document.getElementById('parseBtn');
const outputEl = document.getElementById('output');
const warningsPanel = document.getElementById('warningsPanel');
const warningsList = document.getElementById('warningsList');
const excerptPanel = document.getElementById('excerptPanel');
const sourceExcerpt = document.getElementById('sourceExcerpt');

function renderWarnings(warnings) {
  warningsList.innerHTML = '';

  if (!warnings.length) {
    warningsPanel.classList.add('hidden');
    return;
  }

  warningsPanel.classList.remove('hidden');

  for (const warning of warnings) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${warning.code}</strong>: ${warning.message} <em>(field: ${warning.field}, severity: ${warning.severity})</em>`;
    warningsList.appendChild(li);
  }
}

function renderExcerpt(text) {
  const excerpt = text?.trim();
  if (!excerpt) {
    excerptPanel.classList.add('hidden');
    sourceExcerpt.textContent = '';
    return;
  }

  excerptPanel.classList.remove('hidden');
  sourceExcerpt.textContent = excerpt;
}

parseBtn.addEventListener('click', () => {
  const parsed = parseDocument(sourceTextEl.value);
  outputEl.textContent = JSON.stringify(parsed, null, 2);
  renderWarnings(parsed.warnings ?? []);
  renderExcerpt(parsed.sourceExcerpt);
});

sourceTextEl.value = `Supplier: Apex Industrial LLC
Invoice: INV-2024-0930
Date: 2024-09-30
Widget A | Qty 4 | Unit Price $120.00 | Amount $480.00
Widget B | Qty 2 | Unit Price $95.00 | Amount $190.00
Total: $670.00

Confidentiality notice: this message and any attachments are confidential.
Please consider the environment before printing this email.`;

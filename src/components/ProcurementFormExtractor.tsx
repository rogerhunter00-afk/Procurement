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
          <td>${item.description}</td>
          <td>${item.qty.toFixed(2)}</td>
          <td>${item.unit.toFixed(2)}</td>
          <td>${item.line.toFixed(2)}</td>
          <td>${item.notes}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <section>
      <h1>Procurement Form</h1>
      <p><strong>Supplier:</strong> ${doc.supplier}</p>
      <p><strong>Reference:</strong> ${doc.reference}</p>
      <p><strong>Date:</strong> ${doc.date}</p>
      <p><strong>Site:</strong> ${doc.site}</p>
      <p><strong>Status:</strong> ${doc.status}</p>
      <p><strong>Delivery To:</strong> ${doc.deliveryTo}</p>
      <p><strong>Equipment:</strong> ${doc.equipment}</p>
      <p><strong>Notes:</strong> ${doc.notes}</p>

      <table>
        <thead>
          <tr>
            <th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th>Line</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <p><strong>Total Ex VAT:</strong> ${doc.totalExVat.toFixed(2)}</p>
      <p><strong>VAT:</strong> ${doc.vat.toFixed(2)}</p>
      <p><strong>Total Inc:</strong> ${doc.totalInc.toFixed(2)}</p>
    </section>
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

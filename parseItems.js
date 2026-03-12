function normalizeOcrText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[\u00A0\t]+/g, " ")
    .replace(/\b([€$£])\s+(\d)/g, "$1$2")
    .replace(/\b(USD|EUR|GBP)\s+(\d)/gi, "$1 $2")
    .replace(/(\d),(\d{2})\b/g, "$1.$2")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseNumber(raw) {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(/,(\d{2})\b/g, ".$1");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parseDocumentSubtotal(lines) {
  for (const line of lines) {
    const match = line.match(/\b(?:sub\s*total|subtotal|total\s*before\s*tax)\b[^\d-]*(-?[\d.,]+)\b/i);
    if (match) {
      const subtotal = parseNumber(match[1]);
      if (subtotal !== null) return subtotal;
    }
  }
  return null;
}

function parseQtyXPattern(line) {
  const match = line.match(/^\s*(\d+(?:[.,]\d+)?)\s*[x×]\s+(.+?)\s+(-?[\d.,]+)\s+(-?[\d.,]+)\s*$/i);
  if (!match) return null;

  const qty = parseNumber(match[1]);
  const unit = parseNumber(match[3]);
  const total = parseNumber(match[4]);
  if (qty === null || unit === null || total === null) return null;

  return {
    qty,
    description: match[2].trim(),
    unit,
    line: total,
    source: "qty_x"
  };
}

function parseTabularPattern(line) {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 4) return null;

  const maybeLine = parseNumber(tokens[tokens.length - 1]);
  const maybeUnit = parseNumber(tokens[tokens.length - 2]);
  if (maybeLine === null || maybeUnit === null) return null;

  let qty = null;
  let descriptionStart = 0;
  const leadingQty = parseNumber(tokens[0]);
  if (leadingQty !== null) {
    qty = leadingQty;
    descriptionStart = 1;
  }

  const descriptionEnd = tokens.length - 2;
  const description = tokens.slice(descriptionStart, descriptionEnd).join(" ").trim();
  if (!description) return null;

  return {
    qty: qty ?? 1,
    description,
    unit: maybeUnit,
    line: maybeLine,
    source: "tabular"
  };
}

function parseDescriptionOnlyPattern(line, nextLine) {
  if (!nextLine) return null;

  if (/\d/.test(line) || !/[a-z]/i.test(line)) return null;

  const match = nextLine.match(/^\s*(?:(\d+(?:[.,]\d+)?)\s+)?(-?[\d.,]+)\s+(-?[\d.,]+)\s*$/);
  if (!match) return null;

  const qty = parseNumber(match[1]) ?? 1;
  const unit = parseNumber(match[2]);
  const total = parseNumber(match[3]);
  if (unit === null || total === null) return null;

  return {
    qty,
    description: line.trim(),
    unit,
    line: total,
    source: "description_continuation"
  };
}

function parseFallbackSingleLine(line) {
  const match = line.match(/^\s*(?:(\d+(?:[.,]\d+)?)\s+)?(.+?)\s+(-?[\d.,]+)\s*$/);
  if (!match) return null;

  const qty = parseNumber(match[1]) ?? 1;
  const lineTotal = parseNumber(match[3]);
  if (lineTotal === null) return null;

  return {
    qty,
    description: match[2].trim(),
    unit: null,
    line: lineTotal,
    source: "fallback"
  };
}

function parseItems(text) {
  const normalized = normalizeOcrText(text || "");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const structuredRows = [];
  const consumed = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    if (consumed.has(i)) continue;
    const line = lines[i];

    const qtyX = parseQtyXPattern(line);
    if (qtyX) {
      structuredRows.push(qtyX);
      consumed.add(i);
      continue;
    }

    const tabular = parseTabularPattern(line);
    if (tabular) {
      structuredRows.push(tabular);
      consumed.add(i);
      continue;
    }

    const continuation = parseDescriptionOnlyPattern(line, lines[i + 1]);
    if (continuation) {
      structuredRows.push(continuation);
      consumed.add(i);
      consumed.add(i + 1);
    }
  }

  const rows = structuredRows.length
    ? structuredRows
    : lines
        .map((line) => parseFallbackSingleLine(line))
        .filter(Boolean);

  const computedSubtotal = rows.reduce((sum, row) => sum + (row.line || 0), 0);
  const detectedSubtotal = parseDocumentSubtotal(lines);

  return {
    rows,
    structured: structuredRows.length > 0,
    computedSubtotal,
    detectedSubtotal,
    subtotalMismatch:
      detectedSubtotal !== null && Math.abs(computedSubtotal - detectedSubtotal) > 0.01
  };
}

module.exports = {
  parseItems,
  normalizeOcrText,
  parseNumber
};

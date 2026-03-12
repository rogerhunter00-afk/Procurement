/** @typedef {'high'|'medium'|'low'} ExtractionConfidence */

/**
 * @typedef {Object} ParsedTotalExVat
 * @property {number|null} value
 * @property {ExtractionConfidence} extractionConfidence
 * @property {string=} warning
 * @property {string=} matchedLabel
 */

const PRIORITIZED_LABELS = [
  { pattern: /total\s*ex\s*vat/i, rank: 100 },
  { pattern: /subtotal|sub\s*total/i, rank: 95 },
  { pattern: /goods\s*total/i, rank: 92 },
  { pattern: /net\s*(total|amount)?/i, rank: 88 },
  { pattern: /total\s*before\s*(vat|tax)/i, rank: 86 },
  { pattern: /amount\s*ex\s*vat/i, rank: 84 },
];

const KNOWN_TOTAL_LABELS = /(total|invoice\s*total|amount\s*due|balance\s*due)/i;
const DEPRIORITIZED_LABELS = /(inc\s*vat|including\s*vat|\bvat\b|\btax\b|balance\s*due)/i;
const CURRENCY_RE = /(?:[$£€])?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})|(?:[$£€])?\s?\d+(?:\.\d{2})/g;

function parseCurrency(raw) {
  return Number(raw.replace(/[^\d.]/g, ''));
}

function getValueHits(lines) {
  const hits = [];
  lines.forEach((line, lineIndex) => {
    const matches = line.matchAll(CURRENCY_RE);
    for (const match of matches) {
      if (!match[0] || match.index == null) continue;
      hits.push({
        lineIndex,
        column: match.index,
        raw: match[0],
        value: parseCurrency(match[0]),
      });
    }
  });
  return hits.filter((hit) => Number.isFinite(hit.value));
}

function rankLabel(line) {
  for (const entry of PRIORITIZED_LABELS) {
    const match = line.match(entry.pattern);
    if (match?.[0]) {
      return { rank: entry.rank, matchedLabel: match[0] };
    }
  }
  return null;
}

function distanceToKnownTotalLabel(lines, lineIndex) {
  const labeledLines = lines
    .map((line, idx) => ({ idx, isTotal: KNOWN_TOTAL_LABELS.test(line) }))
    .filter((l) => l.isTotal)
    .map((l) => l.idx);

  if (!labeledLines.length) return Number.POSITIVE_INFINITY;
  return Math.min(...labeledLines.map((idx) => Math.abs(idx - lineIndex)));
}

function buildCandidates(text) {
  const lines = text.split(/\r?\n/);
  const values = getValueHits(lines);
  const candidates = [];

  for (const valueHit of values) {
    const currentLine = lines[valueHit.lineIndex] ?? '';
    const prevLine = lines[valueHit.lineIndex - 1] ?? '';
    const nextLine = lines[valueHit.lineIndex + 1] ?? '';
    const labelContexts = [currentLine, prevLine, nextLine];

    let bestRank = 0;
    let matchedLabel = 'unlabeled amount';

    for (const labelContext of labelContexts) {
      const ranked = rankLabel(labelContext);
      if (ranked && ranked.rank > bestRank) {
        bestRank = ranked.rank;
        matchedLabel = ranked.matchedLabel;
      }
    }

    const deprioritized = DEPRIORITIZED_LABELS.test(currentLine) || DEPRIORITIZED_LABELS.test(prevLine);

    if (bestRank === 0 && !deprioritized) bestRank = 35;
    if (bestRank === 0 && deprioritized) bestRank = 10;

    candidates.push({
      value: valueHit.value,
      label: matchedLabel,
      lineIndex: valueHit.lineIndex,
      valueColumn: valueHit.column,
      signalRank: bestRank,
      isDeprioritized: deprioritized,
      distanceToKnownTotalLabel: distanceToKnownTotalLabel(lines, valueHit.lineIndex),
    });
  }

  return candidates;
}

function selectCandidate(candidates) {
  if (!candidates.length) return null;

  const nonDeprioritized = candidates.filter((c) => !c.isDeprioritized && c.signalRank > 0);
  const pool = nonDeprioritized.length ? nonDeprioritized : candidates.filter((c) => c.signalRank > 0);
  if (!pool.length) return null;

  const bestSignal = Math.max(...pool.map((c) => c.signalRank));
  const signalFiltered = pool.filter((c) => c.signalRank >= bestSignal - 5);

  signalFiltered.sort((a, b) => {
    const distanceA = Number.isFinite(a.distanceToKnownTotalLabel) ? a.distanceToKnownTotalLabel : 9999;
    const distanceB = Number.isFinite(b.distanceToKnownTotalLabel) ? b.distanceToKnownTotalLabel : 9999;
    if (distanceA !== distanceB) return distanceA - distanceB;
    return a.valueColumn - b.valueColumn;
  });

  return signalFiltered[0] ?? null;
}

function inferConfidence(candidates, selected) {
  if (!selected) return 'low';

  const peerCandidates = candidates.filter((c) => !c.isDeprioritized && c.signalRank > 0);
  const pool = peerCandidates.length ? peerCandidates : candidates.filter((c) => c.signalRank > 0);

  if (selected.isDeprioritized) return 'low';

  const closeSignals = pool.filter((c) => c !== selected && Math.abs(c.signalRank - selected.signalRank) <= 3);

  if (selected.signalRank >= 90 && closeSignals.length === 0) return 'high';
  if (selected.signalRank >= 80 && closeSignals.length <= 1) return 'medium';
  return 'low';
}

/** @param {string} text @returns {ParsedTotalExVat} */
export function inferTotalExVat(text) {
  const candidates = buildCandidates(text);
  const selected = selectCandidate(candidates);
  const extractionConfidence = inferConfidence(candidates, selected);

  if (!selected) {
    return {
      value: null,
      extractionConfidence: 'low',
      warning: 'Unable to confidently infer ex-VAT total. Please review manually.',
    };
  }

  return {
    value: selected.value,
    extractionConfidence,
    matchedLabel: selected.label,
    warning:
      extractionConfidence === 'low'
        ? 'Low confidence ex-VAT extraction. Please verify before approval.'
        : undefined,
  };
}

/** @param {ParsedTotalExVat} parsed */
export function getTotalsWarning(parsed) {
  if (parsed.extractionConfidence === 'low') {
    return parsed.warning ?? 'Low confidence extraction; manual review recommended.';
  }
  return null;
}

// exported for tests
export const __internal = { buildCandidates, selectCandidate, inferConfidence };

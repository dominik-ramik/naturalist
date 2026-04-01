/*
 * MONTHS DATA FORMATS
 *
 * Supports two input modes, auto-detected from column headers:
 *
 * 1. COLUMN-BASED FORMAT
 *    Headers: [columnname].jan, [columnname].feb, ... [columnname].dec
 *    Up to 12 optional columns; a non-empty cell activates that month.
 *
 * 2. CELL-BASED FORMAT (single cell, two sub-variants)
 *    a) Lettered  – 3-letter MONTH_KEYS, case-insensitive, pipe-separated or dash-ranged
 *       e.g. "jan", "feb-apr", "jan|mar-oct|dec"
 *    b) Numeric   – 1-based month numbers, same separators
 *       e.g. "1", "2-4", "1|3-10|12"
 *
 * readData returns: number[] — sorted, unique, 1-based month numbers (jan=1 … dec=12)
 *                   or null when no months found.
 *
 * render produces a compact i18n text with Dec-Jan continuity, e.g.
 *   [1,2,5,7,12] → "May, Jul and Dec-Feb"
 *   [1,2,3,4,5,6,7,8,9,10,11,12] → "Jan-Dec"
 */

import m from "mithril";
import { Settings } from "../Settings.js";

// ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
const MONTH_KEYS = Settings.MONTH_KEYS;

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a single month token (3-letter key or 1-based integer string)
 * into a 1-based month number. Returns null if unrecognised.
 */
function parseMonthToken(token) {
  const trimmed = token.trim().toLowerCase();
  if (!trimmed) return null;

  // Try numeric first (must be a clean integer string, no extra chars)
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && String(num) === trimmed && num >= 1 && num <= 12) {
    return num;
  }

  // Try 3-letter key
  const idx = MONTH_KEYS.indexOf(trimmed);
  if (idx >= 0) return idx + 1; // convert to 1-based

  return null;
}

/**
 * Expand a single segment (e.g. "feb-apr", "2-4", "jan", "11") into an
 * array of 1-based month numbers, supporting wraparound (e.g. "nov-feb").
 */
function expandSegment(token) {
  const trimmed = token.trim();
  if (!trimmed) return [];

  // A leading dash would be malformed; require dashIdx > 0.
  const dashIdx = trimmed.indexOf("-");

  if (dashIdx <= 0) {
    const m = parseMonthToken(trimmed);
    return m !== null ? [m] : [];
  }

  const start = parseMonthToken(trimmed.substring(0, dashIdx));
  const end   = parseMonthToken(trimmed.substring(dashIdx + 1));

  if (start === null || end === null) return [];

  const result = [];
  if (start <= end) {
    for (let i = start; i <= end; i++) result.push(i);
  } else {
    // Wraparound (e.g. nov-feb → 11,12,1,2)
    for (let i = start; i <= 12; i++) result.push(i);
    for (let i = 1;     i <= end; i++) result.push(i);
  }
  return result;
}

/**
 * Parse a full inline cell value such as "jan|feb-apr|dec" or "1|2-4|12".
 * Returns a sorted array of unique 1-based month numbers.
 */
function parseInlineMonths(cellValue) {
  if (!cellValue || typeof cellValue !== "string") return [];
  const months = new Set();
  cellValue.split("|").forEach(segment => {
    expandSegment(segment.trim()).forEach(m => months.add(m));
  });
  return [...months].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Range grouping with Dec-Jan continuity
// ---------------------------------------------------------------------------

/**
 * Group a sorted array of unique 1-based month numbers into [start, end] pairs.
 *
 * If December (12) and January (1) are both present and form a continuous run
 * when the calendar wraps, they are merged into a single wrapped range that is
 * placed at the END of the returned array so that mid-year ranges appear first.
 *
 * Examples:
 *   [1,2,5,7,12]       → [[5,5],[7,7],[12,2]]   ("May, Jul and Dec-Feb")
 *   [1,2,3,4,5,6,7,8,9,10,11,12] → [[1,12]]     ("Jan-Dec")
 *   [11,12,1,2]        → [[11,2]]               ("Nov-Feb")
 */
export function groupMonthsIntoRanges(months) {
  if (!months || months.length === 0) return [];

  const sorted = [...new Set(months)].sort((a, b) => a - b);

  // Short-circuit: all 12 months → one full-year range
  if (sorted.length === 12) return [[1, 12]];

  // Build linear runs
  const ranges = [];
  let start = sorted[0];
  let prev  = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      ranges.push([start, prev]);
      start = sorted[i];
      prev  = sorted[i];
    }
  }
  ranges.push([start, prev]);

  // Check for Dec-Jan continuity: last run ends at 12, first run starts at 1
  if (
    ranges.length >= 2 &&
    ranges[ranges.length - 1][1] === 12 &&
    ranges[0][0] === 1
  ) {
    const wrappedStart  = ranges[ranges.length - 1][0]; // e.g. 12 or 11
    const wrappedEnd    = ranges[0][1];                 // e.g. 1 or 2
    const middleRanges  = ranges.slice(1, ranges.length - 1);
    // Merged wrap range goes LAST so mid-year ranges are listed first
    return [...middleRanges, [wrappedStart, wrappedEnd]];
  }

  return ranges;
}

// ---------------------------------------------------------------------------
// i18n rendering
// ---------------------------------------------------------------------------

/**
 * Convert an array of [start, end] pairs to an i18n text string.
 *
 * Single months:  t("months.may")
 * Ranges:         t("months.dec") + "-" + t("months.feb")
 * Multiple parts joined with ", " and a final " and " conjunction.
 */
// Render ranges to a plain string (used for searchable text)
export function renderRangesString(ranges) {
  if (!ranges || ranges.length === 0) return "";

  const parts = ranges.map(([start, end]) => {
    const startLabel = t("months." + MONTH_KEYS[start - 1]);
    if (start === end) return startLabel;
    return startLabel + "-" + t("months." + MONTH_KEYS[end - 1]);
  });

  if (parts.length === 1) return parts[0];

  return (
    parts.slice(0, -1).join(", ") +
    " " + t("months.and") + " " +
    parts[parts.length - 1]
  );
}

// VNode-only render: always return mithril VNodes where month names are wrapped in <strong>
function renderRanges(ranges) {
  if (!ranges || ranges.length === 0) return null;

  const parts = ranges.map(([start, end]) => {
    const startLabel = t("months." + MONTH_KEYS[start - 1]);
    const startNode = m("strong", startLabel);
    if (start === end) return startNode;
    const endLabel = t("months." + MONTH_KEYS[end - 1]);
    const endNode = m("strong", endLabel);
    return m("span", [startNode, "-", endNode]);
  });

  if (parts.length === 1) return parts[0];

  const nodes = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && i < parts.length - 1) {
      nodes.push(", ");
    }
    if (i === parts.length - 1 && parts.length > 1) {
      nodes.push(" " + t("months.and") + " ");
    }
    nodes.push(parts[i]);
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Reader export
// ---------------------------------------------------------------------------

export let readerMonths = {
  dataType: "months",

  readData: function (context, computedPath) {
    const { headers, row, langCode } = context;
    const lowerPath = computedPath.toLowerCase();

    // --- Detect column-based format first ---
    // Looks for headers like [path].jan, [path].feb, ...
    const monthColumns = headers.filter(h => {
      if (!h.startsWith(lowerPath + ".")) return false;
      const suffix = h.substring(lowerPath.length + 1);
      return MONTH_KEYS.includes(suffix);
    });

    if (monthColumns.length > 0) {
      const activeMonths = new Set();
      monthColumns.forEach(colName => {
        const monthKey = colName.substring(lowerPath.length + 1);
        const monthNum = MONTH_KEYS.indexOf(monthKey) + 1; // 1-based
        const colIdx   = headers.indexOf(colName);
        if (
          colIdx >= 0 &&
          row[colIdx] !== undefined &&
          row[colIdx].toString().trim() !== ""
        ) {
          activeMonths.add(monthNum);
        }
      });
      const result = [...activeMonths].sort((a, b) => a - b);

      return result.length > 0 ? result : [];
    }

    // --- Cell-based format ---
    let colIdx = headers.indexOf(lowerPath);
    if (colIdx < 0) colIdx = headers.indexOf(lowerPath + ":" + langCode);

    if (colIdx < 0 || row[colIdx] === undefined) return [];

    const cellValue = row[colIdx].toString().trim();
    if (!cellValue) return [];

    const months = parseInlineMonths(cellValue);

    console.log("ReaderMonths - detected cell-based format with value:", cellValue, "resulting in months:", months);

    return months.length > 0 ? months : [];
  },

  /**
   * Returns the full rendered i18n string as a single searchable element.
   * Text search for any month name will thus match the entire months field,
   * which is the correct behaviour (the spec: "highlight the entire rendered
   * text if any of its unravelled constituents match").
   */
  getSearchableText: function (data, uiContext) {
    if (!data || !Array.isArray(data) || data.length === 0) return [];
    const text = renderRangesString(groupMonthsIntoRanges(data));
    return text ? [text] : [];
  },

  render: function (data, uiContext) {
    if (!data || !Array.isArray(data) || data.length === 0) return null;
    const vnode = renderRanges(groupMonthsIntoRanges(data));
    if (!vnode) return null;
    return m("span.months-data", vnode);
  },
};
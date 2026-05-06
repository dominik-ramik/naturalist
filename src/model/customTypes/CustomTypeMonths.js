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
 *    a) Lettered  – 3-letter MONTH_KEYS, case-insensitive, pipe- or comma-separated or dash-ranged
 *       e.g. "jan", "feb-apr", "jan|mar-oct|dec", "jan, mar-oct, dec"
 *    b) Numeric   – 1-based month numbers, same separators
 *       e.g. "1", "2-4", "1|3-10|12", "1, 3-10, 12"
 *
 * readData returns: number[] - sorted, unique, 1-based month numbers (jan=1 … dec=12)
 *                   or null when no months found.
 *
 * render produces a compact i18n text with Dec-Jan continuity, e.g.
 *   [1,2,5,7,12] → "May, Jul and Dec-Feb"
 *   [1,2,3,4,5,6,7,8,9,10,11,12] → "Jan-Dec"
 */

import m from "mithril";
import { t, tf } from 'virtual:i18n-self';
import { Checklist } from "../Checklist.js";
import { MONTH_KEYS } from "../MonthNames.js";
import { Logger } from "../../components/Logger.js";
import { filterPluginMonths } from "../filterPlugins/filterPluginMonths.js";
import { textMatchesHighlight } from "../highlightUtils.js";



// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a single month token (3-letter key or 1-based integer string)
 * into a 1-based month number. Returns null if unrecognised.
 */
function parseMonthToken(token, uiContext = {}) {
  const trimmed = (token || "").toString().trim().toLowerCase();
  if (!trimmed) return null;

  // Try numeric first (must be a clean integer string, no extra chars)
  const num = parseInt(trimmed, 10);
  if (!isNaN(num)) {
    if (String(num) !== trimmed) {
      Logger.error(
        `Month token "${token}" is not a clean integer string`,
        "Invalid months syntax"
      );
      return null;
    }
    if (num >= 1 && num <= 12) {
      return num;
    }
    Logger.error(
      `Invalid month number "${token}" - expected 1..12`,
      "Invalid months syntax"
    );
    return null;
  }

  // Try 3-letter key
  const idx = MONTH_KEYS.indexOf(trimmed);
  if (idx >= 0) return idx + 1; // convert to 1-based

  Logger.error(`Unrecognised month token "${token}". Use one of: ${MONTH_KEYS.join(", ")} or 1-12 to denote months`, "Invalid months syntax");
  return null;
}

/**
 * Expand a single segment (e.g. "feb-apr", "2-4", "jan", "11") into an
 * array of 1-based month numbers, supporting wraparound (e.g. "nov-feb").
 */
function expandSegment(token, uiContext = {}) {
  const trimmed = (token || "").toString().trim();
  if (!trimmed) return [];

  const dashIdx = trimmed.indexOf("-");

  if (dashIdx < 0) {
    const m = parseMonthToken(trimmed, uiContext);
    return m !== null ? [m] : [];
  }

  if (dashIdx === 0) {
    Logger.error(`Malformed month segment "${trimmed}" - missing start`, "Invalid months syntax");
    return [];
  }

  const start = parseMonthToken(trimmed.substring(0, dashIdx), uiContext);
  const end = parseMonthToken(trimmed.substring(dashIdx + 1), uiContext);

  if (start === null || end === null) {
    return [];
  }

  const result = [];
  if (start <= end) {
    for (let i = start; i <= end; i++) result.push(i);
  } else {
    // Wraparound (e.g. nov-feb → 11,12,1,2)
    for (let i = start; i <= 12; i++) result.push(i);
    for (let i = 1; i <= end; i++) result.push(i);
  }
  return result;
}

/**
 * Parse a full inline cell value such as "jan|feb-apr|dec" or "1|2-4|12".
 * Returns a sorted array of unique 1-based month numbers.
 */
function parseInlineMonths(cellValue, uiContext = {}) {
  if (!cellValue || typeof cellValue !== "string") return [];
  const months = new Set();
  cellValue.split(/[|,]/).forEach(segment => {
    expandSegment(segment.trim(), uiContext).forEach(m => months.add(m));
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
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      ranges.push([start, prev]);
      start = sorted[i];
      prev = sorted[i];
    }
  }
  ranges.push([start, prev]);

  // Check for Dec-Jan continuity: last run ends at 12, first run starts at 1
  if (
    ranges.length >= 2 &&
    ranges[ranges.length - 1][1] === 12 &&
    ranges[0][0] === 1
  ) {
    const wrappedStart = ranges[ranges.length - 1][0]; // e.g. 12 or 11
    const wrappedEnd = ranges[0][1];                 // e.g. 1 or 2
    const middleRanges = ranges.slice(1, ranges.length - 1);
    // Merged wrap range goes LAST so mid-year ranges are listed first
    return [...middleRanges, [wrappedStart, wrappedEnd]];
  }

  return ranges;
}

// ---------------------------------------------------------------------------
// i18n rendering
// ---------------------------------------------------------------------------

/**
 * Convert an array of [start, end] pairs to a localized text string.
 *
 * Single months:  "May"
 * Ranges:         "Dec-Feb"
 * Multiple parts joined with ", " and a final " and " conjunction.
 */
// Render ranges to a plain string (used for searchable text)
export function renderRangesString(ranges, uiContext = {}) {
  if (!ranges || ranges.length === 0) return "";

  const parts = ranges.map(([start, end]) => {
    const startLabel = Checklist.getMonthLabel(start, uiContext.langCode);
    if (start === end) return startLabel;
    return startLabel + "-" + Checklist.getMonthLabel(end, uiContext.langCode);
  });

  if (parts.length === 1) return parts[0];

  return (
    parts.slice(0, -1).join(", ") +
    " " + t("months_and") + " " +
    parts[parts.length - 1]
  );
}

// VNode-only render: always return mithril VNodes where month names are wrapped in <strong>
function renderRanges(ranges, uiContext = {}, highlightRegex = null, filterSelected = null) {
  if (!ranges || ranges.length === 0) return null;

  const parts = ranges.map(([start, end]) => {
    // Enumerate every month in this range (handles wraparound)
    const months = [];
    if (start <= end) {
      for (let mo = start; mo <= end; mo++) months.push(mo);
    } else {
      for (let mo = start; mo <= 12; mo++) months.push(mo);
      for (let mo = 1; mo <= end; mo++) months.push(mo);
    }

    // Build per-month segments with highlight status
    const segments = []; // { label: string, highlighted: bool }
    for (const mo of months) {
      const label = Checklist.getMonthLabel(mo, uiContext.langCode);
      const highlighted = filterSelected
        ? filterSelected.has(mo)
        : textMatchesHighlight(label, highlightRegex);
      segments.push({ label, highlighted });
    }

    const hasHighlights = segments.some(s => s.highlighted);

    if (!hasHighlights) {
      // No highlights: render as "first-last" or just a single label
      if (segments.length === 1) return m("strong", segments[0].label);
      return m("span", [
        m("strong", segments[0].label),
        "-",
        m("strong", segments[segments.length - 1].label),
      ]);
    }

    // Has highlights: build a compact "spine" - only the outermost label of each
    // non-highlighted run is shown, with highlighted months as pivots connected by "-".
    // e.g. Feb–Dec with Apr highlighted → Feb-[Apr]-Dec
    //      Jan–May with Jan highlighted → [Jan]-May
    const pieces = []; // { type: "hl", seg } | { type: "nonhl", run: segments[] }
    let i = 0;
    while (i < segments.length) {
      if (segments[i].highlighted) {
        pieces.push({ type: "hl", seg: segments[i] });
        i++;
      } else {
        let j = i;
        while (j < segments.length && !segments[j].highlighted) j++;
        pieces.push({ type: "nonhl", run: segments.slice(i, j) });
        i = j;
      }
    }

    const children = [];
    for (let k = 0; k < pieces.length; k++) {
      const piece = pieces[k];
      if (piece.type === "hl") {
        if (children.length > 0) children.push("-");
        children.push(m("strong", m("mark.search-highlight", piece.seg.label)));
      } else {
        const run = piece.run;
        const prevIsHL = k > 0 && pieces[k - 1].type === "hl";
        const nextIsHL = k < pieces.length - 1 && pieces[k + 1].type === "hl";

        if (prevIsHL && nextIsHL) {
          // Bridge between two highlights: show both endpoints of the gap
          children.push("-");
          children.push(m("strong", run[0].label));
          if (run.length > 1) {
            children.push("-");
            children.push(m("strong", run[run.length - 1].label));
          }
        } else if (prevIsHL) {
          // Trailing run: show only the last (rightmost) label
          children.push("-");
          children.push(m("strong", run[run.length - 1].label));
        } else {
          // Leading run (nextIsHL is true): show only the first (leftmost) label
          children.push(m("strong", run[0].label));
        }
      }
    }

    if (children.length === 1) return children[0];
    return m("span", children);
  });

  if (parts.length === 1) return parts[0];

  const nodes = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && i < parts.length - 1) nodes.push(", ");
    if (i === parts.length - 1 && parts.length > 1) nodes.push(" " + t("months_and") + " ");
    nodes.push(parts[i]);
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Reader export
// ---------------------------------------------------------------------------

export let customTypeMonths = {
  dataType: "months",
  expectedColumns: (basePath) => [
    basePath,
    ...MONTH_KEYS.map(k => `${basePath}.${k}`)
  ],

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
        const colIdx = headers.indexOf(colName);
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

    return months.length > 0 ? months : [];
  },

  filterPlugin: filterPluginMonths,

  /**
   * Returns one searchable string per active month (its localized label).
   *
   * Indexing individual labels - rather than the collapsed range string - is
   * required because renderRangesString only emits the two *endpoints* of each
   * range (e.g. "Janvier-Avril"), so intermediate months like "Mars" would
   * never appear in the indexed text and plain-text search would silently miss
   * any item whose matching month sits in the interior of a range.
   *
   * renderRanges already iterates per-month and calls textMatchesHighlight on
   * each label, so highlight rendering works correctly once search hits land.
   */
  getSearchableText: function (data, uiContext) {
    if (!data || !Array.isArray(data) || data.length === 0) return [];
    return data.map(monthNum => Checklist.getMonthLabel(monthNum, uiContext.langCode));
  },

  toDwC: function (data, subPath) {
    if (!data || !Array.isArray(data) || data.length === 0) return null;

    const ranges = groupMonthsIntoRanges(data);
    
    switch (subPath) {
      case "compact":
        return renderRangesString(ranges);
      case "full":
        return data.map(m => Checklist.getMonthLabel(m)).join(", ");
      default:
        return null;
    }
  },

  render: function (data, uiContext) {
    if (!data || !Array.isArray(data) || data.length === 0) return null;

    // For a months filter, fd.selected contains numeric month numbers (1-12).
    // A regex built from those numbers would spuriously match inside other strings,
    // so we use a direct numeric intersection instead and only use the regex for
    // free-text search (where the user types month names).
    const filterPath = uiContext.dataPath; // months is never a list sub-item
    const fd = Checklist.filter.data[filterPath] || null;
    const filterSelected = (fd && fd.selected?.length > 0 && fd.matchMode !== "exclude")
      ? new Set(fd.selected.map(Number))
      : null;
    const vnode = renderRanges(groupMonthsIntoRanges(data), uiContext, uiContext?.highlightRegex, filterSelected);

    if (!vnode) return null;
    return m("span.months-data", vnode);
  },
};
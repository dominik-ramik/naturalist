/*
 * INTERVAL DATA FORMAT
 *
 * Reads a numeric range [from, to] — both ends inclusive — from one of three input modes:
 *
 * 1. COLUMN-BASED FORMAT
 *    Headers: [columnname].from  and  [columnname].to
 *    Each contains a single number.
 *
 * 2. PIPE-SEPARATED CELL  (takes priority over dash when a pipe is present)
 *    e.g.  "10.6 | 15"  or  "10,6 | 15"
 *
 * 3. DASH-SEPARATED CELL
 *    a) Whitespace-surrounded dash:  "15.6 - 18.1",  "-5 - 10"
 *    b) Digit-adjacent dash:         "15.6-18.1",    "-10--5"
 *
 * DECIMAL SEPARATOR HEURISTIC  (per-number, locale-independent)
 *   • Period is the default decimal separator.
 *   • Comma is used as decimal separator when a number contains comma but no period.
 *   • Both present in one number → Logger.error, value skipped.
 *
 * EDGE CASES
 *   • from > to              → Logger.error, row skipped (readData returns null).
 *   • Non-numeric token      → Logger.warning, row skipped.
 *   • One side missing       → the present value is used for both ends.
 *   • Both sides empty       → readData returns [] (no data for this field).
 *   • Invalid / parse error  → readData returns null (treated as missing by callers).
 *
 * TEMPLATE SUPPORT
 *   When a Handlebars template is configured for the data path, processTemplate is
 *   called separately for each end of the range with a plain number as `value`.
 *   This lets the built-in `{{unit value "cm"}}` helper (which works on single numbers)
 *   format each endpoint independently, e.g. producing "3.5 cm – 7.2 cm".
 *   The two rendered strings are then joined with " – " (or shown once when equal).
 *   Without a template the reader falls back to its own "from – to" formatting.
 *
 * readData returns:
 *   null          — invalid input (already logged)
 *   []            — both sides empty / column not found
 *   [from, to]    — valid interval as numbers
 */

import m from "mithril";
import { Logger } from "../../components/Logger.js";
import { helpers } from "./helpers.js";
import { filterPluginInterval } from "../filterPlugins/filterPluginInterval.js";

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a single raw string to a float using the locale-independent heuristic.
 * @returns {number|null}  null for empty string, NaN for invalid, number for valid
 */
function parseIntervalNumber(raw) {
  const s = raw.trim();
  if (s === "") return null;

  const hasPeriod = s.includes(".");
  const hasComma  = s.includes(",");

  if (hasPeriod && hasComma) {
    Logger.error(
      `interval: ambiguous decimal separator in "${s}" — contains both "." and ","`
    );
    return NaN;
  }

  const n = parseFloat(hasComma ? s.replace(",", ".") : s);
  if (isNaN(n)) Logger.warning(`interval: non-numeric value "${s}" — skipped`);
  return n;
}

/**
 * Validate the two raw sides and return the normalised interval.
 * @returns {number[]|null|[]}
 */
function buildInterval(fromRaw, toRaw, source) {
  const fromEmpty = fromRaw == null || fromRaw.trim() === "";
  const toEmpty   = toRaw  == null || toRaw.trim()  === "";

  if (fromEmpty && toEmpty) return [];

  const parsedFrom = fromEmpty ? null : parseIntervalNumber(fromRaw);
  const parsedTo   = toEmpty   ? null : parseIntervalNumber(toRaw);

  if (parsedFrom !== null && isNaN(parsedFrom)) return null;
  if (parsedTo   !== null && isNaN(parsedTo))   return null;

  // Missing side → assume same value as the present side
  const from = parsedFrom ?? parsedTo;
  const to   = parsedTo   ?? parsedFrom;

  if (from > to) {
    Logger.error(
      `interval: from (${from}) > to (${to}) in "${source}"`
    );
    return null;
  }

  return [from, to];
}

/**
 * Split a raw cell string into [fromRaw, toRaw].
 *
 * Priority:
 *  1. Pipe "|"
 *  2. Whitespace-surrounded dash — handles leading-minus on either side
 *  3. Digit-adjacent dash        — e.g. "10-20", "-10--5"
 *  4. No separator               — single value, both ends equal
 */
function splitCell(cell) {
  const pipeIdx = cell.indexOf("|");
  if (pipeIdx >= 0) {
    return [cell.slice(0, pipeIdx), cell.slice(pipeIdx + 1)];
  }

  // Dash with whitespace on both sides (lazy left side preserves leading minus)
  const spacedMatch = /^(.*?)\s+-\s+(.*)$/s.exec(cell);
  if (spacedMatch) return [spacedMatch[1], spacedMatch[2]];

  // Compact dash immediately following a digit (lookbehind guards leading minus)
  const compactIdx = cell.search(/(?<=\d)-/);
  if (compactIdx >= 0) {
    return [cell.slice(0, compactIdx), cell.slice(compactIdx + 1)];
  }

  return [cell, ""];
}

// ---------------------------------------------------------------------------
// Reader export
// ---------------------------------------------------------------------------

export let customTypeInterval = {
  dataType: "interval",

  meta: {
    summary: "A numeric range representing minimum and maximum values, both inclusive. Rendered as `from – to` (e.g. `10 – 15`); if both endpoints are equal, shown as a single value.",
    whenToUse: "Physical dimensions (length, wingspan, weight), altitude limits, depth ranges, or any numeric attribute that naturally has a minimum and maximum boundary rather than a single point value.",
    behaviorFulltextIndexing: "The rendered range string (e.g. `10 - 15`) is indexed as a single token. Searching for any part of either number will match the field.",
    detailsPaneTab: null,
    inputFormats: [
      {
        label: "Format 1: Two columns (.from and .to)",
        syntax: "`<columnname>.from` and `<columnname>.to`, each containing a single number.",
        example: {
          columns: ["length.from", "length.to"],
          rows: [["10.5", "15"], ["-5", "0"], ["3", "3"]],
        },
      },
      {
        label: "Format 2: Single column — pipe-separated",
        syntax: "`from | to` in one cell. Both `.` and `,` are accepted as decimal separators (not mixed in the same number).",
        example: { columns: ["length"], rows: [["10.6 | 15"], ["10,6 | 15"]] },
      },
      {
        label: "Format 3: Single column — dash-separated",
        syntax: "Whitespace-surrounded: `15.6 - 18.1`. Compact: `15.6-18.1`. Handles negative ranges: `-10--5`.",
        example: { columns: ["length"], rows: [["15.6 - 18.1"], ["15.6-18.1"], ["-10--5"]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "When a **Template** is configured (e.g. `{{unit \"cm\"}}`), it is applied to each endpoint independently, producing `10 cm – 15 cm`. If one side of the range is missing, the single present value is used for both endpoints.",
      },
    ],
  },

  readData(context, computedPath) {
    const { headers, row, langCode } = context;
    const lp = computedPath.toLowerCase();

    // --- Column-based: path.from / path.to ---
    const fi = headers.indexOf(lp + ".from");
    const ti = headers.indexOf(lp + ".to");

    if (fi >= 0 || ti >= 0) {
      const fr = fi >= 0 && row[fi] !== undefined ? row[fi].toString() : "";
      const tr = ti >= 0 && row[ti] !== undefined ? row[ti].toString() : "";
      return buildInterval(fr, tr, `${computedPath}.from / .to`);
    }

    // --- Cell-based ---
    let ci = headers.indexOf(lp);
    if (ci < 0) ci = headers.indexOf(lp + ":" + langCode);
    if (ci < 0 || row[ci] === undefined) return [];

    const cell = row[ci].toString().trim();
    if (!cell) return [];

    const [fr, tr] = splitCell(cell);
    return buildInterval(fr.trim(), tr.trim(), cell);
  },

  filterPlugin: filterPluginInterval,

  extractFilterLeafValues(rawValue) {
    return Array.isArray(rawValue) && rawValue.length === 2 ? [rawValue] : [];
  },

  extractAllValues(rawValue) {
    return Array.isArray(rawValue) && rawValue.length === 2 ? [rawValue] : [];
  },

  /**
   * Returns the rendered "from – to" string as a single searchable token.
   * A text search for any part of either number will match and highlight the field.
   */
  getSearchableText(data) {
    if (!Array.isArray(data) || data.length !== 2) return [];
    return [data[0] === data[1] ? `${data[0]}` : `${data[0]} - ${data[1]}`];
  },

  render(data, uiContext) {
    if (!Array.isArray(data) || data.length !== 2) return null;

    // When a Handlebars template is configured, apply it to each end of the range
    // independently so the template (e.g. {{unit value "cm"}}) receives a plain
    // number each time.  processTemplate returns the original value reference when
    // no template is active, so strict reference inequality is a reliable signal.
    if (uiContext) {
      const fromResult = helpers.processTemplate(data[0], uiContext);
      const toResult   = helpers.processTemplate(data[1], uiContext);
      if (fromResult !== data[0] || toResult !== data[1]) {
        const fromStr = String(fromResult);
        const toStr   = String(toResult);
        return m("span.simple-value", m.trust(fromStr === toStr ? fromStr : fromStr + '&nbsp;<span class="unit-dash">&ndash;</span>&nbsp;' + toStr));
      }
    }

    // Default: "from – to" or a bare number when both ends are equal
    return m("span.simple-value", data[0] === data[1] ? m.trust(`${data[0]}`) : m.trust(`${data[0]}&nbsp;<span class="unit-dash">&ndash;</span>&nbsp;${data[1]}`));
  },
};
/*
 * INTERVAL DATA FORMAT
 *
 * Reads a numeric range [from, to] - both ends inclusive - from one of three input modes:
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
 *   Without a template the reader falls back to its own "from – to" dataType.
 *
 * readData returns:
 *   null          - invalid input (already logged)
 *   []            - both sides empty / column not found
 *   [from, to]    - valid interval as numbers
 */

import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { Logger } from "../../components/Logger.js";
import { helpers } from "./helpers.js";
import { filterPluginInterval, intervalFilters } from "../filterPlugins/filterPluginInterval.js";
import { applyHighlight, highlightHtml, textMatchesHighlight } from "../highlightUtils.js";

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
  const hasComma = s.includes(",");

  if (hasPeriod && hasComma) {
    Logger.error(
      `interval: ambiguous decimal separator in "${s}" - contains both "." and ","`
    );
    return NaN;
  }

  const n = parseFloat(hasComma ? s.replace(",", ".") : s);
  if (isNaN(n)) Logger.warning(`interval: non-numeric value "${s}" - skipped`);
  return n;
}

/**
 * Validate the two raw sides and return the normalised interval.
 * @returns {number[]|null|[]}
 */
function buildInterval(fromRaw, toRaw, source) {
  const fromEmpty = fromRaw == null || fromRaw.trim() === "";
  const toEmpty = toRaw == null || toRaw.trim() === "";

  if (fromEmpty && toEmpty) return [];

  const parsedFrom = fromEmpty ? null : parseIntervalNumber(fromRaw);
  const parsedTo = toEmpty ? null : parseIntervalNumber(toRaw);

  if (parsedFrom !== null && isNaN(parsedFrom)) return null;
  if (parsedTo !== null && isNaN(parsedTo)) return null;

  // Missing side → assume same value as the present side
  const from = parsedFrom ?? parsedTo;
  const to = parsedTo ?? parsedFrom;

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
 *  2. Whitespace-surrounded dash - handles leading-minus on either side
 *  3. Digit-adjacent dash        - e.g. "10-20", "-10--5"
 *  4. No separator               - single value, both ends equal
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
  expectedColumns: (basePath) => [basePath, `${basePath}.from`, `${basePath}.to`],


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

  toDwC: function (data, subPath) {
    // For text, we can return the string directly, or null if it's not a valid string
    if (data === null || data === undefined) {
      return null;
    }
  },

  render(data, uiContext) {
    if (!Array.isArray(data) || data.length !== 2) return null;

    const filterDef = uiContext?.filterDef || null;
    const operation = filterDef?.numeric?.operation;
    const comparer = operation ? intervalFilters[operation]?.comparer : null;
    const matchedByFilter = !!comparer &&
      comparer(data[0], data[1], filterDef.numeric.threshold1, filterDef.numeric.threshold2);
    const rawIntervalText = data[0] === data[1] ? `${data[0]}` : `${data[0]} - ${data[1]}`;
    const matchedByRegex = textMatchesHighlight(rawIntervalText, uiContext?.highlightRegex);

    function renderPart(part) {
      const partString = String(part);
      const hasHtml = /<[^>]+>/.test(partString);

      if (uiContext?.highlightRegex) {
        if (hasHtml) {
          const highlightedHtml = highlightHtml(partString, uiContext.highlightRegex);
          if (highlightedHtml !== partString) {
            return { node: m.trust(highlightedHtml), hasVisibleHighlight: true };
          }
        } else {
          const highlightedText = applyHighlight(partString, uiContext.highlightRegex);
          if (Array.isArray(highlightedText)) {
            return { node: highlightedText, hasVisibleHighlight: true };
          }
        }
      }

      return {
        node: hasHtml ? m.trust(partString) : partString,
        hasVisibleHighlight: false,
      };
    }

    // When a Handlebars template is configured, apply it to each end of the range
    // independently so the template (e.g. {{unit value "cm"}}) receives a plain
    // number each time.  processTemplate returns the original value reference when
    // no template is active, so strict reference inequality is a reliable signal.
    if (uiContext) {
      const fromResult = helpers.processTemplate(data[0], uiContext);
      const toResult = helpers.processTemplate(data[1], uiContext);
      if (fromResult !== data[0] || toResult !== data[1]) {
        const fromPart = renderPart(fromResult);
        const toPart = renderPart(toResult);
        const shouldHighlightWholeField =
          !fromPart.hasVisibleHighlight &&
          !toPart.hasVisibleHighlight &&
          (matchedByRegex || matchedByFilter);

        if (String(fromResult) === String(toResult)) {
          return m("span.simple-value",
            shouldHighlightWholeField
              ? m("mark.search-highlight", fromPart.node)
              : fromPart.node
          );
        }

        const content = [
          fromPart.node,
          m.trust('&nbsp;<span class="unit-dash">&ndash;</span>&nbsp;'),
          toPart.node,
        ];
        return m("span.simple-value",
          shouldHighlightWholeField
            ? m("mark.search-highlight", content)
            : content
        );
      }
    }

    const fromHighlighted = applyHighlight(`${data[0]}`, uiContext?.highlightRegex);
    const toHighlighted = applyHighlight(`${data[1]}`, uiContext?.highlightRegex);
    const hasVisibleHighlight =
      Array.isArray(fromHighlighted) || Array.isArray(toHighlighted);
    const shouldHighlightWholeField = !hasVisibleHighlight && matchedByFilter;

    if (data[0] === data[1]) {
      const content = fromHighlighted;
      return m("span.simple-value",
        shouldHighlightWholeField
          ? m("mark.search-highlight", content)
          : content
      );
    }

    const content = [
      fromHighlighted,
      m.trust('&nbsp;<span class="unit-dash">&ndash;</span>&nbsp;'),
      toHighlighted,
    ];
    return m("span.simple-value",
      shouldHighlightWholeField
        ? m("mark.search-highlight", content)
        : content
    );
  },
};

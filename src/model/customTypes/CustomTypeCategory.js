import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { helpers } from "./helpers.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";
import { applyHighlight, textMatchesHighlight } from "../highlightUtils.js";

// ---------------------------------------------------------------------------
// CSS helper
// ---------------------------------------------------------------------------
function purifyCssString(css) {
  if (css.indexOf('"') >= 0)  css = css.substring(0, css.indexOf('"'));
  if (css.indexOf("'") >= 0)  css = css.substring(0, css.indexOf("'"));
  if (css.indexOf(";") >= 0)  css = css.substring(0, css.indexOf(";"));
  if (css.indexOf(":") >= 0)  css = css.substring(0, css.indexOf(":"));
  return css;
}

// ---------------------------------------------------------------------------
// Wildcard matcher
//
// Rules
//   • Matching is always case-insensitive (both sides are lowercased).
//   • "*" is the only special character; it matches any sequence of characters
//     (including the empty string).
//   • A pattern with NO "*" must match the entire cell value (equality).
//   • A pattern that is exactly "*" matches everything.
//   • Multiple "*" are safe: the algorithm is a sequential indexOf scan —
//     O(n·k) where n = data length and k = number of literal segments.
//     There is NO regex backtracking risk regardless of wildcard count.
//
// Performance
//   • compileCategoryMatcher() is called ONCE per category entry, not on every
//     render. The compiled function is cached on the metadata entry object via
//     a private Symbol so repeated renders are only closure + indexOf calls.
// ---------------------------------------------------------------------------

/**
 * Compile a wildcard pattern into a fast, reusable matcher function.
 *
 * @param {string} pattern  - The raw .contains value from category metadata.
 * @returns {(value: string) => boolean}
 */
function compileCategoryMatcher(pattern) {
  const lower = pattern.toLowerCase();

  // Fast-path: bare "*" matches everything
  if (lower === "*") {
    return () => true;
  }

  const segments = lower.split("*");

  // No wildcard → full equality check
  if (segments.length === 1) {
    const literal = segments[0];
    return (value) => value.toLowerCase() === literal;
  }

  // Wildcards present → sequential indexOf scan (no regex, no backtracking).
  //
  // Strategy:
  //   segments[0]    must appear at position 0           (anchored start if non-empty)
  //   segments[last] must appear at the end of the string (anchored end if non-empty)
  //   middle segments must appear in left-to-right order after the previous match
  //
  const first = segments[0];
  const last  = segments[segments.length - 1];
  const mid   = segments.slice(1, -1); // may be empty array

  return function matchesWildcard(value) {
    const v = value.toLowerCase();
    const vLen = v.length;
    let pos = 0;

    // Anchored start: pattern does not begin with "*"
    if (first !== "") {
      if (!v.startsWith(first)) return false;
      pos = first.length;
    }

    // Anchored end: pattern does not end with "*"
    // Check early as a cheap rejection before scanning middle segments.
    if (last !== "") {
      if (!v.endsWith(last)) return false;
    }

    // Scan middle segments left-to-right
    for (let i = 0; i < mid.length; i++) {
      const seg = mid[i];
      if (seg === "") continue; // consecutive "**" → treat as one "*"
      const idx = v.indexOf(seg, pos);
      if (idx === -1) return false;
      pos = idx + seg.length;
    }

    // Guard: ensure middle scan hasn't consumed chars needed by the end anchor
    if (last !== "") {
      const lastStart = vLen - last.length;
      if (pos > lastStart) return false;
    }

    return true;
  };
}

// Private symbol used to cache the compiled matcher on each metadata entry
// object without adding an enumerable key.
const MATCHER_CACHE = Symbol("categoryMatcher");

export let customTypeCategory = {
  dataType: "category",
  expectedColumns: (basePath) => [basePath],

  readData: function (context, computedPath) {
    const { headers, row, langCode } = context;
    let columnIndex = headers.indexOf(computedPath.toLowerCase());

    if (columnIndex < 0) {
      columnIndex = headers.indexOf(
        computedPath.toLowerCase() + ":" + langCode
      );
    }

    if (columnIndex < 0 || row[columnIndex] === undefined) {
      return null;
    }

    let value = row[columnIndex].toString().trim();

    if (value === "") {
      return null;
    }

    // Apply data code transformation
    value = helpers.processPossibleDataCode(computedPath, value, langCode);

    return value;
  },

  /**
   * Extract searchable text from category data
   * @param {any} data - The category value
   * @param {Object} uiContext - UI context (optional)
   * @returns {string[]} Array of searchable strings
   */
  getSearchableText: function (data, uiContext) {
    if (!data || typeof data !== "string") return [];
    return [data];
  },

  filterPlugin: filterPluginText,

  render: function (data, uiContext) {
    if (data === null || data === undefined || data.toString().trim() === "") {
      return null;
    }

    // Convert data to string to ensure string methods work
    const dataString = data.toString();

    let badgeMeta = uiContext.meta.categories;
    let badgeFormat = badgeMeta.find(function (possibleFormat) {
      // Retrieve or lazily compile the matcher for this category entry.
      // The compiled function is cached via a private Symbol so it is built
      // only once per entry across thousands of render calls.
      if (!possibleFormat[MATCHER_CACHE]) {
        possibleFormat[MATCHER_CACHE] = compileCategoryMatcher(possibleFormat.contains);
      }
      return possibleFormat[MATCHER_CACHE](dataString);
    });

    if (badgeFormat) {
      return m.trust(
        "<span class='category" + (textMatchesHighlight(dataString, uiContext?.highlightRegex) ? " search-highlight-field" : "") + "' style='" +
          (badgeFormat.background
            ? "background-color: " + purifyCssString(badgeFormat.background) + ";"
            : "") +
          (badgeFormat.text
            ? "color: " + purifyCssString(badgeFormat.text) + ";"
            : "") +
          (badgeFormat.border
            ? "border-color: " + purifyCssString(badgeFormat.border) + ";"
            : "") +
          "'>" +
          dataString.replace(/\s/g, "&nbsp;") +
          "</span>"
      );
    }

    return m("span", applyHighlight(dataString.trim(), uiContext?.highlightRegex));
  },
};
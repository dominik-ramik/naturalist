import m from "mithril";

/**
 * Normalise a string for accent- and case-insensitive matching,
 * mirroring Filter._runActiveFilterQuery's pipeline.
 */
function normalise(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function escapeRegex(str) {
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * Build a word-boundary OR-regex from an array of raw term strings.
 * Returns null when the array is empty or all terms are blank.
 * Mirrors the regex built in Filter._runActiveFilterQuery for parity.
 */
export function buildSearchRegex(terms) {
  const patterns = terms
    .map(t => escapeRegex(normalise(t.trim())))
    .filter(Boolean);
  if (patterns.length === 0) return null;
  
  return new RegExp("(" + patterns.map(p => "\\b" + p).join("|") + ")", "i");
}

/**
 * Apply highlight to a plain string.
 * Returns the original string unchanged when regex is null or there is no match
 * (zero cost, safe to call unconditionally).
 * Returns a Mithril children array alternating plain strings and
 * m("mark.search-highlight", …) vnodes when a match is found.
 *
 * @param {string}    text
 * @param {RegExp|null} regex
 * @returns {string | Array}
 */
export function applyHighlight(text, regex) {
  if (!regex || typeof text !== "string" || text.length === 0) return text;

  // Match against the normalised form but slice from the original so
  // original casing and accents are preserved in the output.
  const norm = normalise(text);
  const parts = norm.split(regex);
  if (parts.length === 1) return text; // no match

  const result = [];
  let cursor = 0;
  parts.forEach((part, i) => {
    const origSlice = text.slice(cursor, cursor + part.length);
    cursor += part.length;
    if (origSlice.length === 0) return;
    if (i % 2 === 1) {
      result.push(m("mark.search-highlight", origSlice));
    } else {
      result.push(origSlice);
    }
  });
  return result;
}

/**
 * Returns true when a plain string matches the given highlight regex after the
 * same accent/case normalisation used by applyHighlight().
 *
 * @param {string} text
 * @param {RegExp|null} regex
 * @returns {boolean}
 */
export function textMatchesHighlight(text, regex) {
  if (!regex || typeof text !== "string" || text.length === 0) return false;
  return regex.test(normalise(text));
}

/**
 * Apply highlight to a fully-rendered HTML string by operating only on
 * text nodes (content between tags), never on tag markup itself.
 * Safe to use on DOMPurify-sanitised output.
 * Returns the original string when regex is null or there is no match.
 *
 * @param {string}    html
 * @param {RegExp|null} regex
 * @returns {string}
 */
export function highlightHtml(html, regex) {
  if (!regex || typeof html !== "string" || html.length === 0) return html;

  // Split on HTML tags, preserving them as captured groups.
  // Odd-indexed parts are tags, even-indexed are text nodes.
  const parts = html.split(/(<[^>]+>)/);
  let matched = false;
  const result = parts.map((part, i) => {
    if (i % 2 === 1) return part; // it's a tag, pass through unchanged
    if (!part) return part;
    const replaced = part.replace(regex, match => {
      matched = true;
      return '<mark class="search-highlight">' + match + '</mark>';
    });
    return replaced;
  });
  return matched ? result.join("") : html;
}

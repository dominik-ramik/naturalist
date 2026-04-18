/**
 * matchModePlugin.js – shared logic for plugins that support Match Mode
 * (filterPluginText, filterPluginMonths, filterPluginMapregions).
 *
 * Covers:
 *   • verbKey selection for describeSerializedValue  (was triplicated)
 *   • serialize / deserialize for list + matchMode   (was duplicated in Text + Months)
 *   • core ANY / ALL / EXCLUDE matching against a flat leaf-value array
 *     (was duplicated in Text + Months; Mapregions adds region aliasing on top
 *     and cannot use the flat variant directly, but can use matchModeVerb)
 */

import { t } from "virtual:i18n-self";
import { MATCH_MODES } from "./MatchModeToggle.js";

// ── Verb-key for describeSerializedValue ──────────────────────────────────────

/**
 * Returns the i18n key for the verb used in filter descriptions.
 *
 * ANY     → "is_list_joiner"
 * ALL     → "is_all_list_joiner"
 * EXCLUDE → "is_not_list_joiner"
 *
 * @param {string} mode – one of MATCH_MODES.*
 * @returns {string}
 */
export function matchModeVerbKey(mode) {
  if (mode === MATCH_MODES.ALL)     return "is_all_list_joiner";
  if (mode === MATCH_MODES.EXCLUDE) return "is_not_list_joiner";
  return "is_list_joiner";
}

// ── Serialize / deserialize (Text + Months share this exact shape) ────────────

/**
 * Serializes a selected array + matchMode into the URL query object.
 *
 * Format:
 *   ANY  → plain array  (keeps legacy URLs clean)
 *   else → { items: [...], mm: mode }
 *
 * Returns null when nothing is selected.
 *
 * @param {unknown[]} selected
 * @param {string}    matchMode
 * @returns {unknown[] | { items: unknown[], mm: string } | null}
 */
export function serializeListWithMode(selected, matchMode) {
  if (!selected.length) return null;
  const mode = matchMode || MATCH_MODES.ANY;
  return mode === MATCH_MODES.ANY
    ? [...selected]
    : { items: [...selected], mm: mode };
}

/**
 * Deserializes a URL query value back into { selected, matchMode }.
 * Handles the three legacy/current shapes:
 *   plain array          → ANY mode
 *   { items, mm }        → explicit mode
 *   primitive            → single-item ANY (text plugin backward-compat)
 *
 * @param {unknown} val
 * @returns {{ selected: unknown[], matchMode: string }}
 */
export function deserializeListWithMode(val) {
  if (Array.isArray(val)) {
    return { selected: val, matchMode: MATCH_MODES.ANY };
  }
  if (val && typeof val === "object" && Array.isArray(val.items)) {
    return { selected: val.items, matchMode: val.mm || MATCH_MODES.ANY };
  }
  return { selected: [val], matchMode: MATCH_MODES.ANY };
}

// ── Core flat-list matching ───────────────────────────────────────────────────

/**
 * Matches a flat list of leaf values against a selected set, respecting mode.
 *
 * Suitable for Text and Months (where leafValues are plain scalars).
 * Mapregions has region-code aliasing and cannot use this directly, but the
 * overall ANY/ALL/EXCLUDE pattern mirrors this function's logic.
 *
 * @param {unknown[]} selected   – items the user selected in the filter
 * @param {unknown[]} leafValues – scalar values present on this taxon
 * @param {string}    matchMode  – MATCH_MODES.ANY | ALL | EXCLUDE
 * @returns {boolean}
 */
export function matchesListWithMode(selected, leafValues, matchMode) {
  if (!selected.length) return true;
  const mode = matchMode || MATCH_MODES.ANY;

  if (mode === MATCH_MODES.EXCLUDE) {
    return leafValues.every(v => !selected.includes(v));
  }
  if (mode === MATCH_MODES.ALL) {
    return selected.every(v => leafValues.includes(v));
  }
  // ANY (default)
  return leafValues.some(v => selected.includes(v));
}

// ── Lifecycle factory for list-type plugins (Text, Months) ────────────────────

/**
 * Returns the 7 lifecycle methods shared by simple list-type plugins
 * (Text, Months).  Spreads into the plugin object alongside type-specific
 * UI methods (renderDropdown, getCrumbs, etc.).
 *
 * @param {string} defaultType            – "text" | "months"
 * @param {object} [opts]
 * @param {Function} [opts.skipValue]        – (v) => boolean; skip this leaf value in accumulatePossible
 * @param {Function} [opts.deserializeValue] – (v) => transformed; map each value in deserializeFromQuery
 */
export function makeListPluginLifecycle(defaultType, opts = {}) {
  const { skipValue, deserializeValue } = opts;
  return {
    createFilterDef(type) {
      return {
        type:      type || defaultType,
        all:       [],
        possible:  {},
        selected:  [],
        numeric:   null,
        matchMode: MATCH_MODES.ANY,
      };
    },

    clearFilter(fd) {
      fd.selected  = [];
      fd.matchMode = MATCH_MODES.ANY;
    },

    clearPossible(fd) { fd.possible = {}; },

    accumulatePossible(fd, _rawValue, leafValues) {
      leafValues.forEach(v => {
        if (skipValue && skipValue(v)) return;
        if (!Object.prototype.hasOwnProperty.call(fd.possible, v)) fd.possible[v] = 0;
        fd.possible[v]++;
      });
    },

    serializeToQuery(fd) {
      return serializeListWithMode(fd.selected, fd.matchMode);
    },

    deserializeFromQuery(fd, val) {
      const { selected, matchMode } = deserializeListWithMode(val);
      fd.selected  = deserializeValue ? selected.map(deserializeValue) : selected;
      fd.matchMode = matchMode;
    },

    matches(fd, _rawValue, leafValues) {
      return matchesListWithMode(fd.selected, leafValues, fd.matchMode);
    },
  };
}
/**
 * Shared utilities for range-type filter plugins (number, date, interval).
 *
 * Exports:
 *   buildRangeFilterLabel    – formats a filter operation as a human-readable string
 *   makeScalarRangeLifecycle – factory returning the 8 lifecycle methods shared by
 *                              number and date plugins (they differ only in type string
 *                              and the threshold formatter used in getCrumbs)
 *   sortedUniqueNumbers      – deduplicated sorted number array helper
 */

import { formatList } from "../../../components/Utils.js";
import { Checklist } from "../../Checklist.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function sortedUniqueNumbers(values) {
  return [...new Set((values || []).filter(v => typeof v === "number" && !isNaN(v)))]
    .sort((a, b) => a - b);
}

/**
 * Formats a string array as a human-readable list, optionally wrapping each
 * value in <strong> tags.  Used by every plugin's describeSerializedValue.
 *
 * @param {string[]} values
 * @param {{ html?: boolean }} opts
 * @returns {string}
 */
export function describeList(values, opts = {}) {
  if (!values?.length) return "";
  const open  = opts.html ? "<strong>" : "";
  const close = opts.html ? "</strong>" : "";
  return formatList(values, t("or_list_joiner"), open, close);
}

// ── Human-readable label for a range filter operation ─────────────────────────

/**
 * Builds a human-readable string describing an active range filter.
 *
 * @param {string}   dataPath        – column path, used to look up searchCategory
 * @param {string}   operation       – filter operation key (e.g. "between", "greaterequal")
 * @param {*}        threshold1      – first threshold value
 * @param {*}        threshold2      – second threshold value (used only when opDef.values > 1)
 * @param {Function} formatThreshold – (value) => string
 * @param {boolean}  omitCategory    – when true, skip the searchCategory prefix
 * @param {object}   opDef           – entry from numericFilters or intervalFilters ({ values, … })
 */
export function buildRangeFilterLabel(dataPath, operation, threshold1, threshold2, formatThreshold, omitCategory, opDef) {
  let title = omitCategory ? "" : Checklist.getMetaForDataPath(dataPath).searchCategory + " ";
  title += t("numeric_filter_" + operation + "_short") + " ";
  title += formatThreshold(threshold1);
  if (opDef?.values > 1) {
    title += " " + (operation !== "around" ? t("numeric_filter_and") : t("numeric_filter_plusminus")) + " ";
    title += formatThreshold(threshold2);
  }
  return title;
}


// ── Lifecycle method factory for scalar range types (number + date) ───────────

/**
 * Returns the eight filter-lifecycle methods that are identical between the
 * number and date plugins.  Each plugin spreads these into its own object and
 * adds its type-specific UI methods (renderDropdown, getCrumbs, etc.).
 *
 * @param {string} type          – "number" | "date"
 * @param {object} comparerTable – numericFilters (imported by the calling plugin)
 */
export function makeScalarRangeLifecycle(type, comparerTable) {
  return {
    createFilterDef() {
      return {
        type,
        all:      [],
        possible: [],
        selected: [],
        numeric:  { threshold1: null, threshold2: null, operation: "" },
        globalMin: null,
        globalMax: null,
      };
    },

    clearFilter(fd) {
      fd.selected = [];
      fd.numeric  = { threshold1: null, threshold2: null, operation: "" };
    },

    clearPossible(fd) {
      fd.possible = [];
      fd.min      = null;
      fd.max      = null;
    },

    accumulatePossible(fd, _rawValue, leafValues) {
      leafValues.forEach(v => {
        if (typeof v !== "number" || isNaN(v)) return;
        fd.possible.push(v);
        fd.min = fd.min === null ? v : Math.min(fd.min, v);
        fd.max = fd.max === null ? v : Math.max(fd.max, v);
      });
    },

    /**
     * Called once after all taxa are accumulated for a query pass.
     * Locks globalMin/Max on first encounter and re-derives selected list
     * when an operator is active (selected = all currently-passing values).
     */
    finalizeAccumulation(fd) {
      if (fd.globalMin === null) fd.globalMin = fd.min;
      if (fd.globalMax === null) fd.globalMax = fd.max;
      if (fd.numeric.operation) {
        fd.selected = sortedUniqueNumbers(fd.possible);
      }
    },

    serializeToQuery(fd) {
      if (fd.numeric.operation) {
        const opDef = comparerTable[fd.numeric.operation];
        const obj   = { o: fd.numeric.operation, a: fd.numeric.threshold1 };
        if (opDef?.values > 1) obj.b = fd.numeric.threshold2;
        return obj;
      }
      return fd.selected.length > 0 ? [...fd.selected] : null;
    },

    deserializeFromQuery(fd, val) {
      if (Array.isArray(val)) {
        fd.selected = val;
      } else if (val && typeof val === "object") {
        fd.numeric.operation  = val.o;
        fd.numeric.threshold1 = val.a;
        if ("b" in val) fd.numeric.threshold2 = val.b;
      }
    },

    matches(fd, _rawValue, leafValues) {
      if (fd.numeric.operation) {
        const comparer = comparerTable[fd.numeric.operation]?.comparer;
        return !!comparer && leafValues.some(v => comparer(v, fd.numeric.threshold1, fd.numeric.threshold2));
      }
      return leafValues.some(v => fd.selected.includes(v));
    },
  };
}

export const numericFilters = {
  equal: { operation: "equal", icon: "equal", values: 1, comparer: (v, t1) => v == t1 },
  lesser: { operation: "lesser", icon: "lesser", values: 1, comparer: (v, t1) => v < t1 },
  lesserequal: { operation: "lesserequal", icon: "lesserequal", values: 1, comparer: (v, t1) => v <= t1 },
  greater: { operation: "greater", icon: "greater", values: 1, comparer: (v, t1) => v > t1 },
  greaterequal: { operation: "greaterequal", icon: "greaterequal", values: 1, comparer: (v, t1) => v >= t1 },
  between: { operation: "between", icon: "between", values: 2, comparer: (v, t1, t2) => v >= t1 && v <= t2 },
  around: { operation: "around", icon: "around", values: 2, comparer: (v, t1, t2) => v >= t1 - t2 && v <= t1 + t2 },
};
/**
 * Shared utilities for range-type filter plugins (number, date, interval).
 *
 * Exports:
 *   buildRangeFilterLabel      – formats a filter operation as a human-readable string
 *   makeScalarRangeLifecycle   – factory: 8 lifecycle methods shared by number + date
 *   makeScalarRangeUiMethods   – factory: getCrumbs / clearCrumb / describeSerializedValue
 *                                / isActive shared by number + date (NEW)
 *   inputsOk                   – validates threshold state for any range dropdown (NEW)
 *   sortedUniqueNumbers        – deduplicated sorted number array helper
 *   numericFilters             – operator table used by number + date + interval
 *   describeList               – formats a string array as a human-readable list
 */

import { formatList } from "../../../components/Utils.js";
import { Checklist } from "../../Checklist.js";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

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

// ── Input validation ──────────────────────────────────────────────────────────

/**
 * Returns true when all shown threshold inputs contain a valid number.
 *
 * Works for both the object-style state used by DropdownInterval
 * (`state.thresholdsShown`, `state.actualThresholds`) and the
 * flat-variable style used by DropdownDate, by accepting a plain descriptor.
 *
 * @param {{ thresholdsShown: number, actualThresholds: (number|null)[] }} thresholdState
 * @returns {boolean}
 */
export function inputsOk(thresholdState) {
  for (let i = 1; i <= thresholdState.thresholdsShown; i++) {
    const v = thresholdState.actualThresholds[i];
    if (typeof v !== "number" || isNaN(v)) return false;
  }
  return true;
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

// ── UI methods factory for scalar range types (number + date) ─────────────────

/**
 * Returns the four UI-layer methods that are structurally identical between the
 * number and date plugins.  Each plugin spreads these in and supplies its own
 * `formatThreshold` function (locale number vs. dayjs date string).
 *
 * Covers: isActive, getCrumbs, clearCrumb, describeSerializedValue.
 *
 * @param {string}   type            – "number" | "date"
 * @param {object}   comparerTable   – numericFilters
 * @param {Function} formatThreshold – (value: number|null) => string
 */
export function makeScalarRangeUiMethods(type, comparerTable, formatThreshold) {
  return {
    isActive(fd) {
      return fd.selected.length > 0 || fd.numeric.operation !== "";
    },

    getCrumbs(fd, ctx) {
      const { operation, threshold1, threshold2 } = fd.numeric;
      if (operation) {
        return [{
          title: buildRangeFilterLabel(
            ctx.dataPath, operation, threshold1, threshold2,
            formatThreshold, true, comparerTable[operation]
          ),
        }];
      }
      return fd.selected.map(v => ({
        title:    formatThreshold(v),
        rawValue: v,
      }));
    },

    clearCrumb(fd, _ctx, descriptor) {
      if (descriptor.rawValue !== undefined) {
        const idx = fd.selected.indexOf(descriptor.rawValue);
        if (idx > -1) fd.selected.splice(idx, 1);
      } else {
        fd.selected = [];
        fd.numeric  = { operation: "", threshold1: null, threshold2: null };
      }
      Checklist.filter.commit();
    },

    describeSerializedValue(dataPath, serialized, opts = {}) {
      const open  = opts.html ? "<strong>" : "";
      const close = opts.html ? "</strong>" : "";
      if (Array.isArray(serialized)) {
        const cat  = opts.categoryName ?? Checklist.getMetaForDataPath(dataPath)?.searchCategory ?? "";
        const vals = serialized.map(v => formatThreshold(v));
        return cat + " " + t("is_list_joiner") + " " + describeList(vals, opts);
      }
      return buildRangeFilterLabel(
        dataPath, serialized.o, serialized.a, serialized.b,
        v => open + formatThreshold(v) + close,
        false, comparerTable[serialized.o]
      );
    },
  };
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

// ── Operator table ────────────────────────────────────────────────────────────

export const numericFilters = {
  equal:        { operation: "equal",        icon: "equal",        values: 1, comparer: (v, t1)     => v == t1 },
  lesser:       { operation: "lesser",       icon: "lesser",       values: 1, comparer: (v, t1)     => v < t1 },
  lesserequal:  { operation: "lesserequal",  icon: "lesserequal",  values: 1, comparer: (v, t1)     => v <= t1 },
  greater:      { operation: "greater",      icon: "greater",      values: 1, comparer: (v, t1)     => v > t1 },
  greaterequal: { operation: "greaterequal", icon: "greaterequal", values: 1, comparer: (v, t1)     => v >= t1 },
  between:      { operation: "between",      icon: "between",      values: 2, comparer: (v, t1, t2) => v >= t1 && v <= t2 },
  around:       { operation: "around",       icon: "around",       values: 2, comparer: (v, t1, t2) => v >= t1 - t2 && v <= t1 + t2 },
};
/**
 * filterPluginInterval — filter UI for the "interval" data type.
 *
 * Interval filters always use an operator (contains / overlaps / fully_inside)
 * with one or two numeric thresholds, previewed via a coverage histogram.
 * There is no list mode: every [from, to] range is a compound value.
 */

import m from "mithril";
import { getUnitFromTemplate, unitToHtml } from "../../components/Utils.js";
import { Checklist } from "../Checklist.js";
import { drawIntervalHistogram } from "./shared/histogramUtils.js";
import { makeNumericInputFn } from "./shared/numericInput.js";
import { buildRangeFilterLabel, describeList } from "./shared/filterUtils.js";

import "./shared/numericDropdown.css";

// ── Helpers ───────────────────────────────────────────────────────────────

export const intervalFilters = {
  contains:     { operation: "contains",     icon: "contains",     values: 1, comparer: (from, to, t1)     => from <= t1 && t1 <= to },
  overlaps:     { operation: "overlaps",     icon: "overlaps",     values: 2, comparer: (from, to, t1, t2) => from <= t2 && to >= t1 },
  fully_inside: { operation: "fully_inside", icon: "fully_inside", values: 2, comparer: (from, to, t1, t2) => from >= t1 && to <= t2 },
};

const intervalFilterOperations = ["contains", "overlaps", "fully_inside"];

function getIntervalOperationIcon(op) {
  return intervalFilters[op]?.icon || "equal";
}

/**
 * Returns a ghost/hint placeholder for a threshold input.
 *
 * contains     (1 threshold)  — the point inside the interval.
 *                               ghost: "min – max" of all intervals to show
 *                               the valid range at a glance.
 * overlaps     (2 thresholds) — [t1, t2] must overlap with intervals.
 *                               t1 ghost = min, t2 ghost = max.
 * fully_inside (2 thresholds) — interval must fit inside [t1, t2].
 *                               t1 ghost = min, t2 ghost = max.
 *
 * @param {number}      thresholdNumber – 1 or 2
 * @param {string}      op              – current operation key
 * @param {number|null} min
 * @param {number|null} max
 * @returns {string}
 */
function getIntervalPlaceholder(thresholdNumber, op, min, max) {
  const fmt = v => (v != null ? v.toLocaleString() : "");
  switch (op) {
    case "contains":
      // Single threshold: show the full possible range as orientation.
      if (thresholdNumber === 1 && min != null && max != null) {
        return min === max ? fmt(min) : fmt(min) + " \u2013 " + fmt(max);
      }
      return "";
    case "overlaps":
    case "fully_inside":
      return thresholdNumber === 1 ? fmt(min) : fmt(max);
    default:
      return "";
  }
}

// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownInterval = function (initialVnode) {
  const dropdownId = initialVnode.attrs.dropdownId;
  let dataPath = "";

  const thresholdState = {
    initialThresholds: [null, null, null],
    actualThresholds:  [null, null, null],
    thresholdsShown:   0,
  };
  let actualOperation = "contains";

  function inputsOk() {
    const opDef = intervalFilters[actualOperation];
    if (!opDef) return false;
    for (let i = 1; i <= opDef.values; i++) {
      if (typeof thresholdState.actualThresholds[i] !== "number" ||
          isNaN(thresholdState.actualThresholds[i])) return false;
    }
    return !(opDef.values === 2 && thresholdState.actualThresholds[2] < thresholdState.actualThresholds[1]);
  }

  function getFilteredPairs() {
    const opDef = intervalFilters[actualOperation];
    const all   = Checklist.filter.data[dataPath].possible || [];
    if (!inputsOk() || !opDef) return all;
    return all.filter(([from, to]) =>
      opDef.comparer(from, to, thresholdState.actualThresholds[1], thresholdState.actualThresholds[2])
    );
  }

  function countResults() { return inputsOk() ? getFilteredPairs().length : 0; }
  function canApply()     { return inputsOk() && countResults() > 0; }

  const numericInput = makeNumericInputFn({
    state:        thresholdState,
    dropdownId,
    getOperation: () => actualOperation,
    getPlaceholder(thresholdNumber) {
      const fd  = Checklist.filter.data[dataPath];
      const min = fd.min ?? fd.globalMin ?? null;
      const max = fd.max ?? fd.globalMax ?? null;
      return getIntervalPlaceholder(thresholdNumber, actualOperation, min, max);
    },
    getExtraError(thresholdNumber, thresholds, _op) {
      const opDef = intervalFilters[actualOperation];
      if (opDef?.values === 2 && thresholdNumber === 2 &&
          thresholds[2] !== null && thresholds[1] !== null &&
          thresholds[2] < thresholds[1]) return true;
      return false;
    },
  });

  let _lastHistogramKey = "";

  function redrawHistogram() {
    const fd = Checklist.filter.data[dataPath];
    const key = JSON.stringify([
      (fd.possible || []).length,
      actualOperation,
      thresholdState.actualThresholds,
    ]);
    if (key === _lastHistogramKey) return;
    _lastHistogramKey = key;
    window.setTimeout(() => {
      const allPairs = fd.possible || [];
      drawIntervalHistogram(dropdownId, allPairs, getFilteredPairs());
    }, 0);
  }

  return {
    oninit(vnode) {
      dataPath = vnode.attrs.dataPath;
      const fd     = Checklist.filter.data[dataPath];
      const saved  = fd.numeric.operation;
      thresholdState.initialThresholds = [null, fd.numeric.threshold1, fd.numeric.threshold2];
      thresholdState.actualThresholds  = [null, fd.numeric.threshold1, fd.numeric.threshold2];
      actualOperation = intervalFilterOperations.includes(saved) ? saved : "contains";
    },
    oncreate: redrawHistogram,
    onupdate: redrawHistogram,

    view(vnode) {
      dataPath = vnode.attrs.dataPath;
      thresholdState.thresholdsShown = 0;

      const fd       = Checklist.filter.data[dataPath];
      const allPairs = fd.possible || [];
      const bounds   = { min: fd.min ?? fd.globalMin ?? 0, max: fd.max ?? fd.globalMax ?? 100 };
      const unit     = getUnitFromTemplate(Checklist.getMetaForDataPath(dataPath));
      const unitTag  = unit ? m("span.filter-unit-suffix", m.trust(" " + unitToHtml(unit))) : null;

      let inputUi;
      switch (actualOperation) {
        case "contains":
          inputUi = [m(".label1", t("interval_filter_contains")), numericInput(1, bounds.min, bounds.max)];
          break;
        case "overlaps":
        case "fully_inside":
          inputUi = [
            m(".label1",  t("interval_filter_" + actualOperation)),
            numericInput(1, bounds.min, bounds.max),
            m(".label2",  t("numeric_filter_and")),
            numericInput(2, bounds.min, bounds.max),
          ];
          break;
      }
      if (unit && inputUi) inputUi = [...inputUi, m("span.filter-unit", m.trust(unitToHtml(unit)))];

      return m(".inner-dropdown-area.numeric", [
        // Operation buttons
        m(".numeric-filter-buttons",
          intervalFilterOperations.map(opKey =>
            m(".numeric-filter-button.clickable" + (actualOperation === opKey ? ".selected" : ""), {
              onclick() {
                actualOperation = opKey;
                window.setTimeout(() => {
                  const el = document.getElementById("threshold1_" + dropdownId);
                  if (el) { el.focus(); el.select?.(); }
                }, 200);
              },
            }, m("img[src=img/ui/search/interval_" + getIntervalOperationIcon(opKey) + ".svg]"))
          )
        ),

        // Input + clear
        m(".input-ui", [
          inputUi,
          m(".clear-button.clickable", {
            onclick() {
              thresholdState.initialThresholds = [null, null, null];
              thresholdState.actualThresholds  = [null, null, null];
              actualOperation = "contains";
              fd.numeric = { operation: "", threshold1: null, threshold2: null };
              Checklist.filter.commit();
            },
          }, m("img[src=img/ui/search/clear_filter_dark.svg]")),
        ]),

        // Apply
        m(".apply.clickable" + (canApply() ? "" : ".inactive"), {
          onclick() {
            if (!canApply()) return;
            fd.numeric = {
              operation:  actualOperation,
              threshold1: thresholdState.actualThresholds[1],
              threshold2: thresholdState.actualThresholds[2],
            };
            vnode.attrs.openHandler(false);
            Checklist.filter.commit();
          },
        }, countResults() === 0
          ? t("numeric_apply_show_results_no_results")
          : t("numeric_apply_show_results", [countResults()])
        ),

        // Histogram
        m(".histogram-wrap", [
          m(".histogram#histogram_" + dropdownId, {
            onclick(e) {
              this.classList.toggle("fullscreen");
              this.getElementsByTagName("svg")[0]?.classList.toggle("clickable");
              e.preventDefault(); e.stopPropagation();
            },
          }),
          m(".legend", [
            m(".legend-item", [m(".map-fill[style=background-color: #d3d3d3]"),                                     m(".map-legend-title", t("histogram_all_data"))]),
            m(".legend-item", [m(".map-fill[style=background-color: " + Checklist.getThemeHsl("light") + "]"),     m(".map-legend-title", t("histogram_displayed_data"))]),
          ]),
        ]),

        // Stats
        m("ul.stats", [
          bounds.min !== null ? m("li", [t("stats_min") + ": " + bounds.min.toLocaleString(), unitTag]) : null,
          bounds.max !== null ? m("li", [t("stats_max") + ": " + bounds.max.toLocaleString(), unitTag]) : null,
                                m("li",  t("stats_distinct") + ": " + allPairs.length.toLocaleString()),
        ]),
      ]);
    },
  };
};

// ── Plugin object ─────────────────────────────────────────────────────────────

export const filterPluginInterval = {
  supportsMatchMode: false,
  isActive(filterDef) {
    return filterDef.numeric.operation !== "";
  },

  getCount(filterDef) {
    return (filterDef.possible || []).length;
  },

  getUnit(dataPath) {
    return getUnitFromTemplate(Checklist.getMetaForDataPath(dataPath));
  },

  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownInterval, { type, dataPath, openHandler, dropdownId });
  },

  getCrumbs(fd, ctx) {
    const { operation, threshold1, threshold2 } = fd.numeric;
    if (!operation) return [];
    return [{
      title: buildRangeFilterLabel(
        ctx.dataPath, operation, threshold1, threshold2,
        v => v?.toLocaleString() ?? "", true, intervalFilters[operation]
      )
    }];
  },

  clearCrumb(filterDef, _ctx, _descriptor) {
    filterDef.numeric = { operation: "", threshold1: null, threshold2: null };
    Checklist.filter.commit();
  },

  describeSerializedValue(dataPath, serialized, opts = {}) {
    if (!serialized?.o) return "";
    const open  = opts.html ? "<strong>" : "";
    const close = opts.html ? "</strong>" : "";
    return buildRangeFilterLabel(
      dataPath, serialized.o, serialized.a, serialized.b,
      v => open + (v?.toLocaleString?.() ?? "") + close,
      false, intervalFilters[serialized.o]
    );
  },

  // ── Lifecycle ──────────────────────────────────────────────────────
  createFilterDef() {
    return {
      type: "interval",
      all: [],
      possible: [],
      selected: [],
      numeric: { threshold1: null, threshold2: null, operation: "" },
      globalMin: null,
      globalMax: null,
      min: null,
      max: null,
    };
  },

  clearFilter(fd) {
    fd.numeric = { threshold1: null, threshold2: null, operation: "" };
  },

  clearPossible(fd) {
    fd.possible = [];
    fd.min      = null;
    fd.max      = null;
  },

  accumulatePossible(fd, _rawValue, leafValues) {
    leafValues.forEach(pair => {
      if (!Array.isArray(pair) || pair.length !== 2) return;
      fd.possible.push(pair);
      fd.min = fd.min === null ? pair[0] : Math.min(fd.min, pair[0]);
      fd.max = fd.max === null ? pair[1] : Math.max(fd.max, pair[1]);
    });
  },

  finalizeAccumulation(fd) {
    if (fd.globalMin === null) fd.globalMin = fd.min;
    if (fd.globalMax === null) fd.globalMax = fd.max;
  },

  serializeToQuery(fd) {
    if (!fd.numeric.operation) return null;
    const opDef = intervalFilters[fd.numeric.operation];
    const obj = { o: fd.numeric.operation, a: fd.numeric.threshold1 };
    if (opDef?.values > 1) obj.b = fd.numeric.threshold2;
    return obj;
  },

  deserializeFromQuery(fd, val) {
    if (val && typeof val === "object") {
      fd.numeric.operation  = val.o;
      fd.numeric.threshold1 = val.a;
      if ("b" in val) fd.numeric.threshold2 = val.b;
    }
  },

  matches(fd, _rawValue, leafValues) {
    if (!fd.numeric.operation) return true;
    const comparer = intervalFilters[fd.numeric.operation]?.comparer;
    if (!comparer) return false;
    return leafValues.some(pair =>
      Array.isArray(pair) && pair.length === 2 &&
      comparer(pair[0], pair[1], fd.numeric.threshold1, fd.numeric.threshold2)
    );
  },
};
/**
 * filterPluginNumber — filter UI for the "number" data type.
 *
 * Supports two modes:
 *   list     – selectable checklist of distinct numeric values
 *   operator – ≤ / ≥ / = / between / around comparisons with histogram preview
 */

import m from "mithril";
import { getUnitFromTemplate, unitToHtml, roundWithPrecision, textLowerCaseAccentless } from "../../components/Utils.js";
import { Checklist } from "../Checklist.js";
import { DropdownCheckItemSkeleton } from "./shared/DropdownCheckItem.js";
import { drawHistogram } from "./shared/histogramUtils.js";
import { makeNumericInputFn } from "./shared/numericInput.js";
import { buildRangeFilterLabel, numericFilters, describeList, makeScalarRangeLifecycle, sortedUniqueNumbers } from "./shared/rangeFilterUtils.js";

import "./filterPluginNumber.css";
import "./shared/numericDropdown.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

const numberFilterOperations = ["list", "lesser", "lesserequal", "equal", "greaterequal", "greater", "between", "around"];

function getSortedUniqueNumericValues(values) {
  return [...new Set((values || []).filter(v => typeof v === "number" && !isNaN(v)))]
    .sort((a, b) => a - b);
}

function getNumericValueCounts(values) {
  const counts = {};
  (values || []).forEach(v => {
    if (typeof v !== "number" || isNaN(v)) return;
    counts[v] = (counts[v] || 0) + 1;
  });
  return counts;
}

function formatNumericValue(v) {
  return v?.toLocaleString?.() || v?.toString?.() || "";
}

function getNumericSummary(values) {
  let min = null, max = null, sum = 0, count = 0;
  const distinct = new Set();
  (values || []).forEach(v => {
    if (typeof v !== "number" || isNaN(v)) return;
    distinct.add(v); sum += v; count++;
    min = min === null ? v : Math.min(min, v);
    max = max === null ? v : Math.max(max, v);
  });
  return { min, max, avg: roundWithPrecision(sum / count || 0, 2), distinct: distinct.size };
}

function normalizeNumberOperation(op) {
  return numberFilterOperations.includes(op) ? op : "list";
}

function getNumberOperationIcon(op) {
  return op === "list" ? "list" : numericFilters[op].icon;
}

/**
 * Returns a ghost/hint placeholder string for a threshold input.
 *
 * Per-operation logic:
 *   lesser / lesserequal  — user specifies the upper bound → ghost = max
 *   greater / greaterequal — user specifies the lower bound → ghost = min
 *   equal                  — any point; show "min – max" range as hint
 *   between                — t1 = lower bound (min), t2 = upper bound (max)
 *   around                 — t1 = center point (midpoint), t2 = radius (no obvious default → empty)
 *
 * All returned strings are locale-formatted numbers so they match the locale
 * the user expects in the input field.
 *
 * @param {number} thresholdNumber – 1 or 2
 * @param {string} op              – current operation key
 * @param {number|null} min        – min of the preview dataset
 * @param {number|null} max        – max of the preview dataset
 * @returns {string}
 */
function getNumberPlaceholder(thresholdNumber, op, min, max) {
  const fmt = v => (v != null ? v.toLocaleString() : "");
  switch (op) {
    case "lesser":
    case "lesserequal":
      return thresholdNumber === 1 ? fmt(max) : "";
    case "greater":
    case "greaterequal":
      return thresholdNumber === 1 ? fmt(min) : "";
    case "equal":
      // Show the full range so the user knows what values exist.
      if (thresholdNumber === 1 && min != null && max != null) {
        return min === max ? fmt(min) : fmt(min) + " \u2013 " + fmt(max);
      }
      return "";
    case "between":
      return thresholdNumber === 1 ? fmt(min) : fmt(max);
    case "around":
      // Center point: show midpoint. Radius: no sensible default, leave empty.
      if (thresholdNumber === 1 && min != null && max != null) {
        return fmt(roundWithPrecision((min + max) / 2, 2));
      }
      return "";
    default:
      return "";
  }
}

// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownNumber = function (initialVnode) {
  const dropdownId = initialVnode.attrs.dropdownId;
  let dataPath = "";

  // Threshold state — shared with the numericInput builder via the `state` reference
  const thresholdState = {
    initialThresholds: [null, null, null],
    actualThresholds: [null, null, null],
    thresholdsShown: 0,
  };

  let actualOperation = "list";
  let showDistribution = false;
  let previewData = null;
  let previewDataKey = "";

  const INITIAL_LIMIT = 100;
  let itemsOverflowLimit = INITIAL_LIMIT;
  let filter = "";

  // Lazy-cached preview data (taxa passing all OTHER filters)
  function getPreviewData() {
    const key = dataPath + "|" + Checklist.filter.queryKey("data." + dataPath);
    if (!previewData || previewDataKey !== key) {
      previewDataKey = key;
      previewData = Checklist.filter.getRangeFilterPreviewData(dataPath);
    }
    return previewData;
  }

  function isListMode() { return actualOperation === "list"; }

  function getOperatorPreviewValues() { return getPreviewData().possible; }

  function getDisplayedOperatorValues() {
    const preview = getOperatorPreviewValues();
    if (isListMode() || !actualOperation || !numericFilters[actualOperation]) return preview;
    if (!inputsOk()) return preview;
    const comparer = numericFilters[actualOperation].comparer;
    return preview.filter(v => comparer(v, thresholdState.actualThresholds[1], thresholdState.actualThresholds[2]));
  }

  function inputsOk() {
    for (let i = 1; i <= thresholdState.thresholdsShown; i++) {
      if (typeof thresholdState.actualThresholds[i] !== "number" || isNaN(thresholdState.actualThresholds[i])) return false;
    }
    return true;
  }

  function countResults() {
    if (isListMode() || !inputsOk()) return 0;
    const comparer = numericFilters[actualOperation].comparer;
    return getOperatorPreviewValues().filter(v =>
      comparer(v, thresholdState.actualThresholds[1], thresholdState.actualThresholds[2])
    ).length;
  }

  function canApply() { return !isListMode() && inputsOk() && countResults() > 0; }

  function matchesFilter(v) {
    return !filter || textLowerCaseAccentless(formatNumericValue(v)).includes(filter);
  }

  // Commit a list-mode selection mutation
  function commitSelectedNumbers(mutator) {
    actualOperation = "list";
    showDistribution = false;
    thresholdState.initialThresholds = [null, null, null];
    thresholdState.actualThresholds = [null, null, null];
    const fd = Checklist.filter.data[dataPath];
    Checklist.filter.delayCommitDataPath = "data." + dataPath;
    fd.numeric = { operation: "", threshold1: null, threshold2: null };
    fd.selected = getSortedUniqueNumericValues(mutator([...(fd.selected || [])]));
    Checklist.filter.commit();
  }

  // Input builder.
  // getPlaceholder is a closure so it always reads the current preview bounds
  // and actualOperation at render time — no stale captures.
  const numericInput = makeNumericInputFn({
    state:        thresholdState,
    dropdownId,
    getOperation: () => actualOperation,
    getPlaceholder(thresholdNumber) {
      const preview = getPreviewData();
      const min = preview.min ?? Checklist.filter.data[dataPath]?.globalMin ?? null;
      const max = preview.max ?? Checklist.filter.data[dataPath]?.globalMax ?? null;
      return getNumberPlaceholder(thresholdNumber, actualOperation, min, max);
    },
    getExtraError(thresholdNumber, thresholds, op) {
      if (op === "between" && thresholdNumber === 2 && thresholds[2] !== null && thresholds[2] < thresholds[1]) return true;
      if (op === "around"  && thresholdNumber === 2 && thresholds[2] !== null && thresholds[2] <= 0) return true;
      return false;
    },
  });

  function redrawHistogramIfVisible() {
    if (isListMode() && !showDistribution) return;
    window.setTimeout(() => {
      drawHistogram(dropdownId, Checklist.filter.data[dataPath].all, isListMode()
        ? Checklist.filter.data[dataPath].possible
        : getDisplayedOperatorValues()
      );
    }, 0);
  }

  function createNumericItems(items, state, counts, conditionFn, updateFn) {
    return getSortedUniqueNumericValues(items)
      .filter(item => matchesFilter(item) && conditionFn(item))
      .map(item => {
        updateFn(item);
        return m(DropdownCheckItemSkeleton, {
          item: formatNumericValue(item),
          state,
          count: counts[item] || 0,
          action: state === "inactive" ? undefined : () => {
            commitSelectedNumbers(sel =>
              state === "checked" ? sel.filter(v => v !== item) : [...sel, item]
            );
          },
        });
      });
  }

  return {
    oninit(vnode) {
      dataPath = vnode.attrs.dataPath;
      itemsOverflowLimit = INITIAL_LIMIT;
      const fd = Checklist.filter.data[dataPath];
      thresholdState.initialThresholds = [null, fd.numeric.threshold1, fd.numeric.threshold2];
      thresholdState.actualThresholds = [null, fd.numeric.threshold1, fd.numeric.threshold2];
      actualOperation = normalizeNumberOperation(fd.numeric.operation);
      showDistribution = !isListMode();
      previewData = null;
    },
    oncreate() { redrawHistogramIfVisible(); },
    onupdate()  { redrawHistogramIfVisible(); },

    view(vnode) {
      dataPath = vnode.attrs.dataPath;
      thresholdState.thresholdsShown = 0;

      const fd = Checklist.filter.data[dataPath];
      const unit = getUnitFromTemplate(Checklist.getMetaForDataPath(dataPath));
      const unitTag = unit ? m("span.filter-unit-suffix", m.trust(" " + unitToHtml(unit))) : null;
      const preview = getPreviewData();
      const inputMin = preview.min ?? fd.globalMin;
      const inputMax = preview.max ?? fd.globalMax;
      const { min, max, avg, distinct } = getNumericSummary(isListMode() ? fd.possible : getDisplayedOperatorValues());
      const possibleCounts = getNumericValueCounts(fd.possible);
      const selectedValues = fd.selected || [];
      const allValues = getSortedUniqueNumericValues(fd.all);
      const possibleValues = getSortedUniqueNumericValues(fd.possible);

      let totalItems = 0, totalPossibleUnchecked = 0;
      let filteredPossible = [];
      let showSelected = false, showPossible = false, showImpossible = false;

      const selected = createNumericItems(selectedValues, "checked", possibleCounts,
        () => true, () => { showSelected = true; });
      const possible = createNumericItems(possibleValues, "unchecked", possibleCounts,
        item => !selectedValues.includes(item) && totalItems <= itemsOverflowLimit,
        item => { showPossible = true; totalItems++; totalPossibleUnchecked++; filteredPossible.push(item); });
      const impossible = createNumericItems(
        allValues.filter(item => !Object.prototype.hasOwnProperty.call(possibleCounts, item) && !selectedValues.includes(item)),
        "inactive", possibleCounts,
        () => totalItems <= itemsOverflowLimit,
        () => { showImpossible = true; totalItems++; });
      const itemsOverflowing = totalItems > itemsOverflowLimit;

      // Build operator input UI
      let inputUi = null;
      switch (actualOperation) {
        case "equal":        inputUi = [m(".label1", t("numeric_filter_equal")),        numericInput(1, inputMin, inputMax)]; break;
        case "lesser":       inputUi = [m(".label1", t("numeric_filter_lesser")),       numericInput(1, inputMin, inputMax)]; break;
        case "lesserequal":  inputUi = [m(".label1", t("numeric_filter_lesserequal")),  numericInput(1, inputMin, inputMax)]; break;
        case "greater":      inputUi = [m(".label1", t("numeric_filter_greater")),      numericInput(1, inputMin, inputMax)]; break;
        case "greaterequal": inputUi = [m(".label1", t("numeric_filter_greaterequal")), numericInput(1, inputMin, inputMax)]; break;
        case "between":      inputUi = [m(".label1", t("numeric_filter_between")),      numericInput(1, inputMin, inputMax), m(".label2", t("numeric_filter_and")),      numericInput(2, inputMin, inputMax)]; break;
        case "around":       inputUi = [m(".label1", t("numeric_filter_around")),       numericInput(1, inputMin, inputMax), m(".label2", t("numeric_filter_plusminus")), numericInput(2, inputMin, inputMax)]; break;
        default: break;
      }
      if (unit && inputUi) inputUi = [...inputUi, m("span.filter-unit", m.trust(unitToHtml(unit)))];

      return m(".inner-dropdown-area.numeric", [
        // Operation selector buttons
        m(".numeric-filter-buttons", numberFilterOperations.map(key =>
          m(".numeric-filter-button.clickable" + (actualOperation === key ? ".selected" : ""), {
            onclick() {
              actualOperation = key;
              if (isListMode()) { showDistribution = false; return; }
              showDistribution = true;
              window.setTimeout(() => {
                const el = document.getElementById("threshold1_" + dropdownId);
                if (el) { el.focus(); el.select?.(); }
              }, 200);
            },
          }, m("img[src=img/ui/search/numeric_" + getNumberOperationIcon(key) + ".svg]"))
        )),

        // Operator input row
        !isListMode()
          ? m(".input-ui", [
            inputUi,
            m(".clear-button.clickable", {
              onclick() {
                actualOperation = "list";
                showDistribution = false;
                fd.selected = [];
                fd.numeric = { operation: "", threshold1: null, threshold2: null };
                thresholdState.initialThresholds = [null, null, null];
                thresholdState.actualThresholds = [null, null, null];
                Checklist.filter.commit();
              },
            }, m("img[src=img/ui/search/clear_filter_dark.svg]")),
          ])
          : null,

        // Operator apply button
        !isListMode()
          ? m(".apply.clickable" + (canApply() ? "" : ".inactive"), {
            onclick() {
              if (!canApply()) return;
              const comparer = numericFilters[actualOperation].comparer;
              fd.selected = getSortedUniqueNumericValues(
                getOperatorPreviewValues().filter(v =>
                  comparer(v, thresholdState.actualThresholds[1], thresholdState.actualThresholds[2])
                )
              );
              fd.numeric = { operation: actualOperation, threshold1: thresholdState.actualThresholds[1], threshold2: thresholdState.actualThresholds[2] };
              vnode.attrs.openHandler(false);
              Checklist.filter.commit();
            },
          }, countResults() === 0
            ? t("numeric_apply_show_results_no_results")
            : t("numeric_apply_show_results", [countResults()]))
          : null,

        // List mode: search box
        isListMode()
          ? m(".search-filter",
            m("input.options-search[type=search][placeholder=" + t("search") + "][id=" + vnode.attrs.dropdownId + "_text]", {
              oninput() {
                filter = this.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              },
            })
          )
          : null,

        // List mode: item checklist
        isListMode()
          ? m(".options", [
            showSelected ? m(".options-section", selected) : null,
            showPossible ? m(".options-section", possible) : null,
            showImpossible ? m(".options-section", impossible) : null,
            itemsOverflowing
              ? m(".show-next-items", { onclick() { itemsOverflowLimit += INITIAL_LIMIT; } },
                t("next_items_dropdown", [INITIAL_LIMIT]))
              : null,
            !showSelected && !showPossible && !showImpossible
              ? m(".no-items-filter", t("no_items_filter"))
              : null,
          ])
          : null,

        // List mode: check-all-shown
        isListMode() && filter.length > 0 && totalPossibleUnchecked > 1
          ? m(".apply", {
            onclick() {
              commitSelectedNumbers(sel => [...sel, ...filteredPossible]);
              vnode.attrs.openHandler(false);
            },
          }, t("check_all_shown"))
          : null,

        // Distribution toggle (list mode only)
        isListMode()
          ? m(".distribution-toggle.clickable" + (showDistribution ? ".expanded" : ""), {
            onclick() { showDistribution = !showDistribution; },
          }, [
            m("img.distribution-toggle-icon[src=img/ui/search/expand.svg]"),
            m(".distribution-toggle-label",
              showDistribution ? t("histogram_toggle_hide") : t("histogram_toggle_show")),
          ])
          : null,

        // Histogram
        (!isListMode() || showDistribution)
          ? m(".histogram-wrap", [
            m(".histogram#histogram_" + dropdownId, {
              onclick(e) {
                const svg = this.getElementsByTagName("svg")[0];
                this.classList.toggle("fullscreen");
                if (svg) svg.classList.toggle("clickable");
                e.preventDefault(); e.stopPropagation();
              },
            }),
            m(".legend", [
              m(".legend-item", [m(".map-fill[style=background-color: #d3d3d3]"), m(".map-legend-title", t("histogram_all_data"))]),
              m(".legend-item", [m(".map-fill[style=background-color: " + Checklist.getThemeHsl("light") + "]"), m(".map-legend-title", t("histogram_displayed_data"))]),
            ]),
          ])
          : null,

        // Stats
        (!isListMode() || showDistribution)
          ? m("ul.stats", [
            min !== null ? m("li", [t("stats_min") + ": " + min.toLocaleString(), unitTag]) : null,
            max !== null ? m("li", [t("stats_max") + ": " + max.toLocaleString(), unitTag]) : null,
            m("li", [t("stats_avg") + ": " + avg.toLocaleString(), unitTag]),
            m("li", t("stats_distinct") + ": " + distinct.toLocaleString()),
          ])
          : null,

        // List mode: apply / close
        isListMode()
          ? m(".apply", {
            onclick() {
              if (fd.numeric.operation !== "") {
                commitSelectedNumbers(sel => sel);
                vnode.attrs.openHandler(false);
                return;
              }
              vnode.attrs.openHandler(false);
            },
          }, t("apply_selection"))
          : null,
      ]);
    },
  };
};

// ── Plugin object ─────────────────────────────────────────────────────────────

export const filterPluginNumber = {
  meta: {
    filterType: "numeric-range",
    filterLabel: "Numeric range",
    filterDescription: "Shows a range control with operations: equal to, less than, less than or equal, greater than, greater than or equal, between (two bounds), and around (value ± margin).",
  },
  // ── UI ───────────────────────────────────────────────────────────
  isActive(fd) {
    return fd.selected.length > 0 || fd.numeric.operation !== "";
  },
  getCount(fd) {
    return sortedUniqueNumbers(fd.possible).length;
  },
  getUnit(dataPath) {
    return getUnitFromTemplate(Checklist.getMetaForDataPath(dataPath));
  },
  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownNumber, { type, dataPath, openHandler, dropdownId });
  },
  getCrumbs(fd, ctx) {
    const { operation, threshold1, threshold2 } = fd.numeric;
    if (operation) {
      return [{
        title: buildRangeFilterLabel(
          ctx.dataPath, operation, threshold1, threshold2,
          v => v?.toLocaleString() ?? "", true, numericFilters[operation]
        )
      }];
    }
    return fd.selected.map(v => ({ title: v?.toLocaleString?.() ?? String(v), rawValue: v }));
  },
  clearCrumb(fd, _ctx, descriptor) {
    if (descriptor.rawValue !== undefined) {
      const idx = fd.selected.indexOf(descriptor.rawValue);
      if (idx > -1) fd.selected.splice(idx, 1);
    } else {
      fd.selected = [];
      fd.numeric = { operation: "", threshold1: null, threshold2: null };
    }
    Checklist.filter.commit();
  },

  describeSerializedValue(dataPath, serialized, opts = {}) {
    const open  = opts.html ? "<strong>" : "";
    const close = opts.html ? "</strong>" : "";
    if (Array.isArray(serialized)) {
      const cat  = opts.categoryName ?? Checklist.getMetaForDataPath(dataPath)?.searchCategory ?? "";
      const vals = serialized.map(v => v?.toLocaleString?.() ?? String(v));
      return cat + " " + t("is_list_joiner") + " " + describeList(vals, opts);
    }
    return buildRangeFilterLabel(
      dataPath, serialized.o, serialized.a, serialized.b,
      v => open + (v?.toLocaleString?.() ?? "") + close,
      false, numericFilters[serialized.o]
    );
  },

  // ── Lifecycle (shared with date) ──────────────────────────────────
  ...makeScalarRangeLifecycle("number", numericFilters),
};
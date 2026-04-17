/**
 * filterPluginNumber - filter UI for the "number" data type.
 *
 * Supports two modes:
 *   list     – selectable checklist of distinct numeric values
 *   operator – ≤ / ≥ / = / between / around comparisons with histogram preview
 */

import m from "mithril";
import { t } from "virtual:i18n-self";
import { getUnitFromTemplate, unitToHtml, roundWithPrecision, textLowerCaseAccentless } from "../../components/Utils.js";
import { Checklist } from "../Checklist.js";
import { DropdownCheckItemSkeleton } from "./shared/DropdownCheckItem.js";
import { drawHistogram } from "./shared/histogramUtils.js";
import { makeNumericInputFn } from "./shared/numericInput.js";
import {
  buildRangeFilterLabel, numericFilters, describeList,
  makeScalarRangeLifecycle, makeScalarRangeUiMethods,
  sortedUniqueNumbers,
} from "./shared/filterUtils.js";
import {
  countValues, getOperationIcon, isListMode,
  makeOperationNormalizer, makePreviewDataCache,
  commitListSelection, renderSearchInput, renderOptionsSections,
} from "./shared/listModeUtils.js";
import { renderHistogramWrap } from "./shared/histogramWidget.js";

import "./filterPluginNumber.css";
import "./shared/numericDropdown.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

const numberFilterOperations = ["list", "lesser", "lesserequal", "equal", "greaterequal", "greater", "between", "around"];

// Replaces the duplicate getSortedUniqueNumericValues (≡ sortedUniqueNumbers in filterUtils)
const getSortedUniqueNumericValues = sortedUniqueNumbers;

// Replaces the local getNumericValueCounts (≡ countValues in listModeUtils)
const getNumericValueCounts = countValues;

const normalizeNumberOperation = makeOperationNormalizer(numberFilterOperations, "list");

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

/**
 * Returns a ghost/hint placeholder string for a threshold input.
 * (See full JSDoc in the original file; logic unchanged.)
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
      if (thresholdNumber === 1 && min != null && max != null) {
        return min === max ? fmt(min) : fmt(min) + " \u2013 " + fmt(max);
      }
      return "";
    case "between":
      return thresholdNumber === 1 ? fmt(min) : fmt(max);
    case "around":
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

  const thresholdState = {
    initialThresholds: [null, null, null],
    actualThresholds:  [null, null, null],
    thresholdsShown:   0,
  };

  let actualOperation  = "list";
  let showDistribution = false;

  const INITIAL_LIMIT = 100;
  let itemsOverflowLimit = INITIAL_LIMIT;
  let filter = "";

  // Lazy preview-data cache (replaces inline cache in original)
  const previewCache = makePreviewDataCache();
  const getPreviewData        = () => previewCache.get(dataPath);
  const getOperatorPreviewValues = () => getPreviewData().possible;

  function getDisplayedOperatorValues() {
    const preview = getOperatorPreviewValues();
    if (isListMode(actualOperation) || !numericFilters[actualOperation]) return preview;
    if (!thresholdState.thresholdsShown) return preview;
    const t1 = thresholdState.actualThresholds[1];
    const t2 = thresholdState.actualThresholds[2];
    const comparer = numericFilters[actualOperation].comparer;
    return preview.filter(v => comparer(v, t1, t2));
  }

  function countResults() {
    if (isListMode(actualOperation) || !thresholdState.thresholdsShown) return 0;
    const comparer = numericFilters[actualOperation].comparer;
    const t1 = thresholdState.actualThresholds[1];
    const t2 = thresholdState.actualThresholds[2];
    return getOperatorPreviewValues().filter(v => comparer(v, t1, t2)).length;
  }

  function canApply() { return !isListMode(actualOperation) && countResults() > 0; }

  function matchesFilter(v) {
    return !filter || textLowerCaseAccentless(formatNumericValue(v)).includes(filter);
  }

  // Delegates to shared commitListSelection (replaces local commitSelectedNumbers)
  function commitSelectedNumbers(mutator) {
    commitListSelection(
      Checklist.filter.data[dataPath], dataPath,
      getSortedUniqueNumericValues, mutator,
      {
        setOperation:         op  => { actualOperation = op; showDistribution = false; },
        setInitialThresholds: arr => { thresholdState.initialThresholds = arr; },
        setActualThresholds:  arr => { thresholdState.actualThresholds  = arr; },
      }
    );
  }

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
      if (op === "between" && thresholdNumber === 2 &&
          thresholds[2] !== null && thresholds[1] !== null &&
          thresholds[2] < thresholds[1]) return true;
      return false;
    },
  });

  let _lastHistogramKey = "";
  function redrawHistogram() {
    const key = JSON.stringify([dataPath, actualOperation, thresholdState.actualThresholds]);
    if (key === _lastHistogramKey) return;
    _lastHistogramKey = key;
    window.setTimeout(() => {
      drawHistogram(dropdownId, getOperatorPreviewValues(), getDisplayedOperatorValues());
    }, 0);
  }

  return {
    oninit(vnode) {
      dataPath = vnode.attrs.dataPath;
      const fd   = Checklist.filter.data[dataPath];
      const saved = fd.numeric.operation;
      thresholdState.initialThresholds = [null, fd.numeric.threshold1, fd.numeric.threshold2];
      thresholdState.actualThresholds  = [null, fd.numeric.threshold1, fd.numeric.threshold2];
      actualOperation  = normalizeNumberOperation(saved);
      showDistribution = !isListMode(actualOperation);
    },
    oncreate: redrawHistogram,
    onupdate: redrawHistogram,

    view(vnode) {
      dataPath = vnode.attrs.dataPath;
      thresholdState.thresholdsShown = 0;

      const fd = Checklist.filter.data[dataPath];
      const preview = getPreviewData();
      const { min, max, avg, distinct } = getNumericSummary(preview.possible);
      const unit    = getUnitFromTemplate(Checklist.getMetaForDataPath(dataPath));
      const unitTag = unit ? m("span.filter-unit-suffix", m.trust(" " + unitToHtml(unit))) : null;

      // Build list-mode check items
      const allValues       = getSortedUniqueNumericValues(preview.possible);
      const possibleCounts  = getNumericValueCounts(preview.possible);
      const selectedValues  = fd.selected || [];

      let showSelected = false, showPossible = false, showImpossible = false;
      let totalItems = 0, totalPossibleUnchecked = 0;
      const filteredPossible = [];

      const selected = selectedValues
        .filter(matchesFilter)
        .map(v => {
          showSelected = true;
          return m(DropdownCheckItemSkeleton, {
            key: v, item: formatNumericValue(v),
            state: "checked", count: possibleCounts[v] || 0,
            action() { commitSelectedNumbers(sel => sel.filter(s => s !== v)); },
          });
        });

      const possible = allValues
        .filter(v => !selectedValues.includes(v) && matchesFilter(v) && totalItems < itemsOverflowLimit)
        .map(v => {
          showPossible = true; totalItems++; totalPossibleUnchecked++;
          filteredPossible.push(v);
          return m(DropdownCheckItemSkeleton, {
            key: v, item: formatNumericValue(v),
            state: "unchecked", count: possibleCounts[v] || 0,
            action() { commitSelectedNumbers(sel => [...sel, v]); },
          });
        });

      const impossible = allValues
        .filter(v => !selectedValues.includes(v) && !Object.prototype.hasOwnProperty.call(possibleCounts, v) && matchesFilter(v) && totalItems < itemsOverflowLimit)
        .map(v => {
          showImpossible = true; totalItems++;
          return m(DropdownCheckItemSkeleton, {
            key: v, item: formatNumericValue(v), state: "inactive", count: 0,
          });
        });

      const itemsOverflowing = totalItems > itemsOverflowLimit;

      let inputUi;
      switch (actualOperation) {
        case "lesser": case "lesserequal":
          inputUi = [m(".label1", t("numeric_filter_" + actualOperation)), numericInput(1, min, max)]; break;
        case "greater": case "greaterequal":
          inputUi = [m(".label1", t("numeric_filter_" + actualOperation)), numericInput(1, min, max)]; break;
        case "equal":
          inputUi = [m(".label1", t("numeric_filter_equal")), numericInput(1, min, max)]; break;
        case "between":
          inputUi = [m(".label1", t("numeric_filter_between")), numericInput(1, min, max), m(".label2", t("numeric_filter_and")), numericInput(2, min, max)]; break;
        case "around":
          inputUi = [m(".label1", t("numeric_filter_around")), numericInput(1, min, max), m(".label2", t("numeric_filter_plusminus")), numericInput(2, min, max)]; break;
        default: inputUi = null;
      }
      if (unit && inputUi) inputUi = [...inputUi, m("span.filter-unit", m.trust(unitToHtml(unit)))];

      return m(".inner-dropdown-area.numeric", [
        // Operation buttons
        m(".numeric-filter-buttons",
          numberFilterOperations.map(key =>
            m(".numeric-filter-button.clickable" + (actualOperation === key ? ".selected" : ""), {
              onclick() {
                actualOperation = key;
                if (isListMode(actualOperation)) { showDistribution = false; return; }
                showDistribution = true;
                window.setTimeout(() => {
                  const el = document.getElementById("threshold1_" + dropdownId);
                  if (el) { el.focus(); el.select?.(); }
                }, 200);
              },
            }, m("img[src=img/ui/search/numeric_" + getOperationIcon(key, numericFilters) + ".svg]"))
          )
        ),

        // Operator input row
        !isListMode(actualOperation)
          ? m(".input-ui", [
              inputUi,
              m(".clear-button.clickable", {
                onclick() {
                  actualOperation  = "list";
                  showDistribution = false;
                  fd.selected = [];
                  fd.numeric  = { operation: "", threshold1: null, threshold2: null };
                  thresholdState.initialThresholds = [null, null, null];
                  thresholdState.actualThresholds  = [null, null, null];
                  Checklist.filter.commit();
                },
              }, m("img[src=img/ui/search/clear_filter_dark.svg]")),
            ])
          : null,

        // Operator apply
        !isListMode(actualOperation)
          ? m(".apply.clickable" + (canApply() ? "" : ".inactive"), {
              onclick() {
                if (!canApply()) return;
                const comparer = numericFilters[actualOperation].comparer;
                const t1 = thresholdState.actualThresholds[1];
                const t2 = thresholdState.actualThresholds[2];
                fd.selected = getSortedUniqueNumericValues(
                  getOperatorPreviewValues().filter(v => comparer(v, t1, t2))
                );
                fd.numeric = { operation: actualOperation, threshold1: t1, threshold2: t2 };
                vnode.attrs.openHandler(false);
                Checklist.filter.commit();
              },
            }, countResults() === 0
              ? t("numeric_apply_show_results_no_results")
              : t("numeric_apply_show_results", [countResults()]))
          : null,

        // List mode: search box (shared renderSearchInput)
        isListMode(actualOperation)
          ? renderSearchInput(dropdownId, val => { filter = val; })
          : null,

        // List mode: item list (shared renderOptionsSections)
        isListMode(actualOperation)
          ? renderOptionsSections(
              { showSelected, selected, showPossible, possible, showImpossible, impossible, itemsOverflowing },
              () => { itemsOverflowLimit += INITIAL_LIMIT; },
              INITIAL_LIMIT
            )
          : null,

        // List mode: check-all-shown
        isListMode(actualOperation) && filter.length > 0 && totalPossibleUnchecked > 1
          ? m(".apply", {
              onclick() {
                commitSelectedNumbers(sel => [...sel, ...filteredPossible]);
                vnode.attrs.openHandler(false);
              },
            }, t("check_all_shown"))
          : null,

        // Distribution toggle (list mode only)
        isListMode(actualOperation)
          ? m(".distribution-toggle.clickable" + (showDistribution ? ".expanded" : ""), {
              onclick() { showDistribution = !showDistribution; },
            }, [
              m("img.distribution-toggle-icon[src=img/ui/search/expand.svg]"),
              m(".distribution-toggle-label",
                showDistribution ? t("histogram_toggle_show") : t("histogram_toggle_hide")),
            ])
          : null,

        // Histogram (shared renderHistogramWrap)
        (!isListMode(actualOperation) || showDistribution)
          ? renderHistogramWrap(dropdownId)
          : null,

        // Stats
        (!isListMode(actualOperation) || showDistribution)
          ? m("ul.stats", [
              min !== null ? m("li", [t("stats_min") + ": " + min.toLocaleString(), unitTag]) : null,
              max !== null ? m("li", [t("stats_max") + ": " + max.toLocaleString(), unitTag]) : null,
              m("li", [t("stats_avg") + ": " + avg.toLocaleString(), unitTag]),
              m("li", t("stats_distinct") + ": " + distinct.toLocaleString()),
            ])
          : null,

        // List mode: apply / close
        isListMode(actualOperation)
          ? m(".apply", {
              onclick() {
                if (fd.numeric.operation !== "") {
                  commitSelectedNumbers(sel => sel);
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
  supportsMatchMode: false,

  getCount(fd) {
    return sortedUniqueNumbers(fd.possible).length;
  },

  getUnit(dataPath) {
    return getUnitFromTemplate(Checklist.getMetaForDataPath(dataPath));
  },

  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownNumber, { type, dataPath, openHandler, dropdownId });
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

  // isActive, getCrumbs, describeSerializedValue from shared factory
  ...makeScalarRangeUiMethods("number", numericFilters, v => v?.toLocaleString() ?? ""),

  // Lifecycle: createFilterDef, clearFilter, clearPossible, accumulatePossible,
  //            finalizeAccumulation, serializeToQuery, deserializeFromQuery, matches
  ...makeScalarRangeLifecycle("number", numericFilters),
};
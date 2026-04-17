/**
 * filterPluginDate - filter UI for the "date" data type.
 *
 * Mirrors filterPluginNumber in structure (list mode + operator mode) but uses
 * native date inputs and dayjs for threshold parsing and display.
 */

import dayjs from "dayjs";
import m from "mithril";
import { t } from "virtual:i18n-self";
import { Checklist } from "../Checklist.js";
import { DropdownCheckItemSkeleton } from "./shared/DropdownCheckItem.js";
import { textLowerCaseAccentless } from "../../components/Utils.js";
import {
  describeList, buildRangeFilterLabel, numericFilters,
  makeScalarRangeLifecycle, makeScalarRangeUiMethods,
  sortedUniqueNumbers,
} from "./shared/filterUtils.js";
import {
  countValues, getOperationIcon, isListMode,
  makeOperationNormalizer, makePreviewDataCache,
  commitListSelection, renderSearchInput, renderOptionsSections,
} from "./shared/listModeUtils.js";

import "./filterPluginDate.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DATE_INPUT_FORMAT   = "YYYY-MM-DD";
const dateFilterOperations = ["list", "equal", "lesserequal", "greaterequal", "between"];

// Replaces local getSortedUniqueDateValues (≡ sortedUniqueNumbers)
const getSortedUniqueDateValues = sortedUniqueNumbers;

// Replaces local getDateValueCounts (≡ countValues)
const getDateValueCounts = countValues;

const normalizeDateOperation = makeOperationNormalizer(
  dateFilterOperations, "list",
  { lesser: "lesserequal", greater: "greaterequal" }
);

function formatDateValue(timestamp) {
  const d = dayjs(timestamp);
  return d.isValid() ? d.format(Checklist.getCurrentDateFormat()) : (timestamp?.toString?.() || "");
}

function getDateGroupTitle(timestamp) {
  const d = dayjs(timestamp);
  return d.isValid() ? d.format("YYYY") : "";
}

// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownDate = function (initialVnode) {
  const dropdownId = initialVnode.attrs.dropdownId;
  let dataPath = "";

  // Threshold state uses the same shape as Number/Interval so inputsOk() works
  const thresholdState = {
    initialThresholds: [null, null, null],
    actualThresholds:  [null, null, null],
    thresholdsShown:   0,
  };

  let actualOperation = "list";

  const INITIAL_LIMIT = 100;
  let itemsOverflowLimit = INITIAL_LIMIT;
  let filter = "";

  // Lazy preview-data cache (replaces inline duplication)
  const previewCache = makePreviewDataCache();
  const getPreviewData           = () => previewCache.get(dataPath);
  const getOperatorPreviewValues = () => getPreviewData().possible;

  function getDisplayedOperatorValues() {
    const preview = getOperatorPreviewValues();
    if (isListMode(actualOperation) || !numericFilters[actualOperation]) return preview;
    if (!thresholdState.thresholdsShown) return preview;
    const comparer = numericFilters[actualOperation].comparer;
    return preview.filter(v => comparer(v, thresholdState.actualThresholds[1], thresholdState.actualThresholds[2]));
  }

  function countResults() {
    if (isListMode(actualOperation) || !thresholdState.thresholdsShown) return 0;
    const comparer = numericFilters[actualOperation].comparer;
    return getOperatorPreviewValues()
      .filter(v => comparer(v, thresholdState.actualThresholds[1], thresholdState.actualThresholds[2])).length;
  }

  function canApply() { return !isListMode(actualOperation) && countResults() > 0; }

  function matchesFilter(ts) {
    return !filter || textLowerCaseAccentless(formatDateValue(ts)).includes(filter);
  }

  function formatDateForInput(ts) {
    if (ts === null || ts === undefined) return null;
    const d = dayjs(ts);
    return d.isValid() ? d.format(DATE_INPUT_FORMAT) : null;
  }

  function dateInput(thresholdNumber, min, max) {
    thresholdState.thresholdsShown++;
    const initialVal   = thresholdState.initialThresholds[thresholdNumber];
    const actualVal    = thresholdState.actualThresholds[thresholdNumber];
    const currentValue = initialVal !== null ? formatDateForInput(initialVal) : formatDateForInput(actualVal);

    let isInputError = actualVal !== null && (typeof actualVal !== "number" || isNaN(actualVal));
    if (actualOperation === "between" && thresholdNumber === 2 &&
        actualVal !== null && thresholdState.actualThresholds[1] !== null &&
        actualVal < thresholdState.actualThresholds[1]) {
      isInputError = true;
    }

    return m(
      "input" +
        (actualVal !== null && isInputError ? ".error" : "") +
        "[id=threshold" + thresholdNumber + "_" + dropdownId + "]" +
        "[type=date][name=threshold" + thresholdNumber + "]" +
        (min ? "[min=" + min + "]" : "") +
        (max ? "[max=" + max + "]" : "") +
        (currentValue ? "[value=" + currentValue + "]" : ""),
      {
        oninput() {
          thresholdState.initialThresholds[thresholdNumber] = null;
          if (this.value.trim() === "") { thresholdState.actualThresholds[thresholdNumber] = null; return; }
          const parsed = dayjs(this.value);
          thresholdState.actualThresholds[thresholdNumber] = parsed.isValid() ? parsed.valueOf() : null;
        },
      }
    );
  }

  // Delegates to shared commitListSelection (replaces local commitSelectedDates)
  function commitSelectedDates(mutator) {
    commitListSelection(
      Checklist.filter.data[dataPath], dataPath,
      getSortedUniqueDateValues, mutator,
      {
        setOperation:         op  => { actualOperation = op; },
        setInitialThresholds: arr => { thresholdState.initialThresholds = arr; },
        setActualThresholds:  arr => { thresholdState.actualThresholds  = arr; },
      }
    );
  }

  function createDateItems(items, state, counts, conditionFn, updateFn) {
    const visible = getSortedUniqueDateValues(items).filter(item => matchesFilter(item) && conditionFn(item));
    visible.forEach(item => updateFn(item));

    let currentGroup = "";
    const rows = [];

    visible.forEach(item => {
      const thisGroup = getDateGroupTitle(item);
      if (currentGroup !== thisGroup) {
        const groupItems = visible.filter(c => getDateGroupTitle(c) === thisGroup);
        if (groupItems.length > 0) {
          rows.push(m(DropdownCheckItemSkeleton, {
            state, item: thisGroup, count: "",
            action: state === "inactive" ? undefined : () => {
              commitSelectedDates(sel =>
                state === "checked"
                  ? sel.filter(v => !groupItems.includes(v))
                  : [...sel, ...groupItems]
              );
            },
          }));
        }
        currentGroup = thisGroup;
      }
      rows.push(m(DropdownCheckItemSkeleton, {
        item: formatDateValue(item),
        group: thisGroup, state,
        count: counts[item] || 0,
        action: state === "inactive" ? undefined : () => {
          commitSelectedDates(sel =>
            state === "checked" ? sel.filter(v => v !== item) : [...sel, item]
          );
        },
      }));
    });

    return rows;
  }

  return {
    oninit(vnode) {
      dataPath = vnode.attrs.dataPath;
      const fd   = Checklist.filter.data[dataPath];
      const saved = fd.numeric.operation;
      thresholdState.initialThresholds = [null, fd.numeric.threshold1, fd.numeric.threshold2];
      thresholdState.actualThresholds  = [null, fd.numeric.threshold1, fd.numeric.threshold2];
      actualOperation = normalizeDateOperation(saved);
    },

    view(vnode) {
      dataPath = vnode.attrs.dataPath;
      thresholdState.thresholdsShown = 0;

      const fd           = Checklist.filter.data[dataPath];
      const preview      = getPreviewData();
      const allDates     = getSortedUniqueDateValues(preview.possible);
      const possibleCounts = getDateValueCounts(preview.possible);
      const selectedDates  = fd.selected || [];
      const dateFormat     = Checklist.getCurrentDateFormat();
      const statsMin       = preview.min ?? fd.globalMin ?? null;
      const statsMax       = preview.max ?? fd.globalMax ?? null;

      const inputMin = formatDateForInput(statsMin);
      const inputMax = formatDateForInput(statsMax);

      let totalItems = 0, totalPossibleUnchecked = 0;
      const filteredPossible = [];
      let showSelected = false, showPossible = false, showImpossible = false;

      const selected = createDateItems(
        allDates.filter(item => selectedDates.includes(item)),
        "checked", possibleCounts,
        () => totalItems <= itemsOverflowLimit,
        () => { showSelected = true; totalItems++; }
      );
      const possible = createDateItems(
        allDates.filter(item => Object.prototype.hasOwnProperty.call(possibleCounts, item)),
        "unchecked", possibleCounts,
        item => !selectedDates.includes(item) && totalItems <= itemsOverflowLimit,
        item => { showPossible = true; totalItems++; totalPossibleUnchecked++; filteredPossible.push(item); }
      );
      const impossible = createDateItems(
        allDates.filter(item => !Object.prototype.hasOwnProperty.call(possibleCounts, item) && !selectedDates.includes(item)),
        "inactive", possibleCounts,
        () => totalItems <= itemsOverflowLimit,
        () => { showImpossible = true; totalItems++; }
      );
      const itemsOverflowing = totalItems > itemsOverflowLimit;

      let inputUi = null;
      switch (actualOperation) {
        case "equal":        inputUi = [m(".label1", t("numeric_filter_equal")),        dateInput(1, inputMin, inputMax)]; break;
        case "lesserequal":  inputUi = [m(".label1", t("numeric_filter_lesserequal")),  dateInput(1, inputMin, inputMax)]; break;
        case "greaterequal": inputUi = [m(".label1", t("numeric_filter_greaterequal")), dateInput(1, inputMin, inputMax)]; break;
        case "between":      inputUi = [m(".label1", t("numeric_filter_between")), dateInput(1, inputMin, inputMax), m(".label2", t("numeric_filter_and")), dateInput(2, inputMin, inputMax)]; break;
        default: break;
      }

      const areaClass = ".inner-dropdown-area.numeric" + (isListMode(actualOperation) ? "" : ".operator-mode");

      return m(areaClass, [
        // Operation buttons
        m(".numeric-filter-buttons", dateFilterOperations.map(key => [
          m(".numeric-filter-button.clickable" + (actualOperation === key ? ".selected" : ""), {
            onclick() {
              actualOperation = key;
              if (!isListMode(actualOperation)) {
                window.setTimeout(() => {
                  const el = document.getElementById("threshold1_" + dropdownId);
                  if (el) el.focus();
                }, 200);
              }
            },
          }, m("img[src=img/ui/search/numeric_" + getOperationIcon(key, numericFilters) + ".svg]")),
          key === "list" ? m(".separator") : null,
        ])),

        // Operator input row
        !isListMode(actualOperation)
          ? m(".input-ui", [
              inputUi,
              m(".clear-button.clickable", {
                onclick() {
                  actualOperation = "list";
                  fd.numeric      = { operation: "", threshold1: null, threshold2: null };
                  fd.selected     = [];
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
                fd.selected = getSortedUniqueDateValues(
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

        // Stats (always visible)
        m("ul.stats", [
          statsMin !== null ? m("li", t("stats_min") + ": " + dayjs(statsMin).format(dateFormat)) : null,
          statsMax !== null ? m("li", t("stats_max") + ": " + dayjs(statsMax).format(dateFormat)) : null,
        ]),

        // List mode: search box (shared)
        isListMode(actualOperation)
          ? renderSearchInput(dropdownId, val => { filter = val; })
          : null,

        // List mode: item list (shared)
        isListMode(actualOperation)
          ? renderOptionsSections(
              { showSelected, selected, showPossible, possible, showImpossible, impossible, itemsOverflowing },
              () => { itemsOverflowLimit += INITIAL_LIMIT; },
              INITIAL_LIMIT
            )
          : null,

        // List mode: check all shown
        isListMode(actualOperation) && filter.length > 0 && totalPossibleUnchecked > 1
          ? m(".apply", {
              onclick() {
                commitSelectedDates(sel => [...sel, ...filteredPossible]);
                vnode.attrs.openHandler(false);
              },
            }, t("check_all_shown"))
          : null,

        // List mode: apply / close
        isListMode(actualOperation)
          ? m(".apply", {
              onclick() {
                if (fd.numeric.operation !== "") {
                  commitSelectedDates(sel => sel);
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

export const filterPluginDate = {
  supportsMatchMode: false,

  getCount(filterDef) {
    return sortedUniqueNumbers(filterDef.possible).length;
  },

  getUnit(_dataPath) {
    return null;
  },

  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownDate, { type, dataPath, openHandler, dropdownId });
  },

  // isActive, getCrumbs, clearCrumb, describeSerializedValue from shared factory
  // (formatThreshold = dayjs-formatted date string)
  ...makeScalarRangeUiMethods("date", numericFilters, v =>
    v == null ? "" : (() => { const d = dayjs(v); return d.isValid() ? d.format(Checklist.getCurrentDateFormat()) : String(v); })()
  ),

  // Lifecycle
  ...makeScalarRangeLifecycle("date", numericFilters),
};
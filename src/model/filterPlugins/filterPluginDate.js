/**
 * filterPluginDate — filter UI for the "date" data type.
 *
 * Mirrors filterPluginNumber in structure (list mode + operator mode) but uses
 * native date inputs and dayjs for threshold parsing and display.
 */

import dayjs from "dayjs";
import m from "mithril";
import { Checklist } from "../Checklist.js";
import { DropdownCheckItemSkeleton } from "./shared/DropdownCheckItem.js";
import { textLowerCaseAccentless } from "../../components/Utils.js";
import { describeList, buildRangeFilterLabel, numericFilters, makeScalarRangeLifecycle, sortedUniqueNumbers } from "./shared/rangeFilterUtils.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DATE_INPUT_FORMAT = "YYYY-MM-DD";
const dateFilterOperations = ["list", "equal", "lesserequal", "greaterequal", "between"];

function getSortedUniqueDateValues(values) {
  return [...new Set((values || []).filter(v => typeof v === "number" && !isNaN(v)))]
    .sort((a, b) => a - b);
}

function getDateValueCounts(values) {
  const counts = {};
  (values || []).forEach(v => {
    if (typeof v !== "number" || isNaN(v)) return;
    counts[v] = (counts[v] || 0) + 1;
  });
  return counts;
}

function formatDateValue(timestamp) {
  const d = dayjs(timestamp);
  return d.isValid() ? d.format(Checklist.getCurrentDateFormat()) : (timestamp?.toString?.() || "");
}

function getDateGroupTitle(timestamp) {
  const d = dayjs(timestamp);
  return d.isValid() ? d.format("YYYY") : "";
}

function normalizeDateOperation(op) {
  if (op === "lesser")  return "lesserequal";
  if (op === "greater") return "greaterequal";
  return dateFilterOperations.includes(op) ? op : "list";
}

function getDateOperationIcon(op) {
  return op === "list" ? "list" : numericFilters[op].icon;
}

function getRangeValueBounds(values) {
  let min = null, max = null;
  (values || []).forEach(v => {
    if (typeof v !== "number" || isNaN(v)) return;
    min = min === null ? v : Math.min(min, v);
    max = max === null ? v : Math.max(max, v);
  });
  return { min, max };
}

// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownDate = function (initialVnode) {
  const dropdownId = initialVnode.attrs.dropdownId;
  let dataPath = "";

  let initialThresholds = [null, null, null];
  let actualThresholds  = [null, null, null];
  let thresholdsShown   = 0;
  let actualOperation   = "list";

  const INITIAL_LIMIT = 100;
  let itemsOverflowLimit = INITIAL_LIMIT;
  let filter = "";
  let previewData = null;
  let previewDataKey = "";

  function isListMode() { return actualOperation === "list"; }

  function getPreviewData() {
    const key = dataPath + "|" + Checklist.filter.queryKey("data." + dataPath);
    if (!previewData || previewDataKey !== key) {
      previewDataKey = key;
      previewData = Checklist.filter.getRangeFilterPreviewData(dataPath);
    }
    return previewData;
  }

  function getOperatorPreviewValues() { return getPreviewData().possible; }

  function getDisplayedOperatorValues() {
    const preview = getOperatorPreviewValues();
    if (isListMode() || !numericFilters[actualOperation]) return preview;
    if (!inputsOk()) return preview;
    const comparer = numericFilters[actualOperation].comparer;
    return preview.filter(v => comparer(v, actualThresholds[1], actualThresholds[2]));
  }

  function inputsOk() {
    for (let i = 1; i <= thresholdsShown; i++) {
      if (typeof actualThresholds[i] !== "number" || isNaN(actualThresholds[i])) return false;
    }
    return true;
  }

  function countResults() {
    if (isListMode() || !inputsOk()) return 0;
    const comparer = numericFilters[actualOperation].comparer;
    return getOperatorPreviewValues()
      .filter(v => comparer(v, actualThresholds[1], actualThresholds[2])).length;
  }

  function canApply() { return !isListMode() && inputsOk() && countResults() > 0; }

  function matchesFilter(ts) {
    return !filter || textLowerCaseAccentless(formatDateValue(ts)).includes(filter);
  }

  function formatDateForInput(ts) {
    if (ts === null || ts === undefined) return null;
    const d = dayjs(ts);
    return d.isValid() ? d.format(DATE_INPUT_FORMAT) : null;
  }

  function dateInput(thresholdNumber, min, max) {
    thresholdsShown++;
    const initialVal = initialThresholds[thresholdNumber];
    const actualVal  = actualThresholds[thresholdNumber];
    const currentValue = initialVal !== null
      ? formatDateForInput(initialVal)
      : formatDateForInput(actualVal);

    let isInputError =
      actualVal !== null && (typeof actualVal !== "number" || isNaN(actualVal));
    if (actualOperation === "between" && thresholdNumber === 2 &&
        actualVal !== null && actualThresholds[1] !== null && actualVal < actualThresholds[1]) {
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
          initialThresholds[thresholdNumber] = null;
          if (this.value.trim() === "") { actualThresholds[thresholdNumber] = null; return; }
          const parsed = dayjs(this.value);
          actualThresholds[thresholdNumber] = parsed.isValid() ? parsed.valueOf() : null;
        },
      }
    );
  }

  function commitSelectedDates(mutator) {
    actualOperation = "list";
    initialThresholds = [null, null, null];
    actualThresholds  = [null, null, null];
    const fd = Checklist.filter.data[dataPath];
    Checklist.filter.delayCommitDataPath = "data." + dataPath;
    fd.numeric  = { operation: "", threshold1: null, threshold2: null };
    fd.selected = getSortedUniqueDateValues(mutator([...(fd.selected || [])]));
    Checklist.filter.commit();
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
      itemsOverflowLimit = INITIAL_LIMIT;
      previewData = null;
      const fd = Checklist.filter.data[dataPath];
      initialThresholds = [null, fd.numeric.threshold1, fd.numeric.threshold2];
      actualThresholds  = [null, fd.numeric.threshold1, fd.numeric.threshold2];
      actualOperation   = normalizeDateOperation(fd.numeric.operation);
    },

    view(vnode) {
      dataPath = vnode.attrs.dataPath;
      thresholdsShown = 0;

      const fd           = Checklist.filter.data[dataPath];
      const dateFormat   = Checklist.getCurrentDateFormat();
      const preview      = getPreviewData();
      const inputMin     = formatDateForInput(preview.min    ?? fd.globalMin);
      const inputMax     = formatDateForInput(preview.max    ?? fd.globalMax);
      const statsValues  = isListMode() ? fd.possible : getDisplayedOperatorValues();
      const statsBounds  = getRangeValueBounds(statsValues);
      const possibleCounts = getDateValueCounts(fd.possible);
      const selectedDates  = fd.selected || [];
      const allDates       = getSortedUniqueDateValues(fd.all);
      const possibleDates  = getSortedUniqueDateValues(fd.possible);

      let totalItems = 0, totalPossibleUnchecked = 0;
      let filteredPossible = [];
      let showSelected = false, showPossible = false, showImpossible = false;

      const selected  = createDateItems(selectedDates, "checked", possibleCounts,
        () => true, () => { showSelected = true; });
      const possible  = createDateItems(possibleDates, "unchecked", possibleCounts,
        item => !selectedDates.includes(item) && totalItems <= itemsOverflowLimit,
        item => { showPossible = true; totalItems++; totalPossibleUnchecked++; filteredPossible.push(item); });
      const impossible = createDateItems(
        allDates.filter(item => !Object.prototype.hasOwnProperty.call(possibleCounts, item) && !selectedDates.includes(item)),
        "inactive", possibleCounts,
        () => totalItems <= itemsOverflowLimit,
        () => { showImpossible = true; totalItems++; });
      const itemsOverflowing = totalItems > itemsOverflowLimit;

      // Operator input UI
      let inputUi = null;
      switch (actualOperation) {
        case "equal":        inputUi = [m(".label1", t("numeric_filter_equal")),        dateInput(1, inputMin, inputMax)]; break;
        case "lesserequal":  inputUi = [m(".label1", t("numeric_filter_lesserequal")),  dateInput(1, inputMin, inputMax)]; break;
        case "greaterequal": inputUi = [m(".label1", t("numeric_filter_greaterequal")), dateInput(1, inputMin, inputMax)]; break;
        case "between":      inputUi = [m(".label1", t("numeric_filter_between")),      dateInput(1, inputMin, inputMax), m(".label2", t("numeric_filter_and")), dateInput(2, inputMin, inputMax)]; break;
        default: break;
      }

      return m(".inner-dropdown-area.numeric", [
        // Operation buttons
        m(".numeric-filter-buttons", dateFilterOperations.map(key => [
          m(".numeric-filter-button.clickable" + (actualOperation === key ? ".selected" : ""), {
            onclick() {
              actualOperation = key;
              if (!isListMode()) {
                window.setTimeout(() => {
                  const el = document.getElementById("threshold1_" + dropdownId);
                  if (el) el.focus();
                }, 200);
              }
            },
          }, m("img[src=img/ui/search/numeric_" + getDateOperationIcon(key) + ".svg]")),
          key === "list" ? m(".separator") : null,
        ])),

        // Operator input row
        !isListMode()
          ? m(".input-ui", [
              inputUi,
              m(".clear-button.clickable", {
                onclick() {
                  actualOperation = "list";
                  fd.numeric      = { operation: "", threshold1: null, threshold2: null };
                  fd.selected     = [];
                  initialThresholds = [null, null, null];
                  actualThresholds  = [null, null, null];
                  Checklist.filter.commit();
                },
              }, m("img[src=img/ui/search/clear_filter_dark.svg]")),
            ])
          : null,

        // Operator apply
        !isListMode()
          ? m(".apply.clickable" + (canApply() ? "" : ".inactive"), {
              onclick() {
                if (!canApply()) return;
                const comparer = numericFilters[actualOperation].comparer;
                fd.selected = getSortedUniqueDateValues(
                  getOperatorPreviewValues().filter(v =>
                    comparer(v, actualThresholds[1], actualThresholds[2])
                  )
                );
                fd.numeric = { operation: actualOperation, threshold1: actualThresholds[1], threshold2: actualThresholds[2] };
                vnode.attrs.openHandler(false);
                Checklist.filter.commit();
              },
            }, countResults() === 0
              ? t("numeric_apply_show_results_no_results")
              : t("numeric_apply_show_results", [countResults()]))
          : null,

        // List mode: search
        isListMode()
          ? m(".search-filter",
              m("input.options-search[type=search][placeholder=" + t("search") + "][id=" + vnode.attrs.dropdownId + "_text]", {
                oninput() {
                  filter = this.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                },
              })
            )
          : null,

        // List mode: items
        isListMode()
          ? m(".options", [
              showSelected   ? m(".options-section", selected)   : null,
              showPossible   ? m(".options-section", possible)   : null,
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

        // List mode: check all shown
        isListMode() && filter.length > 0 && totalPossibleUnchecked > 1
          ? m(".apply", {
              onclick() {
                commitSelectedDates(sel => [...sel, ...filteredPossible]);
                vnode.attrs.openHandler(false);
              },
            }, t("check_all_shown"))
          : null,

        // Stats
        m("ul.stats", [
          statsBounds.min !== null ? m("li", t("stats_min") + ": " + dayjs(statsBounds.min).format(dateFormat)) : null,
          statsBounds.max !== null ? m("li", t("stats_max") + ": " + dayjs(statsBounds.max).format(dateFormat)) : null,
        ]),

        // List mode: apply/close
        isListMode()
          ? m(".apply", {
              onclick() {
                if (fd.numeric.operation !== "") {
                  commitSelectedDates(sel => sel);
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

export const filterPluginDate = {
  isActive(filterDef) {
    return filterDef.selected.length > 0 || filterDef.numeric.operation !== "";
  },

  getCount(filterDef) {
    return getSortedUniqueDateValues(filterDef.possible).length;
  },

  getUnit(_dataPath) {
    return null;
  },

  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownDate, { type, dataPath, openHandler, dropdownId });
  },

  getCrumbs(fd, ctx) {
    const { operation, threshold1, threshold2 } = fd.numeric;
    if (operation) {
      return [{
        title: buildRangeFilterLabel(
          ctx.dataPath, operation, threshold1, threshold2,
          v => (v == null ? "" : formatDateValue(v)), true, numericFilters[operation]
        )
      }];
    }
    return fd.selected.map(v => ({ title: formatDateValue(v), rawValue: v }));
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
    const open    = opts.html ? "<strong>" : "";
    const close   = opts.html ? "</strong>" : "";
    const fmtDate = v => {
      if (v == null) return "";
      const d = dayjs(v);
      return d.isValid() ? d.format(Checklist.getCurrentDateFormat()) : String(v);
    };
    if (Array.isArray(serialized)) {
      const cat = opts.categoryName ?? Checklist.getMetaForDataPath(dataPath)?.searchCategory ?? "";
      return cat + " " + t("is_list_joiner") + " " + describeList(serialized.map(fmtDate), opts);
    }
    return buildRangeFilterLabel(
      dataPath, serialized.o, serialized.a, serialized.b,
      v => open + fmtDate(v) + close,
      false, numericFilters[serialized.o]
    );
  },

  // ── Lifecycle (shared with number via factory) ────────────────────
  ...makeScalarRangeLifecycle("date", numericFilters),
};
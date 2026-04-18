/**
 * listModeUtils.js – helpers shared by every plugin that has a "list mode"
 * (filterPluginNumber, filterPluginDate) plus the search-box pattern used in
 * filterPluginText.
 *
 * All exported functions are pure or receive explicit dependencies; none
 * reference module-level mutable state.
 */

import m from "mithril";
import { Checklist } from "../../Checklist.js";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

registerMessages(selfKey, {
  en: {
    search: "Search",
    next_items_dropdown: "Show next {0} items",
    no_items_filter: "No matching items found",
    apply_selection: "Apply",
    check_all_shown: "Check all shown items",
  },
  fr: {
    search: "Rechercher",
    next_items_dropdown: "Afficher les {0} éléments suivants",
    no_items_filter: "Aucun élément correspondant trouvé",
    apply_selection: "Appliquer",
    check_all_shown: "Cocher tous les éléments affichés",
  }
});

// ── Value-set helpers ─────────────────────────────────────────────────────────

/**
 * Counts occurrences of each numeric value in an array.
 * Non-numeric / NaN entries are silently skipped.
 *
 * @param {unknown[]} values
 * @returns {Record<number, number>}
 */
export function countValues(values) {
  const counts = {};
  (values || []).forEach(v => {
    if (typeof v !== "number" || isNaN(v)) return;
    counts[v] = (counts[v] || 0) + 1;
  });
  return counts;
}

// ── Operation normalisation ───────────────────────────────────────────────────

/**
 * Returns a factory that validates an operation string against an allowlist,
 * falling back to `defaultOp`.
 *
 * @param {string[]} allowedOps
 * @param {string}   defaultOp  – value returned when `op` is not in allowedOps
 * @param {Record<string, string>} [aliases={}] – optional op→op remapping applied first
 * @returns {(op: string) => string}
 */
export function makeOperationNormalizer(allowedOps, defaultOp, aliases = {}) {
  return function normalizeOperation(op) {
    const resolved = aliases[op] ?? op;
    return allowedOps.includes(resolved) ? resolved : defaultOp;
  };
}

// ── Operation icon ────────────────────────────────────────────────────────────

/**
 * Returns the icon key for a given operation.
 * "list" always maps to "list"; all other ops are looked up in `filterTable`.
 *
 * @param {string} op
 * @param {Record<string, { icon: string }>} filterTable
 * @returns {string}
 */
export function getOperationIcon(op, filterTable) {
  return op === "list" ? "list" : (filterTable[op]?.icon ?? op);
}

// ── isListMode predicate ──────────────────────────────────────────────────────

/**
 * Returns true when the active operation is the special "list" mode.
 *
 * @param {string} actualOperation
 * @returns {boolean}
 */
export function isListMode(actualOperation) {
  return actualOperation === "list";
}

// ── Preview-data lazy cache ───────────────────────────────────────────────────

/**
 * Creates a stateful lazy-cache object for `getRangeFilterPreviewData`.
 * Call `cache.get(dataPath)` to obtain (and cache) the preview data.
 *
 * @returns {{ get: (dataPath: string) => object, invalidate: () => void }}
 */
export function makePreviewDataCache() {
  let cachedData = null;
  let cachedKey = "";

  return {
    get(dataPath) {
      const key = dataPath + "|" + Checklist.filter.queryKey("data." + dataPath);
      if (!cachedData || cachedKey !== key) {
        cachedKey = key;
        cachedData = Checklist.filter.getRangeFilterPreviewData(dataPath);
      }
      return cachedData;
    },
    invalidate() {
      cachedData = null;
      cachedKey = "";
    },
  };
}

// ── commitSelected helper ─────────────────────────────────────────────────────

/**
 * Resets operator state, applies `mutator` to the current selection, and commits.
 * Shared by the list-mode check handlers in DropdownNumber and DropdownDate.
 *
 * @param {object}   fd          – live filterDef
 * @param {string}   dataPath    – column data path
 * @param {Function} sortUnique  – plugin-specific sort+dedupe fn (e.g. sortedUniqueNumbers)
 * @param {Function} mutator     – (currentSelected: unknown[]) => unknown[]
 * @param {object}   stateRefs   – { setOperation, setInitialThresholds, setActualThresholds }
 *   Each setter is a callback that updates the local dropdown closure variable.
 */
export function commitListSelection(fd, dataPath, sortUnique, mutator, stateRefs) {
  stateRefs.setOperation("list");
  stateRefs.setInitialThresholds([null, null, null]);
  stateRefs.setActualThresholds([null, null, null]);
  Checklist.filter.delayCommitDataPath = "data." + dataPath;
  fd.numeric = { operation: "", threshold1: null, threshold2: null };
  fd.selected = sortUnique(mutator([...(fd.selected || [])]));
  Checklist.filter.commit();
}

// ── Search-filter input ───────────────────────────────────────────────────────

/**
 * Renders the search-box used in list mode (Number, Date, Text).
 *
 * @param {string}   dropdownId
 * @param {Function} onFilterChange – (normalizedValue: string) => void
 * @returns {Vnode}
 */
export function renderSearchInput(dropdownId, onFilterChange) {
  return m(
    ".search-filter",
    m(
      "input.options-search[type=search][placeholder=" + t("search") + "][id=" + dropdownId + "_text]",
      {
        oninput() {
          onFilterChange(
            this.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          );
        },
      }
    )
  );
}

// ── Paginated options list ────────────────────────────────────────────────────

/**
 * Renders the four-zone options area: selected / possible / impossible / overflow.
 * Used by list-mode dropdowns (Number, Date).  Text already delegates to buildCheckItems
 * which handles this internally.
 *
 * @param {{ showSelected, selected, showPossible, possible,
 *           showImpossible, impossible, itemsOverflowing }} sections
 * @param {Function} onShowMore – () => void  (called when "show next N" is clicked)
 * @param {number}   pageSize
 * @param {string}   [extraClass] – optional extra CSS class(es) appended to ".options"
 * @returns {Vnode}
 */
export function renderOptionsSections(sections, onShowMore, pageSize, extraClass) {
  const {
    showSelected, selected,
    showPossible, possible,
    showImpossible, impossible,
    itemsOverflowing,
  } = sections;

  return m(".options" + (extraClass || ""), [
    showSelected ? m(".options-section", selected) : null,
    showPossible ? m(".options-section", possible) : null,
    showImpossible ? m(".options-section", impossible) : null,
    itemsOverflowing
      ? m(".show-next-items", { onclick: onShowMore }, t("next_items_dropdown", [pageSize]))
      : null,
    !showSelected && !showPossible && !showImpossible
      ? m(".no-items-filter", t("no_items_filter"))
      : null,
  ]);
}

// ── Apply / close button ──────────────────────────────────────────────────────

/**
 * Renders the "Apply selection" / close button used at the bottom of every dropdown.
 *
 * @param {Function} openHandler    – (open: boolean) => void
 * @param {Function} [onBeforeClose] – optional callback invoked before closing
 * @returns {Vnode}
 */
export function renderApplyButton(openHandler, onBeforeClose) {
  return m(".apply", {
    onclick() {
      if (onBeforeClose) onBeforeClose();
      openHandler(false);
    },
  }, t("apply_selection"));
}

// ── Check-all-shown button ────────────────────────────────────────────────────

/**
 * Conditionally renders the "Check all shown" button.
 * Returns null when the filter is empty or too few items are unchecked.
 *
 * @param {string}   filter                  – current normalised search string
 * @param {number}   totalPossibleUnchecked   – unchecked items matching filter
 * @param {Function} onApply                  – called on click
 * @returns {Vnode|null}
 */
export function renderCheckAllShown(filter, totalPossibleUnchecked, onApply) {
  if (!(filter.length > 0 && totalPossibleUnchecked > 1)) return null;
  return m(".apply", { onclick: onApply }, t("check_all_shown"));
}
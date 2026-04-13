/**
 * filterPluginText — handles filter UI for "text", "category", and "taxa" filter types.
 *
 * All three share the same checklist UI: a searchable list of checked / unchecked /
 * inactive items.  Supports three Match Modes (Any / All / Exclude) via MatchModeToggle.
 * "Match All" is only offered for multi-value data paths (list/#-paths, months, mapregions).
 */

import m from "mithril";
import { Checklist } from "../Checklist.js";
import { DropdownCheckItemSkeleton, buildCheckItems } from "./shared/DropdownCheckItem.js";
import { describeList } from "./shared/filterUtils.js";
import { MatchModeToggle, MATCH_MODES } from "./shared/MatchModeToggle.js";

// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownText = function () {
  let filter = "";
  const INITIAL_LIMIT = 100;
  let itemsOverflowLimit = INITIAL_LIMIT;

  return {
    oninit() {
      filter            = "";
      itemsOverflowLimit = INITIAL_LIMIT;
    },

    view(vnode) {
      const { type, dataPath, openHandler, dropdownId } = vnode.attrs;
      const fd             = Checklist.filter[type][dataPath];
      const supportsMatchAll = Checklist.isMultiValueDataPath(dataPath);

      const {
        selected, showSelected,
        possible, showPossible,
        impossible, showImpossible,
        itemsOverflowing, filteredPossible, totalPossibleUnchecked,
      } = buildCheckItems({ type, dataPath, filter, itemsOverflowLimit });

      return m(".inner-dropdown-area", [
        // ── Match Mode toggle (Phase 3) ──────────────────────────────────────
        m(MatchModeToggle, {
          filterDef:       fd,
          supportsMatchAll,
          onCommit()       { Checklist.filter.commit(); },
        }),

        m(".search-filter",
          m("input.options-search[type=search][placeholder=" + t("search") + "][id=" + dropdownId + "_text]", {
            oninput() {
              filter = this.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            },
          })
        ),

        m(".options", [
          showSelected   ? m(".options-section", selected)   : null,
          showPossible   ? m(".options-section", possible)   : null,
          showImpossible ? m(".options-section", impossible) : null,
          itemsOverflowing
            ? m(".show-next-items", {
                onclick() { itemsOverflowLimit += INITIAL_LIMIT; },
              }, t("next_items_dropdown", [INITIAL_LIMIT]))
            : null,
          !showSelected && !showPossible && !showImpossible
            ? m(".no-items-filter", t("no_items_filter"))
            : null,
        ]),

        filter.length > 0 && totalPossibleUnchecked > 1
          ? m(".apply", {
              onclick() {
                fd.selected = fd.selected.concat(filteredPossible);
                Checklist.filter.commit();
                openHandler(false);
              },
            }, t("check_all_shown"))
          : null,

        m(".apply", { onclick() { openHandler(false); } }, t("apply_selection")),
      ]);
    },
  };
};

// ── Plugin object ─────────────────────────────────────────────────────────────

export const filterPluginText = {
  // Phase 1: opt-in flag
  supportsMatchMode: true,

  isActive(filterDef) {
    return filterDef.selected.length > 0;
  },

  getCount(filterDef) {
    return Object.keys(filterDef.possible).length;
  },

  getUnit(_dataPath) {
    return null;
  },

  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownText, { type, dataPath, openHandler, dropdownId });
  },

  /**
   * One crumb per selected item still in the possible set.
   * matchMode is forwarded so crumb consumers can optionally style exclusions.
   */
  getCrumbs(filterDef, _ctx) {
    const mode = filterDef.matchMode || MATCH_MODES.ANY;
    return filterDef.selected
      // In exclude mode selected items are deliberately absent from fd.possible
      // (they were filtered out), so skip the possible-set check.
      .filter(item => mode === MATCH_MODES.EXCLUDE || Object.prototype.hasOwnProperty.call(filterDef.possible, item))
      .map(item => ({ title: item, matchMode: mode }));
  },

  clearCrumb(filterDef, _ctx, descriptor) {
    const idx = filterDef.selected.indexOf(descriptor.title);
    if (idx > -1) filterDef.selected.splice(idx, 1);
    Checklist.filter.commit();
  },

  describeSerializedValue(dataPath, serialized, opts = {}) {
    const cat   = opts.categoryName ?? Checklist.getMetaForDataPath(dataPath)?.searchCategory ?? "";
    const raw   = Array.isArray(serialized) ? serialized
                : Array.isArray(serialized?.items) ? serialized.items
                : [String(serialized)];
    const mode  = serialized?.mm || MATCH_MODES.ANY;
    const vals  = raw.map(String);

    const verbKey = mode === MATCH_MODES.ALL     ? "is_all_list_joiner"
                  : mode === MATCH_MODES.EXCLUDE ? "is_not_list_joiner"
                  : "is_list_joiner";

    return cat + " " + t(verbKey) + " " + describeList(vals, opts);
  },

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  createFilterDef(type = "text") {
    return {
      type,
      all:       [],
      possible:  {},
      selected:  [],
      numeric:   null,
      matchMode: MATCH_MODES.ANY,          // Phase 2
    };
  },

  clearFilter(fd) {
    fd.selected  = [];
    fd.matchMode = MATCH_MODES.ANY;        // reset on full clear
  },

  clearPossible(fd) { fd.possible = {}; },

  accumulatePossible(fd, _rawValue, leafValues) {
    leafValues.forEach(v => {
      if (typeof v === "string" && v.trim() === "") return;
      if (!Object.prototype.hasOwnProperty.call(fd.possible, v)) fd.possible[v] = 0;
      fd.possible[v]++;
    });
  },

  /**
   * Serialization — matchMode is appended as "mm" only when it deviates from
   * the default ("any"), keeping standard URLs clean and backward-compatible.
   */
  serializeToQuery(fd) {
    if (fd.selected.length === 0) return null;
    const mode = fd.matchMode || MATCH_MODES.ANY;
    if (mode === MATCH_MODES.ANY) return [...fd.selected];
    return { items: [...fd.selected], mm: mode };
  },

  deserializeFromQuery(fd, val) {
    if (Array.isArray(val)) {
      fd.selected  = val;
      fd.matchMode = MATCH_MODES.ANY;
    } else if (val && typeof val === "object" && Array.isArray(val.items)) {
      fd.selected  = val.items;
      fd.matchMode = val.mm || MATCH_MODES.ANY;
    } else {
      fd.selected  = [val];
      fd.matchMode = MATCH_MODES.ANY;
    }
  },

  /**
   * Phase 4 — core matching.
   *
   * ANY (default): pass if leafValues contains ≥1 selected item.
   * ALL:           pass only if leafValues contains every selected item.
   * EXCLUDE:       pass only if leafValues contains none of the selected items.
   *                (null rawValue fast-fail is handled upstream in Filter._checkDataFilters)
   */
  matches(fd, _rawValue, leafValues) {
    if (fd.selected.length === 0) return true;
    const mode = fd.matchMode || MATCH_MODES.ANY;

    if (mode === MATCH_MODES.EXCLUDE) {
      return leafValues.every(v => !fd.selected.includes(v));
    }
    if (mode === MATCH_MODES.ALL) {
      return fd.selected.every(v => leafValues.includes(v));
    }
    // ANY
    return leafValues.some(v => fd.selected.includes(v));
  },
};
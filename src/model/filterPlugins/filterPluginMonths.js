/**
 * filterPluginMonths - filter UI for the "months" data type.
 *
 * Months data is inherently multi-value (a taxon can be active in several months),
 * so all three Match Modes - Any, All, Exclude - are offered via MatchModeToggle.
 */

import m from "mithril";
import { Checklist } from "../Checklist.js";
import { groupMonthsIntoRanges, renderRangesString } from "../customTypes/CustomTypeMonths.js";
import { DropdownCheckItemSkeleton } from "./shared/DropdownCheckItem.js";
import { describeList } from "./shared/filterUtils.js";
import { MatchModeToggle, MATCH_MODES } from "./shared/MatchModeToggle.js";

// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownMonths = function () {
  return {
    view(vnode) {
      const { type, dataPath, openHandler } = vnode.attrs;
      const filterDef = Checklist.filter[type][dataPath];

      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(monthNum => {
        const isSelected = filterDef.selected.some(s => Number(s) === monthNum);
        const count      = filterDef.possible[monthNum] || 0;
        const isPossible = count > 0;
        const state      = isSelected ? "checked" : isPossible ? "unchecked" : "inactive";

        return m(DropdownCheckItemSkeleton, {
          key:   monthNum,
          item:  Checklist.getMonthLabel(monthNum),
          state,
          count: count || "",
          action: state === "inactive" ? undefined : function () {
            if (isSelected) {
              const idx = filterDef.selected.findIndex(s => Number(s) === monthNum);
              if (idx > -1) filterDef.selected.splice(idx, 1);
              Checklist.filter.commit();
            } else {
              Checklist.filter.delayCommitDataPath = type + "." + dataPath;
              filterDef.selected.push(monthNum);
              Checklist.filter.commit();
            }
          },
        });
      });

      return m(".inner-dropdown-area", [
        // Months is always multi-value → supportsMatchAll: true
        m(MatchModeToggle, {
          filterDef,
          supportsMatchAll: true,
          onCommit()        { Checklist.filter.commit(); },
        }),

        m(".options", m(".options-section", items)),
        m(".apply", { onclick: () => openHandler(false) }, t("apply_selection")),
      ]);
    },
  };
};

// ── Plugin object ─────────────────────────────────────────────────────────────

export const filterPluginMonths = {
  // Phase 1: opt-in
  supportsMatchMode: true,

  isActive(filterDef) {
    return filterDef.selected.length > 0;
  },

  getCount(filterDef) {
    return Object.keys(filterDef.possible).filter(k => filterDef.possible[k] > 0).length;
  },

  getUnit(_dataPath) {
    return null;
  },

  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownMonths, { type, dataPath, openHandler, dropdownId });
  },

  getCrumbs(filterDef, _ctx) {
    if (filterDef.selected.length === 0) return [];
    return [{
      title:     renderRangesString(groupMonthsIntoRanges(filterDef.selected)),
      matchMode: filterDef.matchMode || MATCH_MODES.ANY,
    }];
  },

  clearCrumb(filterDef, _ctx, _descriptor) {
    filterDef.selected = [];
    Checklist.filter.commit();
  },

  describeSerializedValue(dataPath, serialized, opts = {}) {
    const cat  = opts.categoryName ?? Checklist.getMetaForDataPath(dataPath)?.searchCategory ?? "";
    const raw  = Array.isArray(serialized) ? serialized
               : Array.isArray(serialized?.items) ? serialized.items
               : [serialized];
    const mode = serialized?.mm || MATCH_MODES.ANY;
    const vals = raw.map(v => Checklist.getMonthLabel(parseInt(v, 10)));

    const verbKey = mode === MATCH_MODES.ALL     ? "is_all_list_joiner"
                  : mode === MATCH_MODES.EXCLUDE ? "is_not_list_joiner"
                  : "is_list_joiner";

    return cat + " " + t(verbKey) + " " + describeList(vals, opts);
  },

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  createFilterDef() {
    return {
      type:      "months",
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
      if (!Object.prototype.hasOwnProperty.call(fd.possible, v)) fd.possible[v] = 0;
      fd.possible[v]++;
    });
  },

  serializeToQuery(fd) {
    if (fd.selected.length === 0) return null;
    const mode = fd.matchMode || MATCH_MODES.ANY;
    if (mode === MATCH_MODES.ANY) return [...fd.selected];
    return { items: [...fd.selected], mm: mode };
  },

  deserializeFromQuery(fd, val) {
    const arr    = Array.isArray(val) ? val
                 : Array.isArray(val?.items) ? val.items
                 : [val];
    fd.selected  = arr.map(v => parseInt(v, 10));
    fd.matchMode = val?.mm || MATCH_MODES.ANY;
  },

  /**
   * Phase 4 - core matching.
   * ANY: active in ≥1 selected month.
   * ALL: active in every selected month.
   * EXCLUDE: active in none of the selected months.
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
    return leafValues.some(v => fd.selected.includes(v));
  },
};
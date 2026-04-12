/**
 * filterPluginMonths — filter UI for the "months" data type.
 *
 * Renders all 12 months in calendar order as a selectable checklist.
 * Active months show a count; inactive months (no data in current result set) are greyed out.
 */

import m from "mithril";
import { Checklist } from "../Checklist.js";
import { groupMonthsIntoRanges, renderRangesString } from "../customTypes/CustomTypeMonths.js";
import { DropdownCheckItemSkeleton } from "./shared/DropdownCheckItem.js";
import { describeList } from "./shared/rangeFilterUtils.js";

// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownMonths = function (initialVnode) {
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
        m(".options", m(".options-section", items)),
        m(".apply", { onclick: () => openHandler(false) }, t("apply_selection")),
      ]);
    },
  };
};

// ── Plugin object ─────────────────────────────────────────────────────────────

export const filterPluginMonths = {
  meta: {
    filterType: "categorical",
    filterLabel: "Categorical multi-select (month names)",
    filterDescription: "Shows month names as checkboxes. A taxon matches if it is active in **any** of the selected months.",
  },
  isActive(filterDef) {
    return filterDef.selected.length > 0;
  },

  getCount(filterDef) {
    // Count months that have data in the current result set
    return Object.keys(filterDef.possible).filter(k => filterDef.possible[k] > 0).length;
  },

  getUnit(_dataPath) {
    return null;
  },

  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownMonths, { type, dataPath, openHandler, dropdownId });
  },

  /**
   * A single crumb showing the grouped month-range summary
   * (e.g. "Mar–May and Oct").  Clearing it wipes the whole months selection.
   */
  getCrumbs(filterDef, _ctx) {
    if (filterDef.selected.length === 0) return [];
    return [{
      title: renderRangesString(groupMonthsIntoRanges(filterDef.selected)),
    }];
  },

  clearCrumb(filterDef, _ctx, _descriptor) {
    filterDef.selected = [];
    Checklist.filter.commit();
  },

    describeSerializedValue(dataPath, serialized, opts = {}) {
    const cat  = opts.categoryName ?? Checklist.getMetaForDataPath(dataPath)?.searchCategory ?? "";
    const vals = (Array.isArray(serialized) ? serialized : [serialized])
      .map(v => Checklist.getMonthLabel(parseInt(v, 10)));
    return cat + " " + t("is_list_joiner") + " " + describeList(vals, opts);
  },

  // ── Lifecycle ─────────────────────────────────────────────────────
  createFilterDef() {
    return { type: "months", all: [], possible: {}, selected: [], numeric: null };
  },
  clearFilter(fd)   { fd.selected = []; },
  clearPossible(fd) { fd.possible = {}; },
  accumulatePossible(fd, _rawValue, leafValues) {
    leafValues.forEach(v => {
      if (!Object.prototype.hasOwnProperty.call(fd.possible, v)) fd.possible[v] = 0;
      fd.possible[v]++;
    });
  },
  serializeToQuery(fd) {
    return fd.selected.length > 0 ? [...fd.selected] : null;
  },
  deserializeFromQuery(fd, val) {
    const arr = Array.isArray(val) ? val : [val];
    fd.selected = arr.map(v => parseInt(v, 10));
  },
  matches(fd, _rawValue, leafValues) {
    return fd.selected.length === 0 || leafValues.some(v => fd.selected.includes(v));
  },
};
/**
 * filterPluginMonths - filter UI for the "months" data type.
 *
 * Months data is inherently multi-value, so all three Match Modes are offered.
 */

import m from "mithril";
import { t, selfKey } from "virtual:i18n-self";
import { Checklist } from "../Checklist.js";
import { groupMonthsIntoRanges, renderRangesString } from "../customTypes/CustomTypeMonths.js";
import { DropdownCheckItemSkeleton } from "./shared/DropdownCheckItem.js";
import { describeList } from "./shared/filterUtils.js";
import { renderApplyButton } from "./shared/listModeUtils.js";
import { MatchModeToggle, MATCH_MODES } from "./shared/MatchModeToggle.js";
import {
  matchModeVerbKey,
  makeListPluginLifecycle,
} from "./shared/matchModePlugin.js";




// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownMonths = function () {
  return {
    view(vnode) {
      const { type, dataPath, openHandler } = vnode.attrs;
      const filterDef = Checklist.filter[type][dataPath];

      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(monthNum => {
        const isSelected = filterDef.selected.some(s => Number(s) === monthNum);
        const count = filterDef.possible[monthNum] || 0;
        const isPossible = count > 0;
        const state = isSelected ? "checked" : isPossible ? "unchecked" : "inactive";

        return m(DropdownCheckItemSkeleton, {
          key: monthNum,
          item: Checklist.getMonthLabel(monthNum),
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
        m(MatchModeToggle, {
          filterDef,
          supportsMatchAll: true,
          onCommit() { Checklist.filter.commit(); },
        }),

        m(".options", m(".options-section", items)),
        renderApplyButton(openHandler),
      ]);
    },
  };
};

// ── Plugin object ─────────────────────────────────────────────────────────────

export const filterPluginMonths = {
  supportsMatchMode: true,

  isActive(filterDef) {
    return filterDef.selected.length > 0;
  },

  getCount(filterDef) {
    return Object.keys(filterDef.possible).filter(k => filterDef.possible[k] > 0).length;
  },

  getUnit(_dataPath) { return null; },

  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownMonths, { type, dataPath, openHandler, dropdownId });
  },

  getCrumbs(filterDef, _ctx) {
    if (filterDef.selected.length === 0) return [];
    return [{
      title: renderRangesString(groupMonthsIntoRanges(filterDef.selected)),
      matchMode: filterDef.matchMode || MATCH_MODES.ANY,
    }];
  },

  clearCrumb(filterDef, _ctx, _descriptor) {
    filterDef.selected = [];
    Checklist.filter.commit();
  },

  describeSerializedValue(dataPath, serialized, opts = {}) {
    const cat = opts.categoryName ?? Checklist.getMetaForDataPath(dataPath)?.searchCategory ?? "";
    const raw = Array.isArray(serialized) ? serialized
      : Array.isArray(serialized?.items) ? serialized.items
        : [serialized];
    const mode = serialized?.mm || MATCH_MODES.ANY;
    const vals = raw.map(v => Checklist.getMonthLabel(parseInt(v, 10)));
    return cat + " " + t(matchModeVerbKey(mode)) + " " + describeList(vals, opts);
  },

  ...makeListPluginLifecycle("months", {
    deserializeValue: v => parseInt(v, 10),
  }),
};
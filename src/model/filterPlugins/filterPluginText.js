/**
 * filterPluginText - handles filter UI for "text", "category", and "taxa" filter types.
 */

import m from "mithril";
import { t } from "virtual:i18n-self";
import { Checklist } from "../Checklist.js";
import { buildCheckItems } from "./shared/DropdownCheckItem.js";
import { describeList } from "./shared/filterUtils.js";
import {
  renderSearchInput, renderOptionsSections,
  renderApplyButton, renderCheckAllShown,
} from "./shared/listModeUtils.js";
import { MatchModeToggle, MATCH_MODES } from "./shared/MatchModeToggle.js";
import {
  matchModeVerbKey,
  makeListPluginLifecycle,
} from "./shared/matchModePlugin.js";



// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownText = function () {
  let filter = "";
  const INITIAL_LIMIT = 100;
  let itemsOverflowLimit = INITIAL_LIMIT;

  return {
    oninit() {
      filter = "";
      itemsOverflowLimit = INITIAL_LIMIT;
    },

    view(vnode) {
      const { type, dataPath, openHandler, dropdownId } = vnode.attrs;
      const fd = Checklist.filter[type][dataPath];
      const supportsMatchAll = Checklist.isMultiValueDataPath(dataPath);

      const {
        selected, showSelected,
        possible, showPossible,
        impossible, showImpossible,
        itemsOverflowing, filteredPossible, totalPossibleUnchecked,
      } = buildCheckItems({ type, dataPath, filter, itemsOverflowLimit });

      return m(".inner-dropdown-area", [
        m(MatchModeToggle, {
          filterDef: fd,
          supportsMatchAll,
          onCommit() { Checklist.filter.commit(); },
        }),

        renderSearchInput(dropdownId, val => { filter = val; }),

        renderOptionsSections(
          { showSelected, selected, showPossible, possible, showImpossible, impossible, itemsOverflowing },
          () => { itemsOverflowLimit += INITIAL_LIMIT; },
          INITIAL_LIMIT
        ),

        renderCheckAllShown(filter, totalPossibleUnchecked, () => {
          fd.selected = fd.selected.concat(filteredPossible);
          Checklist.filter.commit();
          openHandler(false);
        }),

        renderApplyButton(openHandler),
      ]);
    },
  };
};

// ── Plugin object ─────────────────────────────────────────────────────────────

export const filterPluginText = {
  supportsMatchMode: true,

  isActive(filterDef) {
    return filterDef.selected.length > 0;
  },

  getCount(filterDef) {
    return Object.keys(filterDef.possible).length;
  },

  getUnit(_dataPath) { return null; },

  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownText, { type, dataPath, openHandler, dropdownId });
  },

  getCrumbs(filterDef, _ctx) {
    const mode = filterDef.matchMode || MATCH_MODES.ANY;
    return filterDef.selected
      .filter(item => mode === MATCH_MODES.EXCLUDE || Object.prototype.hasOwnProperty.call(filterDef.possible, item))
      .map(item => ({ title: item, matchMode: mode }));
  },

  clearCrumb(filterDef, _ctx, descriptor) {
    const idx = filterDef.selected.indexOf(descriptor.title);
    if (idx > -1) filterDef.selected.splice(idx, 1);
    Checklist.filter.commit();
  },

  describeSerializedValue(dataPath, serialized, opts = {}) {
    const cat = opts.categoryName ?? Checklist.getMetaForDataPath(dataPath)?.searchCategory ?? "";
    const raw = Array.isArray(serialized) ? serialized
      : Array.isArray(serialized?.items) ? serialized.items
        : [String(serialized)];
    const mode = serialized?.mm || MATCH_MODES.ANY;
    return cat + " " + t(matchModeVerbKey(mode)) + " " + describeList(raw.map(String), opts);
  },

  ...makeListPluginLifecycle("text", {
    skipValue: v => typeof v === "string" && v.trim() === "",
  }),
};
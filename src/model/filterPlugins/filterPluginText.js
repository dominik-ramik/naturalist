/**
 * filterPluginText - handles filter UI for "text", "category", and "taxa" filter types.
 */

import m from "mithril";
import { t } from "virtual:i18n-self";
import { Checklist } from "../Checklist.js";
import { DropdownCheckItemSkeleton, buildCheckItems } from "./shared/DropdownCheckItem.js";
import { describeList } from "./shared/filterUtils.js";
import { MatchModeToggle, MATCH_MODES } from "./shared/MatchModeToggle.js";
import {
  matchModeVerbKey,
  serializeListWithMode,
  deserializeListWithMode,
  matchesListWithMode,
} from "./shared/matchModePlugin.js";

// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownText = function () {
  let filter = "";
  const INITIAL_LIMIT = 100;
  let itemsOverflowLimit = INITIAL_LIMIT;

  return {
    oninit() {
      filter             = "";
      itemsOverflowLimit = INITIAL_LIMIT;
    },

    view(vnode) {
      const { type, dataPath, openHandler, dropdownId } = vnode.attrs;
      const fd               = Checklist.filter[type][dataPath];
      const supportsMatchAll = Checklist.isMultiValueDataPath(dataPath);

      const {
        selected, showSelected,
        possible, showPossible,
        impossible, showImpossible,
        itemsOverflowing, filteredPossible, totalPossibleUnchecked,
      } = buildCheckItems({ type, dataPath, filter, itemsOverflowLimit });

      return m(".inner-dropdown-area", [
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
    const cat  = opts.categoryName ?? Checklist.getMetaForDataPath(dataPath)?.searchCategory ?? "";
    const raw  = Array.isArray(serialized) ? serialized
               : Array.isArray(serialized?.items) ? serialized.items
               : [String(serialized)];
    const mode = serialized?.mm || MATCH_MODES.ANY;
    return cat + " " + t(matchModeVerbKey(mode)) + " " + describeList(raw.map(String), opts);
  },

  createFilterDef(type = "text") {
    return {
      type,
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
      if (typeof v === "string" && v.trim() === "") return;
      if (!Object.prototype.hasOwnProperty.call(fd.possible, v)) fd.possible[v] = 0;
      fd.possible[v]++;
    });
  },

  // serializeToQuery / deserializeFromQuery: identical shape to Months; use shared helpers
  serializeToQuery(fd) {
    return serializeListWithMode(fd.selected, fd.matchMode);
  },

  deserializeFromQuery(fd, val) {
    const { selected, matchMode } = deserializeListWithMode(val);
    fd.selected  = selected;
    fd.matchMode = matchMode;
  },

  matches(fd, _rawValue, leafValues) {
    return matchesListWithMode(fd.selected, leafValues, fd.matchMode);
  },
};
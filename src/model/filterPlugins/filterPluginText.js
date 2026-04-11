/**
 * filterPluginText — handles filter UI for "text", "category", and "taxa" filter types.
 *
 * All three share the same checklist UI: a searchable list of checked / unchecked / inactive items.
 */

import m from "mithril";
import { Checklist } from "../Checklist.js";
import { DropdownCheckItemSkeleton, buildCheckItems } from "./shared/DropdownCheckItem.js";
import { describeList } from "./shared/rangeFilterUtils.js";

// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownText = function (initialVnode) {
  let filter = ""; // always lower-case NFD-normalised
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

      const {
        selected, showSelected,
        possible, showPossible,
        impossible, showImpossible,
        itemsOverflowing, filteredPossible, totalPossibleUnchecked,
      } = buildCheckItems({ type, dataPath, filter, itemsOverflowLimit });

      return m(".inner-dropdown-area", [
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
  meta: {

  },

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
   * One crumb per selected item that still exists in the possible set.
   * The `title` doubles as the item identity for removal.
   */
  getCrumbs(filterDef, _ctx) {
    return filterDef.selected
      .filter(item => Object.prototype.hasOwnProperty.call(filterDef.possible, item))
      .map(item => ({ title: item }));
  },

  clearCrumb(filterDef, _ctx, descriptor) {
    const idx = filterDef.selected.indexOf(descriptor.title);
    if (idx > -1) filterDef.selected.splice(idx, 1);
    Checklist.filter.commit();
  },

    describeSerializedValue(dataPath, serialized, opts = {}) {
    const cat  = opts.categoryName ?? Checklist.getMetaForDataPath(dataPath)?.searchCategory ?? "";
    const vals = Array.isArray(serialized) ? serialized.map(String) : [String(serialized)];
    return cat + " " + t("is_list_joiner") + " " + describeList(vals, opts);
  },

  // ── Lifecycle ─────────────────────────────────────────────────────
  createFilterDef(type = "text") {
    return { type, all: [], possible: {}, selected: [], numeric: null };
  },
  clearFilter(fd)    { fd.selected = []; },
  clearPossible(fd)  { fd.possible = {}; },
  accumulatePossible(fd, _rawValue, leafValues) {
    leafValues.forEach(v => {
      if (typeof v === "string" && v.trim() === "") return;
      if (!Object.prototype.hasOwnProperty.call(fd.possible, v)) fd.possible[v] = 0;
      fd.possible[v]++;
    });
  },
  serializeToQuery(fd) {
    return fd.selected.length > 0 ? [...fd.selected] : null;
  },
  deserializeFromQuery(fd, val) {
    fd.selected = Array.isArray(val) ? val : [val];
  },
  matches(fd, _rawValue, leafValues) {
    return fd.selected.length === 0 || leafValues.some(v => fd.selected.includes(v));
  },
};
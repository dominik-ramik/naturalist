/**
 * Shared check-item primitives used across all selectable-list filter dropdowns.
 *
 * Exports:
 *   DropdownCheckItemSkeleton  – pure presentational row (no filter-state coupling)
 *   DropdownCheckItem          – wired row: click → mutates filter state
 *   buildCheckItems            – builds sorted/grouped rows for text/category/taxa
 */

import m from "mithril";
import { sortByCustomOrder, textLowerCaseAccentless } from "../../../components/Utils.js";
import { Checklist } from "../../Checklist.js";

import "./DropdownCheckItem.css";

// ── Pure presentational row ───────────────────────────────────────────────────

export let DropdownCheckItemSkeleton = function (initialVnode) {
  return {
    view(vnode) {
      if (String(vnode.attrs.item).trim() === "") return null;
      return m(
        ".option-item" +
          (vnode.attrs.group ? ".group-member" : "") +
          (vnode.attrs.state === "inactive" ? ".inactive" : ""),
        { onclick: vnode.attrs.action },
        [
          m("img.item-checkbox[src=img/ui/search/checkbox_" +
            (vnode.attrs.state === "checked" ? "checked" : "unchecked") + ".svg]"),
          m(".item-label", vnode.attrs.item),
          m(".item-count", vnode.attrs.count),
        ]
      );
    },
  };
};

// ── Wired checkbox row (click → filter state) ─────────────────────────────────

export let DropdownCheckItem = function (initialVnode) {
  return {
    view(vnode) {
      if (String(vnode.attrs.item).trim() === "") return null;

      const group = Checklist.getCustomOrderGroup(
        vnode.attrs.item, vnode.attrs.type, vnode.attrs.dataPath
      );

      return m(DropdownCheckItemSkeleton, {
        item: vnode.attrs.item,
        group,
        state: vnode.attrs.state,
        count: vnode.attrs.count,
        action() {
          const fd = Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath];
          switch (vnode.attrs.state) {
            case "checked": {
              const idx = fd.selected.indexOf(vnode.attrs.item);
              if (idx > -1) { fd.selected.splice(idx, 1); Checklist.filter.commit(); }
              break;
            }
            case "unchecked":
              Checklist.filter.delayCommitDataPath =
                vnode.attrs.type + "." + vnode.attrs.dataPath;
              fd.selected.push(vnode.attrs.item);
              Checklist.filter.commit();
              break;
            default:
              break;
          }
        },
      });
    },
  };
};

// ── Sorted/grouped check-item builder for text/category/taxa ─────────────────

/**
 * Builds the three sections (selected / possible / impossible) of a text-style
 * checklist dropdown, handling group headers and overflow limiting.
 *
 * @param {object} opts
 * @param {string}   opts.type              – "taxa" | "data"
 * @param {string}   opts.dataPath
 * @param {string}   opts.filter            – normalised search string (lc, NFD)
 * @param {number}   opts.itemsOverflowLimit
 * @returns {{
 *   selected, showSelected,
 *   possible, showPossible,
 *   impossible, showImpossible,
 *   itemsOverflowing, filteredPossible, totalPossibleUnchecked
 * }}
 */
export function buildCheckItems({ type, dataPath, filter, itemsOverflowLimit }) {
  const fd = Checklist.filter[type][dataPath];

  function matchesFilter(text) {
    if (!filter) return true;
    const t = textLowerCaseAccentless(text);
    return t.startsWith(filter) || t.indexOf(" " + filter) > 0;
  }

  let totalItems = 0;
  let filteredPossible = [];
  let totalPossibleUnchecked = 0;

  function buildSection(items, state, conditionFn, updateFn) {
    let currentGroup = "";
    const rows = [];

    sortByCustomOrder(items, type, dataPath).forEach((item) => {
      const thisGroup = Checklist.getCustomOrderGroup(item, type, dataPath);

      if (!matchesFilter(item) || !conditionFn(item)) return;
      updateFn(item);

      // Emit group header when the group changes
      if (currentGroup !== thisGroup) {
        if (thisGroup !== undefined) {
          const groupItems = Checklist.getCustomOrderGroupItems(type, dataPath, thisGroup);
          if (groupItems.length > 0) {
            rows.push(m(DropdownCheckItemSkeleton, {
              state,
              item: thisGroup,
              count: "",
              action: state === "inactive" ? undefined : function () {
                if (state === "checked") {
                  fd.selected = fd.selected.filter(e => !groupItems.includes(e));
                  Checklist.filter.commit();
                } else if (state === "unchecked") {
                  // Set the delay flag before committing so that possible values
                  // for this path are not recalculated mid-session, matching the
                  // same behaviour as individual DropdownCheckItem "unchecked" clicks.
                  Checklist.filter.delayCommitDataPath = type + "." + dataPath;
                  fd.selected = [...new Set([...fd.selected, ...groupItems])];
                  Checklist.filter.commit();
                }
              },
            }));
          }
        }
        currentGroup = thisGroup;
      }

      rows.push(m(DropdownCheckItem, {
        state, type, dataPath, item,
        count: fd.possible?.[item] || 0,
      }));
    });

    return rows;
  }

  const possibleKeys = Object.keys(fd.possible);

  let showSelected = false;
  const selected = buildSection(
    fd.selected,
    "checked",
    item => possibleKeys.includes(item),
    () => { showSelected = true; }
  );

  let showPossible = false;
  const possible = buildSection(
    possibleKeys,
    "unchecked",
    item => !fd.selected.includes(item) && totalItems <= itemsOverflowLimit,
    item => { showPossible = true; totalItems++; totalPossibleUnchecked++; filteredPossible.push(item); }
  );

  let showImpossible = false;
  const impossible = buildSection(
    (fd.all || []).filter(item => !possibleKeys.includes(item)),
    "inactive",
    () => totalItems <= itemsOverflowLimit,
    () => { showImpossible = true; totalItems++; }
  );

  return {
    selected, showSelected,
    possible, showPossible,
    impossible, showImpossible,
    itemsOverflowing: totalItems > itemsOverflowLimit,
    filteredPossible,
    totalPossibleUnchecked,
  };
}
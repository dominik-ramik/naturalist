/**
 * filterPluginMapregions — filter UI for the "mapregions" data type.
 *
 * Combines a region checklist (same pattern as filterPluginText) with an
 * optional "status filter" section that filters by the numeric/categorical
 * value assigned to each region on the map.
 *
 * ── Multi-dimension accumulation pattern ─────────────────────────────────────
 * This plugin maintains two parallel "possible" sets that must influence each
 * other:
 *
 *   fd.possible         – region names visible in the region checklist
 *   fd.possibleStatuses – status values visible in the status-filter section
 *
 * Because `leafValues` is a flat projection (region names only) it carries no
 * status information. `accumulatePossible` therefore ignores `leafValues` and
 * iterates `rawValue` directly — the same approach any future plugin should use
 * whenever it needs cross-filtering across multiple sub-dimensions of a single
 * structured field.
 *
 * The two dimensions constrain each other as follows:
 *   • fd.possible       only counts a region if its status passes the active
 *                       statusFilter (so the region list reacts to status changes).
 *   • fd.possibleStatuses counts TAXA (not regions) so its numbers match the
 *                       counts shown in the region list (i.e. "how many taxa
 *                       would still match if I selected this status").
 *
 * ── Category filter state model ───────────────────────────────────────────────
 * sf.selectedStatuses uses null / [] / [...] to distinguish three states:
 *
 *   null  — no category filter is active; all statuses pass (default)
 *   []    — filter is active but empty; NO category passes (user has explicitly
 *           unchecked every item — useful in mixed numeric+category maps to show
 *           only taxa with numeric values)
 *   [...] — only the listed statuses pass
 *
 * The old model used [] for both "no filter" and "nothing selected", making it
 * impossible to express an empty-selection filter.  The null sentinel removes
 * that ambiguity.
 *
 * ── Stable placeholder bounds ─────────────────────────────────────────────────
 *   fd.globalStatusMin / fd.globalStatusMax track the numeric range of ALL
 *   statuses across ALL regions and ALL taxa, never scoped by selection and
 *   never cleared.  They are used as placeholder text in the numeric range
 *   inputs so the "Min / Max" ghost values remain accurate regardless of what
 *   the user has selected.
 */

import m from "mithril";
import "./filterPluginMapregions.css";
import { textLowerCaseAccentless } from "../../components/Utils.js";
import { Checklist } from "../Checklist.js";
import { parseLegendConfig, parseNumericStatus } from "../../components/MapregionsColorEngine.js";
import { DropdownCheckItem, DropdownCheckItemSkeleton } from "./shared/DropdownCheckItem.js";
import { describeList } from "./shared/rangeFilterUtils.js";

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true when the given status value passes the supplied status-filter.
 * Pure function — no side-effects.
 *
 * ── Category filter semantics ────────────────────────────────────────────────
 *   sf.selectedStatuses === null  → no category filter; all statuses pass
 *   sf.selectedStatuses === []    → filter active, empty; NO status passes
 *   sf.selectedStatuses === [...] → only listed statuses pass
 *
 * When only a range is set, non-numeric statuses do not pass (they cannot be
 * compared to numeric bounds by definition).
 *
 * When both a range and a category selection are present, a status passes if
 * it satisfies the range OR is in the category list.
 */
function statusMatchesSF(status, sf) {
  const hasCatFilter  = sf.selectedStatuses !== null;
  const hasRangeLimit = sf.rangeMin !== null || sf.rangeMax !== null;
  if (!hasCatFilter && !hasRangeLimit) return true;
  if (hasRangeLimit) {
    const n = parseNumericStatus(status);
    if (n !== null) {
      const passesRange = (sf.rangeMin === null || n >= sf.rangeMin) &&
                          (sf.rangeMax === null || n <= sf.rangeMax);
      if (passesRange) return true;
    }
  }
  // Array.includes on an empty array always returns false,
  // which correctly implements "no category passes" when selectedStatuses = [].
  return hasCatFilter && sf.selectedStatuses.includes(status);
}

function isStatusFilterActive(sf) {
  // null selectedStatuses = no filter; [] or [...] = filter is active.
  return !!sf && (sf.selectedStatuses !== null || sf.rangeMin != null || sf.rangeMax != null);
}

function isRangeFilterActive(sf) {
  return !!sf && (sf.rangeMin != null || sf.rangeMax != null);
}

function isCategoryFilterActive(sf) {
  // Explicitly activated (even if empty) vs null (not activated).
  return !!sf && sf.selectedStatuses !== null;
}

function statusFilterTitle(sf) {
  if (sf.selectedStatuses !== null && sf.selectedStatuses.length > 0) {
    return sf.selectedStatuses.join(", ");
  }
  const parts = [];
  if (sf.rangeMin != null) parts.push(sf.rangeMin.toLocaleString());
  parts.push("–");
  if (sf.rangeMax != null) parts.push(sf.rangeMax.toLocaleString());
  return parts.join("");
}

// ── Status filter section renderers (module-private) ─────────────────────────

/**
 * Numeric range row — single line.
 * Placeholder reads "Min (X)" / "Max (X)" from globalMin/globalMax so it
 * remains accurate when the user narrows region/category selections.
 * Dedicated trash icon clears only the numeric range.
 */
function _renderStatusRangeSection(sf, globalMin, globalMax) {
  function setRange(field, rawValue) {
    const n = rawValue === "" ? null : parseFloat(rawValue);
    sf[field] = (n == null || isNaN(n)) ? null : n;
    Checklist.filter.commit();
  }

  const fromPlaceholder = globalMin !== null
    ? t("sf_range_min_placeholder", [globalMin.toLocaleString()])
    : t("sf_range_from");
  const toPlaceholder = globalMax !== null
    ? t("sf_range_max_placeholder", [globalMax.toLocaleString()])
    : t("sf_range_to");

  return m(".sf-range", [
    m(".sf-range-row", [
      m("input.sf-range-input[type=number]", {
        value:       sf.rangeMin ?? "",
        placeholder: fromPlaceholder,
        oninput(e) { setRange("rangeMin", e.target.value); },
      }),
      m("span.sf-range-sep", "–"),
      m("input.sf-range-input[type=number]", {
        value:       sf.rangeMax ?? "",
        placeholder: toPlaceholder,
        oninput(e) { setRange("rangeMax", e.target.value); },
      }),
      isRangeFilterActive(sf)
        ? m("button.sf-range-clear.clickable", {
            title:   t("sf_range_clear"),
            onclick(e) {
              e.stopPropagation();
              sf.rangeMin = null;
              sf.rangeMax = null;
              Checklist.filter.commit();
            },
          }, m("img[src=img/ui/search/clear_filter_dark.svg]"))
        : null,
    ]),
  ]);
}

/**
 * Category checklist.
 *
 * Shows ALL category rows defined in the legend (even impossible ones, grayed).
 *
 * ── Toggle model ──────────────────────────────────────────────────────────────
 * The model uses null / [] / [...] for selectedStatuses (see file header).
 * Toggle semantics when clicking a possible row:
 *
 *   null → first click activates the filter, excluding the clicked item.
 *           All other possible rows are stored in selectedStatuses.
 *
 *   [...] → normal checkbox toggle: add or remove the clicked status.
 *            When the selection grows back to cover all possible rows, the
 *            filter is deactivated (null) — equivalent to "select all".
 *
 * This allows the user to reach selectedStatuses = [] by unchecking every item
 * one by one — a valid state meaning "no category passes".  In mixed
 * numeric+category maps this lets the user view only taxa with numeric values.
 */
function _renderStatusCategorySection(allCatRows, sf, possibleSt) {
  const possibleRows = allCatRows.filter(r =>
    Object.prototype.hasOwnProperty.call(possibleSt, r.status)
  );
  // null means no filter (all effectively checked); [] means all explicitly unchecked.
  const noFilter = sf.selectedStatuses === null;

  function toggleStatus(status) {
    if (noFilter) {
      // Activate filter, excluding the clicked item.
      sf.selectedStatuses = possibleRows
        .filter(r => r.status !== status)
        .map(r => r.status);
    } else {
      const idx = sf.selectedStatuses.indexOf(status);
      if (idx > -1) {
        sf.selectedStatuses.splice(idx, 1);
        // If the explicit list now covers every possible row, deactivate the
        // filter (collapse back to null = "all pass") rather than keeping an
        // explicit full-set that is semantically equivalent to "no filter".
        if (sf.selectedStatuses.length === possibleRows.length) {
          sf.selectedStatuses = null;
        }
      } else {
        sf.selectedStatuses.push(status);
      }
    }
    Checklist.filter.commit();
  }

  return m(".sf-categories", [
    allCatRows.map(row => {
      const isPossible = Object.prototype.hasOwnProperty.call(possibleSt, row.status);
      const isChecked  = isPossible && (noFilter || sf.selectedStatuses.includes(row.status));
      const isInactive = !isPossible;

      return m(".option-item" + (isInactive ? ".inactive" : ""), {
        onclick: !isInactive ? () => toggleStatus(row.status) : undefined,
      }, [
        m("img.item-checkbox[src=img/ui/search/checkbox_" + (isChecked ? "checked" : "unchecked") + ".svg]"),
        m("span.sf-swatch", { style: { backgroundColor: row.fill } }),
        m(".item-label", row.legend || row.status),
        m(".item-count", isPossible ? (possibleSt[row.status] || "") : ""),
      ]);
    }),
    // Trash icon — clears category filter only (sets back to null = inactive).
    isCategoryFilterActive(sf)
      ? m("button.sf-cat-clear.clickable", {
          title:   t("sf_cat_clear"),
          onclick(e) {
            e.stopPropagation();
            sf.selectedStatuses = null;
            Checklist.filter.commit();
          },
        }, m("img[src=img/ui/search/clear_filter_dark.svg]"))
      : null,
  ]);
}

// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownMapregions = function (initialVnode) {
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
      const filterDef  = Checklist.filter[type][dataPath];
      const sf         = filterDef.statusFilter || { selectedStatuses: null, rangeMin: null, rangeMax: null };
      const possible   = filterDef.possible    || {};
      const allRegions = filterDef.all         || [];
      const lc         = parseLegendConfig(Checklist.getMapRegionsLegendRows(), dataPath);
      const possibleSt = filterDef.possibleStatuses || {};

      function matchesSearch(text) {
        if (!filter) return true;
        const n = textLowerCaseAccentless(text);
        return n.startsWith(filter) || n.indexOf(" " + filter) > 0;
      }

      let totalItems = 0, totalPossibleUnchecked = 0;
      let filteredPossible = [];
      let showSelected = false, showPossible = false, showImpossible = false;

      const selectedItems = filterDef.selected
        .filter(item => Object.prototype.hasOwnProperty.call(possible, item) && matchesSearch(item))
        .map(item => {
          showSelected = true;
          return m(DropdownCheckItem, { state: "checked", type, dataPath, item, count: possible[item] || 0 });
        });

      const possibleItems = Object.keys(possible)
        .filter(item => {
          if (filterDef.selected.includes(item) || !matchesSearch(item)) return false;
          if (totalItems++ > itemsOverflowLimit) return false;
          showPossible = true; totalPossibleUnchecked++; filteredPossible.push(item);
          return true;
        })
        .map(item => m(DropdownCheckItem, { state: "unchecked", type, dataPath, item, count: possible[item] || 0 }));

      const impossibleItems = allRegions
        .filter(item => {
          if (Object.prototype.hasOwnProperty.call(possible, item) || filterDef.selected.includes(item) || !matchesSearch(item)) return false;
          if (totalItems++ > itemsOverflowLimit) return false;
          showImpossible = true;
          return true;
        })
        .map(item => m(DropdownCheckItemSkeleton, { state: "inactive", item, count: "" }));

      const itemsOverflowing = totalItems > itemsOverflowLimit;
      const hasNumericMode   = lc.numericMode !== null;
      const allCatRows       = lc.categoryRows;
      const showStatusFilter = hasNumericMode || allCatRows.length > 0;

      return m(".inner-dropdown-area.mapregions", [
        m(".search-filter",
          m("input.options-search[type=search][placeholder=" + t("search") + "][id=" + dropdownId + "_text]", {
            oninput(e) {
              filter = e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            },
          })
        ),

        showStatusFilter
          ? m(".mapregions-status-filter", [
              m(".mapregions-status-filter-title", t("mapregions_status_filter")),
              hasNumericMode
                ? _renderStatusRangeSection(sf, filterDef.globalStatusMin ?? null, filterDef.globalStatusMax ?? null)
                : null,
              allCatRows.length > 0
                ? _renderStatusCategorySection(allCatRows, sf, possibleSt)
                : null,
            ])
          : null,

        m(".options.mapregions-regions", [
          showSelected   ? m(".options-section", selectedItems)   : null,
          showPossible   ? m(".options-section", possibleItems)   : null,
          showImpossible ? m(".options-section", impossibleItems) : null,
          itemsOverflowing
            ? m(".show-next-items", { onclick() { itemsOverflowLimit += INITIAL_LIMIT; } },
                t("next_items_dropdown", [INITIAL_LIMIT]))
            : null,
          !showSelected && !showPossible && !showImpossible
            ? m(".no-items-filter", t("no_items_filter"))
            : null,
        ]),

        filter.length > 0 && totalPossibleUnchecked > 1
          ? m(".apply", {
              onclick() {
                filterDef.selected = [...new Set([...filterDef.selected, ...filteredPossible])];
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

export const filterPluginMapregions = {
  isActive(filterDef) {
    return filterDef.selected.length > 0 || isStatusFilterActive(filterDef.statusFilter);
  },

  getCount(filterDef) {
    return Object.keys(filterDef.possible).length;
  },

  getUnit(_dataPath) {
    return null;
  },

  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownMapregions, { type, dataPath, openHandler, dropdownId });
  },

  getCrumbs(filterDef, _ctx) {
    const crumbs = filterDef.selected
      .filter(item => Object.prototype.hasOwnProperty.call(filterDef.possible, item))
      .map(item => ({ title: item }));

    if (isStatusFilterActive(filterDef.statusFilter)) {
      crumbs.push({
        title:          statusFilterTitle(filterDef.statusFilter),
        isStatusFilter: true,
      });
    }

    return crumbs;
  },

  clearCrumb(filterDef, _ctx, descriptor) {
    if (descriptor.isStatusFilter) {
      filterDef.statusFilter.selectedStatuses = null;   // null = deactivate, not []
      filterDef.statusFilter.rangeMin         = null;
      filterDef.statusFilter.rangeMax         = null;
    } else {
      const idx = filterDef.selected.indexOf(descriptor.title);
      if (idx > -1) filterDef.selected.splice(idx, 1);
    }
    Checklist.filter.commit();
  },

  describeSerializedValue(dataPath, serialized, opts = {}) {
    const cat     = opts.categoryName ?? Checklist.getMetaForDataPath(dataPath)?.searchCategory ?? "";
    const regions = Array.isArray(serialized) ? serialized : (serialized?.regions ?? []);
    const sf      = serialized?.sf;

    let desc = regions.length > 0
      ? cat + " " + t("is_list_joiner") + " " + describeList(regions, opts)
      : "";

    if (sf) {
      let sfDesc = "";
      if (sf.s?.length > 0) {
        sfDesc = sf.s.join(", ");
      } else if (sf.s?.length === 0) {
        sfDesc = t("sf_no_categories");
      } else if (sf.min != null || sf.max != null) {
        sfDesc = sf.min != null && sf.max != null
          ? `${sf.min}\u2013${sf.max}`
          : sf.min != null ? `\u2265${sf.min}` : `\u2264${sf.max}`;
      }
      if (sfDesc) {
        const sfLabel = t("mapregions_status_filter");
        desc = desc
          ? `${desc} (${sfLabel}: ${sfDesc})`
          : `${cat} \u2013 ${sfLabel}: ${sfDesc}`;
      }
    }

    return desc;
  },

  // ── Lifecycle ─────────────────────────────────────────────────────

  createFilterDef() {
    return {
      type:             "mapregions",
      all:              [],
      possible:         {},
      selected:         [],
      numeric:          null,
      statusFilter:     { selectedStatuses: null, rangeMin: null, rangeMax: null },
      possibleStatuses: {},
      globalStatusMin:  null,
      globalStatusMax:  null,
    };
  },

  clearFilter(fd) {
    fd.selected         = [];
    fd.statusFilter     = { selectedStatuses: null, rangeMin: null, rangeMax: null };
    fd.possibleStatuses = {};
    // globalStatusMin / globalStatusMax intentionally NOT cleared.
  },

  clearPossible(fd) {
    fd.possible         = {};
    fd.possibleStatuses = {};
    // globalStatusMin / globalStatusMax intentionally NOT cleared.
  },

  /**
   * Accumulates both possible dimensions from rawValue.
   *
   * `leafValues` is ignored — only rawValue carries both region and status.
   *
   * fd.possible:
   *   Counts how many taxa have this region with a passing status.
   *   (same semantics as any other checklist filter's possible counts)
   *
   * fd.possibleStatuses:
   *   Counts how many TAXA have at least one region with each status.
   *   A Set is used to ensure each status is counted at most once per taxon
   *   call, regardless of how many regions of that taxon share that status.
   *   This keeps possibleStatuses counts comparable to the region list counts
   *   and to the total number of taxa — they represent the same unit.
   *
   * fd.globalStatusMin / fd.globalStatusMax:
   *   Updated unconditionally from every numeric status so placeholder text
   *   never collapses when the user narrows the region/category selection.
   */
  accumulatePossible(fd, rawValue, _leafValues) {
    if (!rawValue || typeof rawValue !== "object") return;

    const sf       = fd.statusFilter;
    const sfActive = isStatusFilterActive(sf);

    // Collect unique statuses for THIS taxon before incrementing, so each
    // status is counted once per taxon (not once per region within a taxon).
    const statusesForThisTaxon = new Set();

    Object.entries(rawValue).forEach(([code, regionData]) => {
      const name   = Checklist.nameForMapRegion(code);
      const status = regionData?.status ?? "";

      // ── Global numeric bounds (unscoped, never cleared) ──────────────
      if (status !== "") {
        const n = parseNumericStatus(status);
        if (n !== null) {
          if (fd.globalStatusMin === null || n < fd.globalStatusMin) fd.globalStatusMin = n;
          if (fd.globalStatusMax === null || n > fd.globalStatusMax) fd.globalStatusMax = n;
        }
      }

      // ── fd.possible: count region when its status passes the filter ──
      if (!sfActive || statusMatchesSF(status, sf)) {
        if (name && name.trim() !== "") {
          fd.possible[name] = (fd.possible[name] || 0) + 1;
        }
      }

      // ── Collect statuses in scope for this taxon ─────────────────────
      // Scoped to selected regions when regions are selected.
      const inScope = fd.selected.length === 0
        || fd.selected.includes(name)
        || fd.selected.includes(code);
      if (inScope && status !== "") {
        statusesForThisTaxon.add(status);
      }
    });

    // Increment possibleStatuses once per status per taxon.
    statusesForThisTaxon.forEach(status => {
      fd.possibleStatuses[status] = (fd.possibleStatuses[status] || 0) + 1;
    });
  },

  matches(fd, rawValue, _leafValues) {
    if (!rawValue || typeof rawValue !== "object") return false;
    const regionCodes = Object.keys(rawValue);

    const regionPasses = fd.selected.length === 0 || regionCodes.some(code => {
      const name = Checklist.nameForMapRegion(code);
      return fd.selected.includes(name) || fd.selected.includes(code);
    });
    if (!regionPasses) return false;

    if (!isStatusFilterActive(fd.statusFilter)) return true;

    const codesInScope = fd.selected.length > 0
      ? regionCodes.filter(code => {
          const name = Checklist.nameForMapRegion(code);
          return fd.selected.includes(name) || fd.selected.includes(code);
        })
      : regionCodes;

    return codesInScope.some(code =>
      statusMatchesSF(rawValue[code]?.status ?? "", fd.statusFilter)
    );
  },

  serializeToQuery(fd) {
    const sfActive = isStatusFilterActive(fd.statusFilter);
    if (!fd.selected.length && !sfActive) return null;
    const obj = { regions: fd.selected };
    if (sfActive) {
      obj.sf = {};
      // Include the 's' key whenever selectedStatuses is not null (even if []).
      // Absence of 's' key in deserialization means null (no category filter).
      if (fd.statusFilter.selectedStatuses !== null) obj.sf.s = fd.statusFilter.selectedStatuses;
      if (fd.statusFilter.rangeMin !== null) obj.sf.min = fd.statusFilter.rangeMin;
      if (fd.statusFilter.rangeMax !== null) obj.sf.max = fd.statusFilter.rangeMax;
    }
    return obj;
  },

  deserializeFromQuery(fd, val) {
    fd.selected = Array.isArray(val) ? val : Array.isArray(val?.regions) ? val.regions : [];
    if (val?.sf) {
      // Presence of 's' key (even with empty array) means the category filter
      // is active.  Absence of 's' key means null (filter not activated).
      fd.statusFilter.selectedStatuses = ('s' in val.sf)
        ? (Array.isArray(val.sf.s) ? val.sf.s : null)
        : null;
      fd.statusFilter.rangeMin = val.sf.min ?? null;
      fd.statusFilter.rangeMax = val.sf.max ?? null;
    }
  },
};
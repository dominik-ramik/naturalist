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
 *   • fd.possibleStatuses only counts a status for regions that are currently
 *                       selected (so the status list reacts to region changes).
 *                       When no regions are selected all statuses are counted.
 *
 * ── Stable placeholder bounds ─────────────────────────────────────────────────
 *   fd.globalStatusMin / fd.globalStatusMax track the numeric range of ALL
 *   statuses across ALL regions and ALL taxa, never scoped by selection and
 *   never cleared.  They are used as placeholder text in the numeric range
 *   inputs so the "Min / Max" ghost values remain accurate regardless of what
 *   the user has selected.
 */

import m from "mithril";
import { textLowerCaseAccentless } from "../../components/Utils.js";
import { Checklist } from "../Checklist.js";
import { parseLegendConfig, parseNumericStatus } from "../../components/MapregionsColorEngine.js";
import { DropdownCheckItem, DropdownCheckItemSkeleton } from "./shared/DropdownCheckItem.js";
import { describeList } from "./shared/rangeFilterUtils.js";

import "./filterPluginMapregions.css";

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true when the given status value passes the supplied status-filter
 * descriptor.  Pure function — no side-effects, safe to call from anywhere.
 *
 * Precedence when both range and category selections are present:
 *   A status passes if it satisfies the range OR is in the selected list.
 *   (Mixing both modes is an edge-case; the UI never produces it simultaneously.)
 *
 * When only a range is set, non-numeric statuses do not pass — they cannot be
 * compared to numeric bounds by definition.
 */
function statusMatchesSF(status, sf) {
  const hasStatusSel  = sf.selectedStatuses.length > 0;
  const hasRangeLimit = sf.rangeMin !== null || sf.rangeMax !== null;
  if (!hasStatusSel && !hasRangeLimit) return true;
  if (hasRangeLimit) {
    const n = parseNumericStatus(status);
    if (n !== null) {
      const passesRange = (sf.rangeMin === null || n >= sf.rangeMin) &&
                          (sf.rangeMax === null || n <= sf.rangeMax);
      if (passesRange) return true;
    }
  }
  return hasStatusSel && sf.selectedStatuses.includes(status);
}

function isStatusFilterActive(sf) {
  return !!sf && (sf.selectedStatuses?.length > 0 || sf.rangeMin != null || sf.rangeMax != null);
}

function isRangeFilterActive(sf) {
  return !!sf && (sf.rangeMin != null || sf.rangeMax != null);
}

function isCategoryFilterActive(sf) {
  return !!sf && sf.selectedStatuses?.length > 0;
}

function statusFilterTitle(sf) {
  if (sf.selectedStatuses?.length > 0) return sf.selectedStatuses.join(", ");
  const parts = [];
  if (sf.rangeMin != null) parts.push(sf.rangeMin.toLocaleString());
  parts.push("–");
  if (sf.rangeMax != null) parts.push(sf.rangeMax.toLocaleString());
  return parts.join("");
}

// ── Status filter section renderers (module-private) ─────────────────────────

/**
 * Numeric range row.
 *
 * Stays on a single line.  Placeholder text reads "Min (X)" / "Max (X)" using
 * the global (never-scoped) status bounds so it remains accurate even when the
 * user has narrowed the region or category selection.  Includes a dedicated
 * trash icon that resets only the numeric range, leaving category selections
 * untouched.
 *
 * @param {object}      sf         – statusFilter object (mutable)
 * @param {number|null} globalMin  – fd.globalStatusMin (stable across all passes)
 * @param {number|null} globalMax  – fd.globalStatusMax (stable across all passes)
 */
function _renderStatusRangeSection(sf, globalMin, globalMax) {
  function setRange(field, rawValue) {
    const n = rawValue === "" ? null : parseFloat(rawValue);
    sf[field] = (n == null || isNaN(n)) ? null : n;
    Checklist.filter.commit();
  }

  // Placeholder text communicates open-ended semantics:
  // leaving "to" empty means "up to Max", leaving "from" empty means "from Min".
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
      // Dedicated clear for the numeric range only — does NOT touch category selections.
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
 * Shows ALL category rows defined in the legend config, not just those present
 * in the current possible-statuses set.  Rows whose status is absent from
 * `possibleSt` (i.e. impossible given the current region selection or other
 * filters) are rendered as "inactive" (grayed, non-interactive) — mirroring
 * the behaviour of the region checklist for impossible regions.
 *
 * Toggle logic only operates over possible rows so that impossible statuses
 * are never stored in `selectedStatuses` inadvertently.
 *
 * Includes a dedicated "clear categories" button visible only when at least
 * one category is explicitly selected.
 *
 * @param {object[]} allCatRows  – all category rows from parseLegendConfig (the full legend)
 * @param {object}   sf          – statusFilter object (mutable)
 * @param {object}   possibleSt  – fd.possibleStatuses
 */
function _renderStatusCategorySection(allCatRows, sf, possibleSt) {
  const possibleRows = allCatRows.filter(r =>
    Object.prototype.hasOwnProperty.call(possibleSt, r.status)
  );
  const noneSelected = sf.selectedStatuses.length === 0;

  function toggleStatus(status) {
    if (noneSelected) {
      // All possible rows are effectively "on"; clicking one means: exclude it.
      sf.selectedStatuses = possibleRows
        .filter(r => r.status !== status)
        .map(r => r.status);
    } else {
      const idx = sf.selectedStatuses.indexOf(status);
      if (idx > -1) {
        sf.selectedStatuses.splice(idx, 1);
        // Collapse back to implicit "all selected" when nothing is excluded.
        if (sf.selectedStatuses.length === possibleRows.length) sf.selectedStatuses = [];
      } else {
        sf.selectedStatuses.push(status);
      }
    }
    Checklist.filter.commit();
  }

  return m(".sf-categories", [
    allCatRows.map(row => {
      const isPossible = Object.prototype.hasOwnProperty.call(possibleSt, row.status);
      const isChecked  = isPossible && (noneSelected || sf.selectedStatuses.includes(row.status));
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
    // Dedicated clear for category selection only — does NOT touch numeric range.
    isCategoryFilterActive(sf)
      ? m("button.sf-cat-clear.clickable", {
          title:   t("sf_cat_clear"),
          onclick(e) {
            e.stopPropagation();
            sf.selectedStatuses = [];
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
      const sf         = filterDef.statusFilter || { selectedStatuses: [], rangeMin: null, rangeMax: null };
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

      const hasNumericMode = lc.numericMode !== null;
      // All category rows defined in the legend — shown even if currently impossible.
      const allCatRows     = lc.categoryRows;
      const showStatusFilter = hasNumericMode || allCatRows.length > 0;

      return m(".inner-dropdown-area.mapregions", [
        // ── Search ─────────────────────────────────────────────────────────
        m(".search-filter",
          m("input.options-search[type=search][placeholder=" + t("search") + "][id=" + dropdownId + "_text]", {
            oninput(e) {
              filter = e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            },
          })
        ),

        // ── Status filter panel: numeric first, then categories ───────────
        // Capped at 50% of the dropdown height by CSS (.mapregions-status-filter).
        // The panel is present only when the legend defines numeric or category modes.
        showStatusFilter
          ? m(".mapregions-status-filter", [
              m(".mapregions-status-filter-title", t("mapregions_status_filter")),
              hasNumericMode
                ? _renderStatusRangeSection(
                    sf,
                    filterDef.globalStatusMin ?? null,
                    filterDef.globalStatusMax ?? null
                  )
                : null,
              allCatRows.length > 0
                ? _renderStatusCategorySection(allCatRows, sf, possibleSt)
                : null,
            ])
          : null,

        // ── Region checklist (scrollable, fills remaining space) ──────────
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

        // ── Check-all-shown (while text-searching) ────────────────────────
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
  meta: {
    filterType: "categorical",
    filterLabel: "Categorical multi-select (region names) + optional status filter",
    filterDescription: "Shows region names as checkboxes, resolved from the Map Regions Information table. An optional status sub-filter (categorical or numeric range) is shown when the column's Map Regions Legend contains status codes.",
  },
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

  /**
   * Returns one crumb per selected region (that still exists in possible),
   * plus one status-filter crumb when the status filter is active.
   * Status-filter crumbs carry `isStatusFilter: true` so the view can apply
   * the `crumb--status-filter` class for distinct styling.
   */
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
      filterDef.statusFilter.selectedStatuses = [];
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
      statusFilter:     { selectedStatuses: [], rangeMin: null, rangeMax: null },
      possibleStatuses: {},
      // Stable placeholder bounds — set once, never cleared, never scoped.
      // Mirrors the globalMin/globalMax pattern used by number/date plugins.
      globalStatusMin:  null,
      globalStatusMax:  null,
    };
  },

  clearFilter(fd) {
    fd.selected         = [];
    fd.statusFilter     = { selectedStatuses: [], rangeMin: null, rangeMax: null };
    fd.possibleStatuses = {};
    // globalStatusMin / globalStatusMax intentionally NOT cleared:
    // they represent the data range and must survive filter resets.
  },

  clearPossible(fd) {
    fd.possible         = {};
    fd.possibleStatuses = {};
    // globalStatusMin / globalStatusMax intentionally NOT cleared.
  },

  /**
   * Accumulates both possible dimensions from the raw structured value.
   *
   * `leafValues` (flat region-name array) is intentionally ignored here.
   * The two dimensions must cross-constrain each other, which requires
   * iterating the full `rawValue` map so we can access both region identity
   * and status in the same loop — information that `leafValues` does not carry.
   *
   * fd.possible:
   *   A region is counted only when its status passes the active statusFilter.
   *   This makes the region list react to status filter changes.
   *
   * fd.possibleStatuses:
   *   A status is counted only for currently-selected regions (or all regions
   *   when none are selected). This makes the status panel react to region
   *   selections.
   *
   * fd.globalStatusMin / fd.globalStatusMax:
   *   Updated from every numeric status across every region unconditionally,
   *   so placeholder text in the numeric inputs never collapses or disappears
   *   when the user narrows the region or category selection.
   */
  accumulatePossible(fd, rawValue, _leafValues) {
    if (!rawValue || typeof rawValue !== "object") return;

    const sf       = fd.statusFilter;
    const sfActive = isStatusFilterActive(sf);

    Object.entries(rawValue).forEach(([code, regionData]) => {
      const name   = Checklist.nameForMapRegion(code);
      const status = regionData?.status ?? "";

      // ── Global numeric bounds (unscoped, never cleared) ──────────────
      // Processed before any selection scoping so placeholders remain
      // accurate regardless of what the user has filtered.
      if (status !== "") {
        const n = parseNumericStatus(status);
        if (n !== null) {
          if (fd.globalStatusMin === null || n < fd.globalStatusMin) fd.globalStatusMin = n;
          if (fd.globalStatusMax === null || n > fd.globalStatusMax) fd.globalStatusMax = n;
        }
      }

      // ── fd.possible (region checklist) ──────────────────────────────
      // Count this region only when its status satisfies the current
      // status filter. When no status filter is active every region counts.
      if (!sfActive || statusMatchesSF(status, sf)) {
        if (name && name.trim() !== "") {
          fd.possible[name] = (fd.possible[name] || 0) + 1;
        }
      }

      // ── fd.possibleStatuses (status panel) ──────────────────────────
      // Scope to selected regions so the status panel reflects only
      // statuses relevant to the user's current region selection.
      if (fd.selected.length > 0) {
        if (!fd.selected.includes(name) && !fd.selected.includes(code)) return;
      }
      if (status !== "") {
        fd.possibleStatuses[status] = (fd.possibleStatuses[status] || 0) + 1;
      }
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

    // When regions are selected, only those regions' statuses need to pass.
    // When none are selected, any region's status passing is sufficient.
    const codesInScope = fd.selected.length > 0
      ? regionCodes.filter(code => {
          const name = Checklist.nameForMapRegion(code);
          return fd.selected.includes(name) || fd.selected.includes(code);
        })
      : regionCodes;

    return codesInScope.some(code => statusMatchesSF(rawValue[code]?.status ?? "", fd.statusFilter));
  },

  serializeToQuery(fd) {
    const sfActive = isStatusFilterActive(fd.statusFilter);
    if (!fd.selected.length && !sfActive) return null;
    const obj = { regions: fd.selected };
    if (sfActive) {
      obj.sf = {};
      if (fd.statusFilter.selectedStatuses.length > 0) obj.sf.s = fd.statusFilter.selectedStatuses;
      if (fd.statusFilter.rangeMin !== null) obj.sf.min = fd.statusFilter.rangeMin;
      if (fd.statusFilter.rangeMax !== null) obj.sf.max = fd.statusFilter.rangeMax;
    }
    return obj;
  },

  deserializeFromQuery(fd, val) {
    fd.selected = Array.isArray(val) ? val : Array.isArray(val?.regions) ? val.regions : [];
    if (val?.sf) {
      fd.statusFilter.selectedStatuses = Array.isArray(val.sf.s) ? val.sf.s : [];
      fd.statusFilter.rangeMin = val.sf.min ?? null;
      fd.statusFilter.rangeMax = val.sf.max ?? null;
    }
  },
};
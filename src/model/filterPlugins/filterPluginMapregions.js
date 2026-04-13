/**
 * filterPluginMapregions — filter UI for the "mapregions" data type.
 *
 * ── Phase 5 overhaul summary ──────────────────────────────────────────────────
 *
 *   • "Include Numeric" toggle removed.  Numeric regions now participate purely
 *     additively: if rangeMin/Max are blank, numeric-status regions are ignored
 *     by the status filter entirely; if a range is set, only numeric values within
 *     that range pass.
 *
 *   • Category checkboxes now start empty/unchecked (additive), matching the
 *     behaviour of standard text checklists.  selectedStatuses: []  means "no
 *     category filter — all categorical regions pass".
 *
 *   • Status evaluations are strictly correlated: when regions are explicitly
 *     selected, the status filter is evaluated only against those regions.
 *
 * ── Match Mode (Phase 1–4) ────────────────────────────────────────────────────
 *   Applies to the region checklist.
 *   ANY     – taxon is found in ≥1 selected region  (default)
 *   ALL     – taxon is found in every selected region
 *   EXCLUDE – taxon is found in none of the selected regions
 *
 * ── Status filter state model ─────────────────────────────────────────────────
 *   sf.selectedStatuses  []  = no category filter (all pass)
 *                        [...] = only the listed categorical statuses pass
 *
 *   sf.rangeMin / sf.rangeMax  (number | null)
 *     Both null → numeric regions are ignored by the status filter.
 *     Either set → numeric values must fall within the given range.
 *
 *   fd.globalStatusMin / fd.globalStatusMax
 *     Track the full numeric spread across all taxa, never scoped or cleared.
 *     Power placeholder text in the range inputs.
 */

import m from "mithril";
import "./filterPluginMapregions.css";
import { Checklist } from "../Checklist.js";
import { parseLegendConfig, parseNumericStatus } from "../../components/MapregionsColorEngine.js";
import { buildCheckItems } from "./shared/DropdownCheckItem.js";
import { describeList } from "./shared/filterUtils.js";
import { MatchModeToggle, MATCH_MODES } from "./shared/MatchModeToggle.js";

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true when the given region status passes the status filter.
 *
 * Numeric and categorical dimensions are independent:
 *   Numeric:     ignored when no range is set; otherwise must be within range.
 *   Categorical: [] = no filter (all pass); [...] = only listed statuses pass.
 */
function statusMatchesSF(status, sf) {
  const n         = parseNumericStatus(status);
  const isNumeric = n !== null;

  if (isNumeric) {
    // Purely additive: a numeric region participates only when a range constraint exists.
    if (sf.rangeMin === null && sf.rangeMax === null) return false;
    return (sf.rangeMin === null || n >= sf.rangeMin) &&
           (sf.rangeMax === null || n <= sf.rangeMax);
  }

  // Categorical: empty array = no filter
  if (!sf.selectedStatuses || sf.selectedStatuses.length === 0) return true;
  return sf.selectedStatuses.includes(status);
}

/**
 * The status filter is active when any control deviates from its neutral default:
 *   neutral numeric: rangeMin and rangeMax both null
 *   neutral category: selectedStatuses is [] (empty = no filter)
 */
function isStatusFilterActive(sf) {
  return !!sf && (
    (sf.rangeMin  != null) ||
    (sf.rangeMax  != null) ||
    (sf.selectedStatuses?.length > 0)
  );
}

function isRangeFilterActive(sf) {
  return !!sf && (sf.rangeMin != null || sf.rangeMax != null);
}

function isCategoryFilterActive(sf) {
  return !!sf && sf.selectedStatuses?.length > 0;
}

function statusFilterTitle(sf) {
  const parts = [];

  if (isRangeFilterActive(sf)) {
    const rangeParts = [];
    if (sf.rangeMin != null) rangeParts.push(sf.rangeMin.toLocaleString());
    rangeParts.push("\u2013");
    if (sf.rangeMax != null) rangeParts.push(sf.rangeMax.toLocaleString());
    parts.push(rangeParts.join(""));
  }

  if (isCategoryFilterActive(sf)) {
    parts.push(sf.selectedStatuses.join(", "));
  }

  return parts.join("; ");
}

// ── Status filter section renderers ──────────────────────────────────────────

/**
 * Numeric range row.
 *
 * "Include Numeric" toggle has been removed (Phase 5).  If Min/Max are blank,
 * numeric regions are simply ignored; no explicit toggle is needed.
 */
function _renderStatusRangeSection(sf, globalMin, globalMax, type, dataPath) {
  function setRange(field, rawValue) {
    const n      = rawValue === "" ? null : parseFloat(rawValue);
    sf[field]    = (n == null || isNaN(n)) ? null : n;
    Checklist.filter.delayCommitDataPath = type + "." + dataPath;
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
        oninput(e)   { setRange("rangeMin", e.target.value); },
      }),
      m("span.sf-range-sep", "\u2013"),
      m("input.sf-range-input[type=number]", {
        value:       sf.rangeMax ?? "",
        placeholder: toPlaceholder,
        oninput(e)   { setRange("rangeMax", e.target.value); },
      }),
      isRangeFilterActive(sf)
        ? m("button.sf-range-clear.clickable", {
            title:   t("sf_range_clear"),
            onclick(e) {
              e.stopPropagation();
              sf.rangeMin = null;
              sf.rangeMax = null;
              Checklist.filter.delayCommitDataPath = type + "." + dataPath;
              Checklist.filter.commit();
            },
          }, m("img[src=img/ui/search/clear_filter_dark.svg]"))
        : null,
    ]),
  ]);
}

/**
 * Category checklist — additive model (Phase 5).
 *
 * selectedStatuses: []    → no filter; all boxes start unchecked.
 * selectedStatuses: [...] → only listed statuses pass; checked boxes show selection.
 *
 * Clicking an unchecked possible row adds it to the selection.
 * Clicking a checked row removes it; when the list returns to empty → no filter ([] state).
 * Trash button resets to [] (no filter).
 */
function _renderStatusCategorySection(allCatRows, sf, possibleSt, type, dataPath) {
  const possibleRows = allCatRows.filter(r =>
    Object.prototype.hasOwnProperty.call(possibleSt, r.status)
  );

  function toggleStatus(status) {
    const idx = sf.selectedStatuses.indexOf(status);
    if (idx > -1) {
      sf.selectedStatuses.splice(idx, 1);
      // [] means no filter — intentional; nothing to collapse further
    } else {
      sf.selectedStatuses.push(status);
    }
    Checklist.filter.delayCommitDataPath = type + "." + dataPath;
    Checklist.filter.commit();
  }

  return m(".sf-categories", [
    allCatRows.map(row => {
      const isPossible = Object.prototype.hasOwnProperty.call(possibleSt, row.status);
      // Additive: a box is checked only when explicitly in selectedStatuses
      const isChecked  = isPossible && sf.selectedStatuses.includes(row.status);
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

    isCategoryFilterActive(sf)
      ? m("button.sf-cat-clear.clickable", {
          title:   t("sf_cat_clear"),
          onclick(e) {
            e.stopPropagation();
            sf.selectedStatuses = [];        // reset to "no filter"
            Checklist.filter.delayCommitDataPath = type + "." + dataPath;
            Checklist.filter.commit();
          },
        }, m("img[src=img/ui/search/clear_filter_dark.svg]"))
      : null,
  ]);
}

// ── Dropdown component ────────────────────────────────────────────────────────

let DropdownMapregions = function () {
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
      const filterDef  = Checklist.filter[type][dataPath];
      const sf         = filterDef.statusFilter;
      const lc         = parseLegendConfig(Checklist.getMapRegionsLegendRows(), dataPath);
      const possibleSt = filterDef.possibleStatuses || {};

      const {
        selected: selectedItems, showSelected,
        possible: possibleItems, showPossible,
        impossible: impossibleItems, showImpossible,
        itemsOverflowing, filteredPossible, totalPossibleUnchecked,
      } = buildCheckItems({ type, dataPath, filter, itemsOverflowLimit });

      const hasNumericMode  = lc.numericMode !== null;
      const allCatRows      = lc.categoryRows;
      const showStatusFilter = hasNumericMode || allCatRows.length > 0;

      return m(".inner-dropdown-area.mapregions", [
        // Match Mode toggle — mapregions is always multi-value
        m(MatchModeToggle, {
          filterDef,
          supportsMatchAll: true,
          onCommit()        { Checklist.filter.commit(); },
        }),

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
                ? _renderStatusRangeSection(
                    sf,
                    filterDef.globalStatusMin ?? null,
                    filterDef.globalStatusMax ?? null,
                    type, dataPath
                  )
                : null,
              allCatRows.length > 0
                ? _renderStatusCategorySection(allCatRows, sf, possibleSt, type, dataPath)
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
  // Phase 1: opt-in
  supportsMatchMode: true,

  isActive(filterDef) {
    return filterDef.selected.length > 0 ||
           isStatusFilterActive(filterDef.statusFilter) ||
           (filterDef.matchMode && filterDef.matchMode !== MATCH_MODES.ANY && filterDef.selected.length > 0);
  },

  getCount(filterDef) {
    return Object.keys(filterDef.possible).length;
  },

  getUnit(_dataPath) { return null; },

  renderDropdown({ type, dataPath, openHandler, dropdownId }) {
    return m(DropdownMapregions, { type, dataPath, openHandler, dropdownId });
  },

  getCrumbs(filterDef, _ctx) {
    const mode   = filterDef.matchMode || MATCH_MODES.ANY;
    const crumbs = filterDef.selected
      .filter(item => Object.prototype.hasOwnProperty.call(filterDef.possible, item))
      .map(item => ({ title: item, matchMode: mode }));

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
    const mode    = serialized?.mm || MATCH_MODES.ANY;
    const sf      = serialized?.sf;

    const verbKey = mode === MATCH_MODES.ALL     ? "is_all_list_joiner"
                  : mode === MATCH_MODES.EXCLUDE ? "is_not_list_joiner"
                  : "is_list_joiner";

    let desc = regions.length > 0
      ? cat + " " + t(verbKey) + " " + describeList(regions, opts)
      : "";

    if (sf) {
      const sfParts = [];
      if (sf.min != null || sf.max != null) {
        sfParts.push(
          sf.min != null && sf.max != null ? `${sf.min}\u2013${sf.max}`
          : sf.min != null ? `\u2265${sf.min}` : `\u2264${sf.max}`
        );
      }
      if (sf.s?.length > 0) sfParts.push(sf.s.join(", "));

      if (sfParts.length > 0) {
        const sfLabel = t("mapregions_status_filter");
        const sfDesc  = sfParts.join("; ");
        desc = desc
          ? `${desc} (${sfLabel}: ${sfDesc})`
          : `${cat} \u2013 ${sfLabel}: ${sfDesc}`;
      }
    }

    return desc;
  },

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  createFilterDef() {
    return {
      type:      "mapregions",
      all:       [],
      possible:  {},
      selected:  [],
      numeric:   null,
      matchMode: MATCH_MODES.ANY,
      statusFilter: {
        selectedStatuses: [],    // Phase 5: [] = no filter (additive default)
        rangeMin:         null,
        rangeMax:         null,
        // includeNumeric REMOVED (Phase 5)
      },
      possibleStatuses: {},
      globalStatusMin:  null,
      globalStatusMax:  null,
    };
  },

  clearFilter(fd) {
    fd.selected   = [];
    fd.matchMode  = MATCH_MODES.ANY;
    fd.statusFilter = {
      selectedStatuses: [],
      rangeMin:         null,
      rangeMax:         null,
    };
    // NOTE: possibleStatuses is a computed value, not a selection.
    // It must only be cleared in clearPossible() (which is gated by
    // delayCommitDataPath), matching the pattern of all other plugins.
  },

  clearPossible(fd) {
    fd.possible         = {};
    fd.possibleStatuses = {};
  },

  accumulatePossible(fd, rawValue, _leafValues) {
    if (!rawValue || typeof rawValue !== "object") return;

    const sf       = fd.statusFilter;
    const sfActive = isStatusFilterActive(sf);
    const statusesForThisTaxon = new Set();

    Object.entries(rawValue).forEach(([code, regionData]) => {
      const name   = Checklist.nameForMapRegion(code);
      const status = regionData?.status ?? "";

      // Global numeric bounds (unscoped, never cleared)
      if (status !== "") {
        const n = parseNumericStatus(status);
        if (n !== null) {
          if (fd.globalStatusMin === null || n < fd.globalStatusMin) fd.globalStatusMin = n;
          if (fd.globalStatusMax === null || n > fd.globalStatusMax) fd.globalStatusMax = n;
        }
      }

      // Count region as possible when its status passes the current filter
      if (!sfActive || statusMatchesSF(status, sf)) {
        if (name && name.trim() !== "") {
          fd.possible[name] = (fd.possible[name] || 0) + 1;
        }
      }

      // Collect statuses scoped to the currently-selected regions
      const inScope = fd.selected.length === 0
        || fd.selected.includes(name)
        || fd.selected.includes(code);
      if (inScope && status !== "") {
        statusesForThisTaxon.add(status);
      }
    });

    statusesForThisTaxon.forEach(status => {
      fd.possibleStatuses[status] = (fd.possibleStatuses[status] || 0) + 1;
    });
  },

  /**
   * Phase 4 + Phase 5 (strict correlated linkage).
   *
   * Region match mode (ANY / ALL / EXCLUDE) applies to the selected region list.
   * Status filter is an additional AND constraint, evaluated only against the
   * in-scope regions (the explicitly selected ones when a selection exists).
   *
   * EXCLUDE mode: if the taxon has NO map data at all, it fails (Phase 6 style).
   */
  matches(fd, rawValue, _leafValues) {
    // No data at all → fail when any filter is active
    if (!rawValue || typeof rawValue !== "object") {
      return fd.selected.length === 0 && !isStatusFilterActive(fd.statusFilter);
    }

    const regionCodes = Object.keys(rawValue);
    const mode        = fd.matchMode || MATCH_MODES.ANY;
    const sfActive    = isStatusFilterActive(fd.statusFilter);

    // ── Region match ─────────────────────────────────────────────────────────
    if (fd.selected.length > 0) {
      const inSelected = code => {
        const name = Checklist.nameForMapRegion(code);
        return fd.selected.includes(name) || fd.selected.includes(code);
      };

      if (mode === MATCH_MODES.EXCLUDE) {
        // Taxon must NOT appear in ANY selected region; status filter irrelevant.
        return !regionCodes.some(inSelected);
      }

      if (mode === MATCH_MODES.ALL) {
        // Taxon must appear in EVERY selected region.
        const codesPresent = new Set(regionCodes);
        const passes = fd.selected.every(sel =>
          regionCodes.some(code => {
            const name = Checklist.nameForMapRegion(code);
            return name === sel || code === sel;
          })
        );
        if (!passes) return false;
      } else {
        // ANY (default)
        if (!regionCodes.some(inSelected)) return false;
      }
    }

    // ── Status filter (correlated linkage) ───────────────────────────────────
    if (!sfActive) return true;

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

  /**
   * Serialization: matchMode written as "mm" only when non-default.
   * "inc" (includeNumeric) is no longer written; stale values in old URLs are ignored.
   * selectedStatuses serialized as "s" only when the category filter is active (non-empty).
   */
  serializeToQuery(fd) {
    const sfActive = isStatusFilterActive(fd.statusFilter);
    const hasMode  = fd.matchMode && fd.matchMode !== MATCH_MODES.ANY;
    if (!fd.selected.length && !sfActive && !hasMode) return null;

    const obj = { regions: fd.selected };
    if (hasMode) obj.mm = fd.matchMode;

    if (sfActive) {
      obj.sf = {};
      if (isCategoryFilterActive(fd.statusFilter)) obj.sf.s  = fd.statusFilter.selectedStatuses;
      if (fd.statusFilter.rangeMin !== null)        obj.sf.min = fd.statusFilter.rangeMin;
      if (fd.statusFilter.rangeMax !== null)        obj.sf.max = fd.statusFilter.rangeMax;
    }

    return obj;
  },

  /**
   * Deserialization: backward-compatible.
   *   Old `sf.inc: false` → silently ignored (includeNumeric concept removed).
   *   Old `sf.s: []`      → now means "no filter" (breaking semantic change; intentional per Phase 5).
   *   Old plain array     → treated as region list with Any mode.
   */
  deserializeFromQuery(fd, val) {
    fd.selected  = Array.isArray(val) ? val : Array.isArray(val?.regions) ? val.regions : [];
    fd.matchMode = val?.mm || MATCH_MODES.ANY;

    if (val?.sf) {
      fd.statusFilter.selectedStatuses = ('s' in val.sf && Array.isArray(val.sf.s) && val.sf.s.length > 0)
        ? val.sf.s
        : [];
      fd.statusFilter.rangeMin = val.sf.min ?? null;
      fd.statusFilter.rangeMax = val.sf.max ?? null;
      // val.sf.inc deliberately not read — concept removed
    }
  },
};
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
 * ── Status filter state model ─────────────────────────────────────────────────
 * Numeric and categorical statuses are TWO INDEPENDENT dimensions. Each has its
 * own control; neither affects the other.
 *
 *   sf.includeNumeric       (boolean, default true)
 *     true  → numeric-status regions are included (optionally within rangeMin/Max)
 *     false → numeric-status regions are excluded entirely (range inputs hidden)
 *
 *   sf.selectedStatuses     (null | [] | [...])
 *     null  → no category filter; ALL categorical statuses pass
 *     []    → category filter active, empty; NO categorical status passes
 *     [...] → only the listed categorical statuses pass
 *
 *   sf.rangeMin / sf.rangeMax  (number | null)
 *     Only apply when includeNumeric=true. Both null = no range constraint.
 *
 * This two-dimensional model enables all four meaningful states in mixed-mode
 * maps (maps that have both numeric and category-status regions):
 *
 *   1. No filter                          → includeNumeric=true, selectedStatuses=null
 *   2. Only numeric regions               → includeNumeric=true, selectedStatuses=[]
 *   3. Only category regions              → includeNumeric=false, selectedStatuses=null
 *   4. Specific categories only           → includeNumeric=false, selectedStatuses=[...]
 *   5. Numeric within range + categories  → includeNumeric=true, range set, sel=[...]
 *   …etc.
 *
 * The old single-gate model (pre this change) conflated the two dimensions:
 * unchecking all categories in mixed mode incorrectly excluded numeric regions too.
 *
 * ── Stable placeholder bounds ─────────────────────────────────────────────────
 *   fd.globalStatusMin / fd.globalStatusMax track the numeric range of ALL
 *   statuses across ALL regions and ALL taxa, never scoped by selection and
 *   never cleared.  They power the "Min (X)" / "Max (X)" placeholder text.
 */

import m from "mithril";
import "./filterPluginMapregions.css";
import { Checklist } from "../Checklist.js";
import { parseLegendConfig, parseNumericStatus } from "../../components/MapregionsColorEngine.js";
import { buildCheckItems } from "./shared/DropdownCheckItem.js";
import { describeList } from "./shared/rangeFilterUtils.js";

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true when the given status value passes the status-filter.
 * Pure function — no side-effects.
 *
 * Numeric and categorical statuses are evaluated independently:
 *   - Numeric:     passes when sf.includeNumeric is true AND (no range OR within range)
 *   - Categorical: passes when sf.selectedStatuses is null (no filter) OR is included
 *                  in the explicit list. [] means nothing passes.
 */
function statusMatchesSF(status, sf) {
  const n         = parseNumericStatus(status);
  const isNumeric = n !== null;

  if (isNumeric) {
    // ── Numeric dimension ────────────────────────────────────────────
    if (!sf.includeNumeric) return false;
    const hasRange = sf.rangeMin !== null || sf.rangeMax !== null;
    if (!hasRange) return true;
    return (sf.rangeMin === null || n >= sf.rangeMin) &&
           (sf.rangeMax === null || n <= sf.rangeMax);
  } else {
    // ── Categorical dimension ────────────────────────────────────────
    if (sf.selectedStatuses === null) return true;     // no cat filter
    return sf.selectedStatuses.includes(status);       // [] → always false
  }
}

/**
 * The filter is active whenever any control deviates from its default:
 *   numeric: includeNumeric=false OR rangeMin/Max set
 *   category: selectedStatuses !== null
 */
function isStatusFilterActive(sf) {
  return !!sf && (
    sf.includeNumeric === false ||
    sf.rangeMin       != null  ||
    sf.rangeMax       != null  ||
    sf.selectedStatuses !== null
  );
}

function isRangeFilterActive(sf) {
  return !!sf && (sf.rangeMin != null || sf.rangeMax != null);
}

function isCategoryFilterActive(sf) {
  return !!sf && sf.selectedStatuses !== null;
}

/**
 * Builds the short text used in the status-filter crumb.
 * Combines all active sub-filters into a semicolon-separated summary.
 */
function statusFilterTitle(sf) {
  const parts = [];

  if (sf.includeNumeric === false) {
    parts.push(t("sf_no_numeric"));
  } else if (isRangeFilterActive(sf)) {
    const rangeParts = [];
    if (sf.rangeMin != null) rangeParts.push(sf.rangeMin.toLocaleString());
    rangeParts.push("\u2013");
    if (sf.rangeMax != null) rangeParts.push(sf.rangeMax.toLocaleString());
    parts.push(rangeParts.join(""));
  }

  if (sf.selectedStatuses !== null) {
    parts.push(
      sf.selectedStatuses.length > 0
        ? sf.selectedStatuses.join(", ")
        : t("sf_no_categories")
    );
  }

  return parts.join("; ");
}

// ── Status filter section renderers (module-private) ─────────────────────────

/**
 * Numeric section: "include numeric" toggle + optional min/max range row.
 *
 * The "include numeric" checkbox is only shown in mixed mode (when the legend
 * also defines category rows), because in a pure-numeric map there is no
 * alternative dimension to switch to — the checkbox would be meaningless.
 *
 * When includeNumeric is false, the range inputs are hidden; they have no
 * effect and showing them would be confusing.
 *
 * @param {object}      sf          – statusFilter object (mutable)
 * @param {number|null} globalMin   – fd.globalStatusMin (never scoped/cleared)
 * @param {number|null} globalMax   – fd.globalStatusMax (never scoped/cleared)
 * @param {boolean}     isMixedMode – true when legend has both numeric and category rows
 */
function _renderStatusRangeSection(sf, globalMin, globalMax, isMixedMode) {
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
    // "Include numeric values" toggle — only meaningful in mixed mode.
    isMixedMode
      ? m("label.sf-include-numeric-label", [
          m("input.sf-include-numeric-check[type=checkbox]", {
            checked: sf.includeNumeric,
            onchange(e) {
              sf.includeNumeric = e.target.checked;
              // Unchecking also clears any range that was set, since range
              // inputs will be hidden and the user can no longer edit them.
              if (!sf.includeNumeric) {
                sf.rangeMin = null;
                sf.rangeMax = null;
              }
              Checklist.filter.commit();
            },
          }),
          t("sf_include_numeric"),
        ])
      : null,

    // Range inputs — only relevant and shown when numeric is included.
    sf.includeNumeric
      ? m(".sf-range-row", [
          m("input.sf-range-input[type=number]", {
            value:       sf.rangeMin ?? "",
            placeholder: fromPlaceholder,
            oninput(e) { setRange("rangeMin", e.target.value); },
          }),
          m("span.sf-range-sep", "\u2013"),
          m("input.sf-range-input[type=number]", {
            value:       sf.rangeMax ?? "",
            placeholder: toPlaceholder,
            oninput(e) { setRange("rangeMax", e.target.value); },
          }),
          // Trash clears only rangeMin/Max; does not touch includeNumeric.
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
        ])
      : null,
  ]);
}

/**
 * Category checklist.
 *
 * Shows ALL category rows defined in the legend (even currently-impossible ones,
 * rendered grayed/inactive), mirroring the region list treatment of impossible items.
 *
 * ── Toggle model ──────────────────────────────────────────────────────────────
 * selectedStatuses: null → no filter (all categories pass)
 * selectedStatuses: []   → filter active, empty (no category passes)
 * selectedStatuses: [...] → only listed categories pass
 *
 * Click semantics:
 *   null  → activate filter, store all possible rows EXCEPT the clicked one
 *   [...] → normal toggle. When selection grows back to all possible rows → null
 *
 * The user can reach [] by unchecking every item one by one. In mixed mode
 * with includeNumeric=true, this correctly shows only taxa with numeric regions.
 *
 * Trash button (shown when filter is active) resets to null.
 */
function _renderStatusCategorySection(allCatRows, sf, possibleSt) {
  const possibleRows = allCatRows.filter(r =>
    Object.prototype.hasOwnProperty.call(possibleSt, r.status)
  );
  const noFilter = sf.selectedStatuses === null;

  function toggleStatus(status) {
    if (noFilter) {
      sf.selectedStatuses = possibleRows
        .filter(r => r.status !== status)
        .map(r => r.status);
    } else {
      const idx = sf.selectedStatuses.indexOf(status);
      if (idx > -1) {
        sf.selectedStatuses.splice(idx, 1);
        // When the explicit selection covers all possible rows again, collapse
        // to null (semantically: "all pass" = "no filter").
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
    // Trash resets to null = "no category filter"; does not touch includeNumeric/range.
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
      const sf         = filterDef.statusFilter || { selectedStatuses: null, rangeMin: null, rangeMax: null, includeNumeric: true };
      const lc         = parseLegendConfig(Checklist.getMapRegionsLegendRows(), dataPath);
      const possibleSt = filterDef.possibleStatuses || {};

      const {
        selected: selectedItems, showSelected,
        possible: possibleItems, showPossible,
        impossible: impossibleItems, showImpossible,
        itemsOverflowing, filteredPossible, totalPossibleUnchecked,
      } = buildCheckItems({ type, dataPath, filter, itemsOverflowLimit });

      const hasNumericMode = lc.numericMode !== null;
      const allCatRows     = lc.categoryRows;
      // Mixed mode: legend defines both numeric and category representations.
      // The "include numeric" checkbox is only meaningful here.
      const isMixedMode    = hasNumericMode && allCatRows.length > 0;
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
                ? _renderStatusRangeSection(
                    sf,
                    filterDef.globalStatusMin ?? null,
                    filterDef.globalStatusMax ?? null,
                    isMixedMode
                  )
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
      // Full reset of the status filter to all defaults.
      filterDef.statusFilter.selectedStatuses = null;
      filterDef.statusFilter.rangeMin         = null;
      filterDef.statusFilter.rangeMax         = null;
      filterDef.statusFilter.includeNumeric   = true;
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
      const sfParts = [];

      if (sf.inc === false) {
        sfParts.push(t("sf_no_numeric"));
      } else if (sf.min != null || sf.max != null) {
        sfParts.push(
          sf.min != null && sf.max != null
            ? `${sf.min}\u2013${sf.max}`
            : sf.min != null ? `\u2265${sf.min}` : `\u2264${sf.max}`
        );
      }

      if ('s' in sf) {
        sfParts.push(
          sf.s?.length > 0 ? sf.s.join(", ") : t("sf_no_categories")
        );
      }

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

  // ── Lifecycle ─────────────────────────────────────────────────────

  createFilterDef() {
    return {
      type:             "mapregions",
      all:              [],
      possible:         {},
      selected:         [],
      numeric:          null,
      statusFilter: {
        selectedStatuses: null,   // null | [] | [...] — see file header
        rangeMin:         null,
        rangeMax:         null,
        includeNumeric:   true,   // whether numeric-status regions participate
      },
      possibleStatuses: {},
      globalStatusMin:  null,   // never scoped, never cleared
      globalStatusMax:  null,
    };
  },

  clearFilter(fd) {
    fd.selected     = [];
    fd.statusFilter = {
      selectedStatuses: null,
      rangeMin:         null,
      rangeMax:         null,
      includeNumeric:   true,
    };
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
   *
   * fd.possibleStatuses:
   *   Counts how many TAXA have at least one region with each status.
   *   A Set ensures each status is counted once per taxon call, so numbers
   *   are comparable to the region list counts and to total-taxa counts.
   *
   * fd.globalStatusMin / fd.globalStatusMax:
   *   Widened from every numeric status unconditionally so placeholder text
   *   never collapses when the user narrows selections.
   */
  accumulatePossible(fd, rawValue, _leafValues) {
    if (!rawValue || typeof rawValue !== "object") return;

    const sf       = fd.statusFilter;
    const sfActive = isStatusFilterActive(sf);

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
      const inScope = fd.selected.length === 0
        || fd.selected.includes(name)
        || fd.selected.includes(code);
      if (inScope && status !== "") {
        statusesForThisTaxon.add(status);
      }
    });

    // One increment per status per taxon.
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
      // 's' key present (even as []) = category filter active; absent = null (no filter).
      if (fd.statusFilter.selectedStatuses !== null) {
        obj.sf.s = fd.statusFilter.selectedStatuses;
      }
      if (fd.statusFilter.rangeMin !== null) obj.sf.min = fd.statusFilter.rangeMin;
      if (fd.statusFilter.rangeMax !== null) obj.sf.max = fd.statusFilter.rangeMax;
      // 'inc' key only serialized when false (default true is implied by absence).
      if (fd.statusFilter.includeNumeric === false) obj.sf.inc = false;
    }
    return obj;
  },

  deserializeFromQuery(fd, val) {
    fd.selected = Array.isArray(val) ? val : Array.isArray(val?.regions) ? val.regions : [];
    if (val?.sf) {
      // selectedStatuses: presence of 's' key (even []) = active; absence = null.
      fd.statusFilter.selectedStatuses = ('s' in val.sf)
        ? (Array.isArray(val.sf.s) ? val.sf.s : null)
        : null;
      fd.statusFilter.rangeMin       = val.sf.min  ?? null;
      fd.statusFilter.rangeMax       = val.sf.max  ?? null;
      // inc absent = true (default); inc: false = explicitly excluded.
      fd.statusFilter.includeNumeric = val.sf.inc  !== false;
    }
  },
};
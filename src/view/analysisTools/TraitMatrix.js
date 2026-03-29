import m from "mithril";
import dayjs from "dayjs";

import { Settings } from "../../model/Settings.js";
import {
  sortByCustomOrder,
  filterTerminalLeavesForMode,
} from "../../components/Utils.js";
import { Checklist } from "../../model/Checklist.js";

export const config = {
  id: "tool_trait_matrix",
  label: "Trait Matrix",
  iconPath: {
    light: "./img/ui/menu/view_category_density-light.svg",
    dark: "./img/ui/menu/view_category_density.svg",
  },
  info: "Evaluate the breakdown of your data by chosen traits and apply filters to focus the comparison on specific records",
  getTaxaAlongsideSpecimens: false,

  render: ({ filteredTaxa }) => categoryChart(filteredTaxa),
};

// ------------------------------------------------------
// CONFIGURATION & INITIAL SETTINGS
// ------------------------------------------------------

const displayStyles = [
  {
    name: t("view_cat_percentages_name"),
    method: "percentages",
    info: t("view_cat_percentages_info"),
  },
  {
    name: t("view_cat_counts_name"),
    method: "counts",
    info: t("view_cat_counts_info"),
  },
];

const sumMethods = [
  { method: "taxon",    name: t("view_cat_sum_by_taxon"),    info: t("view_cat_sum_by_taxon_info") },
  { method: "category", name: t("view_cat_sum_by_category"), info: t("view_cat_sum_by_category_info") },
];

// Date binning options — "month" groups across all years (Jan–Dec),
// "year" groups by calendar year.
const dateBinModes = [
  { method: "month", name: t("view_cat_date_bin_month") },
  { method: "year",  name: t("view_cat_date_bin_year")  },
];

let categoryToView = Settings.categoryChartCategory();
let categoryRoot = Settings.categoryChartRoot();
let display = Settings.categoryChartDisplayMode();
let dateBinning = Settings.categoryChartDateBinning();
let sumMethod = Settings.categoryChartSumMethod();
let showEmptyColumns = Settings.categoryChartShowEmptyColumns();

// Cell-verb state:
//   currentHoverVerb — transient, set on mouseenter, cleared on mouseleave
//   currentCellVerb  — pinned by click (persists after mouse moves away; useful on mobile)
let currentHoverVerb = null;
let currentCellVerb = t("view_cat_click_on_cell");

// Fallbacks if settings are invalid
if (!displayStyles.find((ds) => ds.method === display)) {
  display = displayStyles[0].method;
  Settings.categoryChartDisplayMode(display);
}

// Sort state — null means default (taxonomy / insertion order)
let sortColumn = null;
let sortDirection = "desc"; // "asc" | "desc"

// Sentinel key used to sort by the first (taxon-name) column
const SORT_KEY_TAXON = "__taxon__";

// ------------------------------------------------------
// HELPER FUNCTIONS
// ------------------------------------------------------

/**
 * Compute an inline style string for a heatmap data cell.
 * Single-hue progression: white → nlblue.
 * Text color flips to white when the background is dark enough.
 */
function heatmapStyle(ratio) {
  if (!ratio || ratio <= 0) return "cursor: pointer;";
  // Map ratio 0→1 to opacity 0.08→0.82
  const opacity = Math.min(0.08 + ratio * 0.74, 0.82);
  const textColor = opacity > 0.44 ? "#ffffff" : "#2a3a4a";
  const fontWeight = opacity > 0.44 ? "600" : "400";
  return (
    `background-color: rgba(85,118,155,${opacity.toFixed(2)});` +
    `color: ${textColor};` +
    `font-weight: ${fontWeight};` +
    `cursor: pointer;`
  );
}

/**
 * Cycle sort: null→desc→asc→null.
 * Clicking a third time restores natural order.
 */
function toggleSort(cKey) {
  if (sortColumn !== cKey) {
    sortColumn = cKey;
    sortDirection = "desc";
  } else if (sortDirection === "desc") {
    sortDirection = "asc";
  } else {
    sortColumn = null;
    sortDirection = "desc";
  }
}

/**
 * Build the full ancestor path from root down to currentRoot.
 * Returns e.g. ["Animalia", "Chordata", "Mammalia"] (ancestor-first, current-last).
 */
function buildBreadcrumbPath(currentRoot, filteredTaxa) {
  const path = [];
  let cursor = currentRoot;
  while (cursor !== "") {
    path.unshift(cursor);
    cursor = parentOf(cursor, filteredTaxa);
  }
  return path;
}

/**
 * Generate a descriptive string for the category header.
 */
const categoryVerb = (catView, sumMethodOption) => {
  const meta = Checklist.getMetaForDataPath(catView);
  if (!meta) return "";
  let verb = "";
  // Use the sum method to decide verbal phrasing:
  // - 'taxon'    → percentages normalised per row ("X% of [taxon] have [trait]")
  // - 'category' → percentages normalised per column ("X% of [trait] come from [taxon]")
  switch (sumMethodOption) {
    case "taxon":
      verb = tf("view_cat_category_verb_taxon", [
        displayStyles.find((ds) => ds.method === display).info,
        meta.searchCategory,
      ]);
      break;
    case "category":
      verb = tf("view_cat_category_verb_category", [meta.searchCategory]);
      break;
    default:
      break;
  }
  return verb;
};

/**
 * Generate the descriptive sentence shown in the cell-verb bar.
 */
const cellVerb = (percentage, cKey, taxonKey, matchingCount, sumMethodOption) => {
  let verb = "";
  // Decide wording based on the sum method
  switch (sumMethodOption) {
    case "taxon":
      verb = tf("view_cat_cell_verb_taxon", [
        percentage,
        matchingCount,
        taxonKey,
        cKey,
      ]);
      break;
    case "category":
      verb = tf("view_cat_cell_verb_category", [
        percentage,
        matchingCount,
        cKey,
        taxonKey,
      ]);
      break;
    default:
      break;
  }

  if (!Checklist.filter.isEmpty()) {
    verb =
      verb +
      " " +
      tf(
        "view_cat_cell_verb_category_filtered",
        [
          Settings.pinnedSearches.getHumanNameForSearch(
            JSON.parse(Checklist.queryKey())
          ),
        ],
        true
      );
  }

  return m.trust(verb);
};

/**
 * Return either the percentage or count string depending on display mode.
 */
const numericDisplay = (number, percentage) => {
  switch (display) {
    case "percentages":
      return percentage;
    case "counts":
      return number;
    default:
      console.error("Unknown view mode", display);
      return number;
  }
};

/**
 * Walk up the taxonomy to find the parent of a given taxon name.
 */
function parentOf(taxon, filteredTaxa) {
  const foundTaxon = filteredTaxa.find((tx) =>
    tx.t.find((tn) => tn && tn.name === taxon)
  );
  if (foundTaxon) {
    const tIndex = foundTaxon.t.findIndex((t) => t && t.name === taxon);
    if (tIndex === 0) return "";
    return foundTaxon.t[tIndex - 1].name;
  }
  return "";
}

/**
 * Convert a ratio to a percent string; values < 1% display as "< 1%".
 */
function toPctString(ratio) {
  const pct = ratio * 100.0;
  if (pct < 1 && pct > 0) return "< 1%";
  return pct.toFixed(0) + "%";
}

// ------------------------------------------------------
// DATE BINNING HELPERS
// ------------------------------------------------------

/**
 * Convert a Unix timestamp to a bin label.
 * - "month": returns the localized month name (Jan–Dec), regardless of year
 * - "year":  returns the four-digit year as a string
 */
function unixTimestampToBin(timestamp, binMethod) {
  const d = dayjs(timestamp);
  if (!d.isValid()) return null;
  return binMethod === "year"
    ? String(d.year())
    : t("months." + Settings.MONTH_KEYS[d.month()]);
}

/**
 * Derive an ordered, deduplicated array of bin labels from a set of
 * Unix timestamps. Months are returned Jan→Dec (0–11); years ascending.
 */
function buildDateBins(allTimestamps, binMethod) {
  const seen = new Set();
  const indexed = [];
  (allTimestamps ?? []).forEach((timestamp) => {
    const d = dayjs(timestamp);
    if (!d.isValid()) return;
    const sortKey = binMethod === "year" ? d.year() : d.month();
    if (!seen.has(sortKey)) {
      seen.add(sortKey);
      indexed.push({ sortKey, label: unixTimestampToBin(timestamp, binMethod) });
    }
  });
  indexed.sort((a, b) => a.sortKey - b.sortKey);
  return indexed.map((x) => x.label);
}

// ------------------------------------------------------
// DATA COMPUTATION
// ------------------------------------------------------

/**
 * Build the cross-tabulation data for the chart.
 *
 * @param {string} rootTaxon
 * @param {Array}  taxa
 * @param {string} dataCategory
 * @param {string} mode          "taxa" | "specimen"
 * @param {Array}  allTaxa
 * @param {string} binMethod     "month" | "year" — only used when categoryType === "date"
 */
function dataForCategoryChart(rootTaxon, taxa, dataCategory, mode, allTaxa, binMethod) {
  const individualResults = {};
  const allCategories = {};

  if (!Object.keys(Checklist.filter.data).includes(dataCategory)) {
    return null;
  }

  const categoryType = Checklist.filter.data[dataCategory].type;

  // Initialise allCategories (determines which columns will appear).
  // For date fields we derive pre-sorted bin labels instead of using raw values.
  if (categoryType === "date") {
    const orderedBinLabels = buildDateBins(
      Checklist.filter.data[dataCategory]?.all,
      binMethod
    );
    orderedBinLabels.forEach((bin) => {
      allCategories[bin] = { color: "", sum: 0 };
    });
  } else if (categoryType === "months") {
    // Extract numerical month values, sort chronologically, and map to i18n
    const rawMonths = Checklist.filter.data[dataCategory]?.all || [];
    const sortedMonths = [...rawMonths]
      .map((m) => parseInt(m, 10))
      .filter((m) => !isNaN(m))
      .sort((a, b) => a - b);

    sortedMonths.forEach((mVal) => {
      const label = t("months." + Settings.MONTH_KEYS[mVal - 1]);
      allCategories[label] = { color: "", sum: 0 };
    });
  } else {
    Checklist.filter.data[dataCategory]?.all.forEach((i) => {
      allCategories[i] = { color: "", sum: 0 };
    });
  }

  if (Object.keys(allCategories).length === 0) return null;

  taxa.forEach((taxon) => {
    const currentRootIndex = taxon.t.findIndex((x) => x && x.name === rootTaxon);
    if (currentRootIndex < 0 && rootTaxon !== "") return;
    const child = taxon.t[currentRootIndex + 1]?.name;
    if (child !== undefined) {
      if (!individualResults.hasOwnProperty(child)) {
        individualResults[child] = { categories: {}, sum: 0, children: 0 };
      }
      let categoryData = [];

      switch (categoryType) {
        case "text":
          categoryData = Checklist.getDataFromDataPath(
            mode === "specimen"
              ? Checklist.getEffectiveDataForNode(taxon, Checklist.getSpecimenMetaIndex(), allTaxa)
              : taxon.d,
            dataCategory
          );
          if (!Array.isArray(categoryData)) categoryData = [categoryData];
          break;
        case "badge":
          categoryData = Checklist.getDataFromDataPath(
            mode === "specimen"
              ? Checklist.getEffectiveDataForNode(taxon, Checklist.getSpecimenMetaIndex(), allTaxa)
              : taxon.d,
            dataCategory
          );
          if (!Array.isArray(categoryData)) categoryData = [categoryData];
          break;
        case "date": {
          const raw = Checklist.getDataFromDataPath(
            mode === "specimen"
              ? Checklist.getEffectiveDataForNode(taxon, Checklist.getSpecimenMetaIndex(), allTaxa)
              : taxon.d,
            dataCategory
          );
          const rawArr = Array.isArray(raw) ? raw : [raw];
          categoryData = rawArr
            .filter((v) => typeof v === "number" && !isNaN(v))
            .map((v) => unixTimestampToBin(v, binMethod));
          break;
        }
        case "months": {
          const raw = Checklist.getDataFromDataPath(
            mode === "specimen" 
                ? Checklist.getEffectiveDataForNode(taxon, Checklist.getSpecimenMetaIndex(), allTaxa) 
                : taxon.d,
            dataCategory
          );
          const asArray = Array.isArray(raw) ? raw : [raw];
          categoryData = asArray
            .map((mVal) => {
              const num = parseInt(mVal, 10);
              if (!isNaN(num) && num >= 1 && num <= 12) {
                return t("months." + Settings.MONTH_KEYS[num - 1]);
              }
              return null;
            })
            .filter(Boolean);
          break;
        }
        case "map regions": {
          const tempCategoryData = Checklist.getDataFromDataPath(taxon.d, dataCategory);
          let regionCodes = [];
          if (typeof tempCategoryData === "object" && tempCategoryData) {
            regionCodes = Object.keys(tempCategoryData);
          }
          categoryData = regionCodes.map((r) => Checklist.nameForMapRegion(r));
          break;
        }
        default:
          break;
      }

      if (currentRootIndex < taxon.t.length - 2) {
        individualResults[child].children++;
      }

      categoryData = [...new Set(categoryData)];

      categoryData.forEach((cd) => {
        if (!cd || cd === "" || cd === "null") cd = "[unknown]";

        if (!allCategories.hasOwnProperty(cd)) {
          allCategories[cd] = { color: "", sum: 0 };
        }
        if (!individualResults[child].categories.hasOwnProperty(cd)) {
          individualResults[child].categories[cd] = 0;
        }
        individualResults[child].categories[cd]++;
        allCategories[cd].sum++;
      });
      individualResults[child].sum++;
    }
  });

  if (Object.keys(allCategories).length === 0) return null;

  // For date fields: carry the pre-sorted bin order so the render can use it
  // directly, bypassing sortByCustomOrder (which would alphabetise months).
  const orderedBins = categoryType === "date"
    ? Object.keys(allCategories)
    : null;

  return { individualResults, sumByCategory: allCategories, orderedBins: (categoryType === "date" || categoryType === "months") ? Object.keys(allCategories) : null };
}

// ------------------------------------------------------
// MAIN FUNCTION
// ------------------------------------------------------

function categoryChart(filteredTaxa) {
  const result = [];

  const chartMode = Settings.analyticalIntent() === "#S" ? "specimen" : "taxa";
  const specimenMetaIndex = Checklist.getSpecimenMetaIndex();

  const allTaxaForInheritance = chartMode === "specimen"
    ? Checklist.getEntireChecklist()
    : filteredTaxa;

  filteredTaxa = filterTerminalLeavesForMode(filteredTaxa, chartMode, specimenMetaIndex);

  let categorizedData = dataForCategoryChart(
    categoryRoot, filteredTaxa, categoryToView, chartMode, allTaxaForInheritance, dateBinning
  );

  if (categorizedData == null) {
    categoryRoot = "";
    Settings.categoryChartRoot("");
    categoryToView = "";
    Settings.categoryChartCategory("");
    categorizedData = dataForCategoryChart(
      categoryRoot, filteredTaxa, categoryToView, chartMode, allTaxaForInheritance, dateBinning
    );
  }

  const filtersToDisplay = Object.keys(Checklist.filter.data).filter(
    (f) =>
    ((Checklist.filter.data[f].type === "text" ||
      Checklist.filter.data[f].type === "date" ||
      Checklist.filter.data[f].type === "months" ||
      Checklist.filter.data[f].type === "badge")
    )
  );

  // Convenience: is the currently selected category a date field?
  const isDateCategory = categoryToView !== "" &&
    Checklist.filter.data[categoryToView]?.type === "date";

  // ------------------------------------------------------
  // RENDER CONTROL PANEL
  // ------------------------------------------------------
  result.push(

    m(".chart-controls-card", [
      m(".chart-control-group.chart-control-group-full", [
        m("label", t("view_cat_category_to_analyze")),
        m("select.chart-select", {
          value: categoryToView,
          onchange: (e) => {
            categoryToView = e.target.value;
            Settings.categoryChartCategory(categoryToView);
            // Reset sort when columns change entirely
            sortColumn = null;
            sortDirection = "desc";
          }
        }, [
          m("option", { value: "", disabled: true }, "— " + t("view_cat_category_to_analyze") + " —"),
          ...filtersToDisplay.map((f) => {
            const title = Checklist.getMetaForDataPath(f).searchCategory;
            return m("option", { value: f }, title);
          })
        ])
      ]),

      // "Group by" control — only shown for date-type categories
      isDateCategory ? m(".chart-control-group", [
        m("label", t("view_cat_date_group_by")),
        m(".chart-segmented-control", dateBinModes.map((bm) =>
          m("button" + (bm.method === dateBinning ? ".selected" : ""), {
            onclick: () => {
              if (bm.method === dateBinning) return false;
              dateBinning = bm.method;
              Settings.categoryChartDateBinning(dateBinning);
              sortColumn = null;
              sortDirection = "desc";
            }
          }, bm.name)
        ))
      ]) : null,

      categoryToView === "" ? null : m(".chart-control-group", [
        m("label", t("view_cat_sum_method")),
        m(".chart-segmented-control", sumMethods.map((mt) =>
          m("button" + (mt.method === sumMethod ? ".selected" : ""), {
            title: mt.info,
            onclick: () => {
              if (mt.method === sumMethod) return false;
              sumMethod = mt.method;
              Settings.categoryChartSumMethod(sumMethod);
            }
          }, mt.name)
        ))
      ]),

      categoryToView === "" ? null : m(".chart-control-group", [
        m("label", t("view_cat_display")),
        m(".chart-segmented-control", displayStyles.map((ds) =>
          m("button" + (ds.method === display ? ".selected" : ""), {
            title: ds.info,
            onclick: () => {
              if (ds.method === display) return false;
              display = ds.method;
              Settings.categoryChartDisplayMode(display);
            }
          }, ds.name)
        ))
      ]),

      categoryToView === "" ? null : m(".chart-control-group", [
        m("label", {
          style: "display:flex;align-items:center;gap:0.5em;cursor:pointer;font-size:0.9em;font-weight:normal;user-select:none;"
        }, [
          m("input[type=checkbox]", {
            style: "width:1.1em;height:1.1em;cursor:pointer;accent-color:var(--nlblue,#55769b);flex-shrink:0;",
            checked: showEmptyColumns,
            onchange: (e) => {
              showEmptyColumns = e.target.checked;
              Settings.categoryChartShowEmptyColumns(showEmptyColumns);
              // If the currently sorted column is about to be hidden, clear the sort
              if (!showEmptyColumns && sortColumn !== null && sortColumn !== SORT_KEY_TAXON) {
                sortColumn = null;
                sortDirection = "desc";
              }
            }
          }),
          t("view_cat_show_empty_columns"),
        ])
      ]),

    ]),

    categoryToView === "" || !categorizedData || Object.keys(categorizedData.individualResults).length === 0
      ? null
      : m(".chart-info-box", [
        m(".chart-info-item", m.trust(
          Checklist.filter.isEmpty()
            ? t(chartMode === "taxa" ? "view_cat_counted_all" : "view_cat_counted_all_specimens", [categoryVerb(categoryToView, sumMethod)])
            : tf("view_cat_counted_filter", [
              categoryVerb(categoryToView, sumMethod),
              Settings.pinnedSearches.getHumanNameForSearch()
            ])
        )),
        Checklist.hasSpecimens() ? m(".chart-info-item",
          chartMode === "taxa" ? t("view_chart_mode_taxa_info") : t("view_chart_mode_specimen_info")
        ) : null
      ])
  )

  // ------------------------------------------------------
  // RENDER CATEGORY CHART TABLE
  // ------------------------------------------------------
  if (categoryToView !== "" && categorizedData != null) {
    if (Object.keys(categorizedData.individualResults).length === 0) {
      return result;
    }

    // For date fields, respect the pre-sorted bin order from dataForCategoryChart
    // so that months appear Jan→Dec (not alphabetically) and years appear ascending.
    // For all other types, delegate to the existing custom-order logic.
    const orderedCategories = categorizedData.orderedBins
      ?? sortByCustomOrder(
        Object.keys(categorizedData.sumByCategory),
        "data",
        categoryToView
      );

    // Apply the "hide empty columns" filter. A column is empty when no taxa
    // in the current view carry that trait value (sumByCategory[cKey].sum === 0).
    const visibleCategories = showEmptyColumns
      ? orderedCategories
      : orderedCategories.filter(cKey => categorizedData.sumByCategory[cKey].sum > 0);

    // If every column was filtered out, show a notice instead of an empty table.
    if (visibleCategories.length === 0) {
      result.push(
        m(".chart-info-box", [
          m(".chart-info-item", t("view_cat_no_visible_columns")),
        ])
      );
      return m(".category-chart-outer-wrapper", result);
    }

    // If a previously-sorted column is now hidden, clear the sort
    if (sortColumn !== null && sortColumn !== SORT_KEY_TAXON && !visibleCategories.includes(sortColumn)) {
      sortColumn = null;
      sortDirection = "desc";
    }

    // ── Breadcrumb path ────────────────────────────────────────────────────
    const breadcrumbPath = categoryRoot !== ""
      ? buildBreadcrumbPath(categoryRoot, filteredTaxa)
      : [];

    // ── Helper: compute ratio for one taxon / category cell ───────────────
    const getRatio = (taxon, cKey) => {
      if (!Object.keys(taxon.categories).includes(cKey)) return 0;
      const basis = sumMethod === "category"
        ? categorizedData.sumByCategory[cKey].sum   // column-normalised: adds to 100% per trait
        : taxon.sum;                                // row-normalised:    adds to 100% per taxon
      return taxon.categories[cKey] / basis;
    };

    // ── Sort row keys ──────────────────────────────────────────────────────
    let rowKeys = Object.keys(categorizedData.individualResults);
    if (sortColumn !== null) {
      rowKeys = [...rowKeys].sort((a, b) => {
        let rA, rB;
        if (sortColumn === SORT_KEY_TAXON) {
          // Sort by each taxon's total count (taxon.sum)
          rA = categorizedData.individualResults[a].sum;
          rB = categorizedData.individualResults[b].sum;
        } else {
          rA = getRatio(categorizedData.individualResults[a], sortColumn);
          rB = getRatio(categorizedData.individualResults[b], sortColumn);
        }
        return sortDirection === "desc" ? rB - rA : rA - rB;
      });
    }

    // ── Sort icon helper ──────────────────────────────────────────────────
    const sortIconFor = (cKey) => {
      const isActive = sortColumn === cKey;
      return m(
        "span.category-sort-icon" + (isActive ? "" : ".inactive"),
        isActive
          ? (sortDirection === "desc" ? "▼" : "▲")
          : "⇅"
      );
    };

    // ── Column header cells ───────────────────────────────────────────────
    const headerCells = [
      // Corner cell: first-column header — same style as data col headers,
      // sticky on both axes. Sortable by taxon.sum; shows row count badge.
      m(
        "th.sticky-row.sticky-column.category-col-header.category-corner-header"
        + (sortColumn === SORT_KEY_TAXON
          ? (sortDirection === "desc" ? ".col-sorted-desc" : ".col-sorted-asc")
          : ""),
        {
          style: "z-index: 200;",
          onclick: () => toggleSort(SORT_KEY_TAXON),
        },
        m(".category-header-inner", [
          m(".category-header-inner-content",
            [
              m("span.category-header-label", t("view_cat_taxon_col_header", ["s"])),
              // Row-count badge: how many groups are currently displayed
              m("span.category-header-row-count", rowKeys.length),
            ]
          ),
          sortIconFor(SORT_KEY_TAXON),
        ])
      ),

      // Data column headers
      ...visibleCategories.map((cKey) =>
        m(
          "th.sticky-row.category-col-header"
          + (sortColumn === cKey
            ? (sortDirection === "desc" ? ".col-sorted-desc" : ".col-sorted-asc")
            : ""),
          {
            title: cKey + " — click to sort",
            onclick: () => toggleSort(cKey),
          },
          m(".category-header-inner", [
            m("span.category-header-label", cKey),
            sortIconFor(cKey),
          ])
        )
      ),
    ];

    // ── Build data rows ───────────────────────────────────────────────────
    const rows = rowKeys.map((taxonKey) => {
      const taxon = categorizedData.individualResults[taxonKey];
      const isDrillable = taxon.children > 0;

      // Left cell: taxon chip
      const leftCell = m(
        "td.sticky-column.category-taxon-cell",
        {
          onclick: isDrillable
            ? () => {
              categoryRoot = taxonKey;
              Settings.categoryChartRoot(taxonKey);
              sortColumn = null; // reset sort on drill-down
            }
            : undefined,
        },
        m(".category-taxon-chip" + (isDrillable ? ".drillable" : ".leaf"), [
          m("span", taxonKey),
          isDrillable ? m("span.category-taxon-count", taxon.children) : null,
        ])
      );

      // Data cells
      const dataCells = visibleCategories.map((cKey) => {
        if (Object.keys(taxon.categories).includes(cKey)) {
          const ratio = getRatio(taxon, cKey);
          const verbContent = cellVerb(
            toPctString(ratio),
            cKey,
            taxonKey,
            taxon.categories[cKey],
            sumMethod
          );
          return m(
            "td.category-cell-filled",
            {
              style: heatmapStyle(ratio),
              // Click: pin the verb so it persists after mouse moves away (mobile)
              onclick: () => { currentCellVerb = verbContent; },
            },
            m("span", numericDisplay(taxon.categories[cKey], toPctString(ratio)))
          );
        } else {
          // Empty cell: show centered long dash
          return m("td.category-cell-empty", "—");
        }
      });

      return m("tr", [leftCell, ...dataCells]);
    });

    // ── Determine what to show in the cell-verb bar ───────────────────────
    const isDefaultVerb = currentCellVerb === t("view_cat_click_on_cell");
    const verbDisplay = isDefaultVerb
      ? m("span.cell-verb-prompt", currentCellVerb)
      : currentCellVerb;

    // ── Assemble the full table block ─────────────────────────────────────
    result.push(
      // Breadcrumb navigation — only shown when drilled in
      categoryRoot !== ""
        ? m(".category-nav-header", [
          m(
            "button.category-nav-up-btn",
            {
              onclick: () => {
                const parent = parentOf(categoryRoot, filteredTaxa);
                categoryRoot = parent;
                Settings.categoryChartRoot(parent);
                sortColumn = null;
              },
            },
            [m("img[src=img/ui/checklist/level_up.svg]"), "Up"]
          ),
          m(".category-nav-crumb", [
            m(
              "span.category-nav-crumb-step",
              {
                onclick: () => {
                  categoryRoot = "";
                  Settings.categoryChartRoot("");
                  sortColumn = null;
                }
              },
              t("view_cat_category_root")
            ),
            ...breadcrumbPath.map((step, i) => {
              const isCurrent = i === breadcrumbPath.length - 1;
              return [
                m("span.category-nav-crumb-sep", "▸"),
                isCurrent
                  ? m("span.category-nav-crumb-current", step)
                  : m(
                    "span.category-nav-crumb-step",
                    {
                      onclick: () => {
                        categoryRoot = step;
                        Settings.categoryChartRoot(step);
                        sortColumn = null;
                      }
                    },
                    step
                  ),
              ];
            }).flat(),
          ]),
        ])
        : null,

      m(".table-flex-container", [
        m(".table-wrapper", [

          // ── Cell-verb bar: ABOVE the table, updates on click ──────────
          m(".cell-verb", verbDisplay),

          // ── Scrollable table area ─────────────────────────────────────
          m(".table-scroll-area", [
            m("table.category-view", [
              m("tr.header-row", headerCells),
              ...rows,
            ]),
          ]),

        ]),
      ])
    );
  }

  return m(".category-chart-outer-wrapper", result);
}
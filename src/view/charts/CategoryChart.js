import m from "mithril";

import { Settings } from "../../model/Settings.js";
import {
  sortByCustomOrder,
  filterTerminalLeavesForMode,
} from "../../components/Utils.js";
import { Checklist } from "../../model/Checklist.js";

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

let categoryToView = Settings.categoryChartCategory();
let categoryRoot = Settings.categoryChartRoot();
let display = Settings.categoryChartDisplayMode();

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
const categoryVerb = (catView, chartModeOption) => {
  const meta = Checklist.getMetaForDataPath(catView);
  if (!meta) return "";
  let verb = "";
  // Use the global chart mode to decide verbal phrasing:
  // - 'taxa' -> use the "taxon" phrasing (counts/percentages of taxa)
  // - 'specimen' -> use the "category" phrasing (contribution of taxa to categories)
  switch (chartModeOption) {
    case "taxa":
      verb = tf("view_cat_category_verb_taxon", [
        displayStyles.find((ds) => ds.method === display).info,
        meta.searchCategory,
      ]);
      break;
    case "specimen":
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
const cellVerb = (percentage, cKey, taxonKey, matchingCount, chartModeOption) => {
  let verb = "";
  // Decide wording based on the global chart mode
  switch (chartModeOption) {
    case "taxa":
      verb = tf("view_cat_cell_verb_taxon", [
        percentage,
        matchingCount,
        taxonKey,
        cKey,
      ]);
      break;
    case "specimen":
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

/**
 * Build the cross-tabulation data for the chart.
 */
function dataForCategoryChart(rootTaxon, taxa, dataCategory, mode, allTaxa) {
  const individualResults = {};
  const allCategories = {};

  if (!Object.keys(Checklist.filter.data).includes(dataCategory)) {
    return null;
  }

  const categoryType = Checklist.filter.data[dataCategory].type;

  Checklist.filter.data[dataCategory]?.all.forEach((i) => {
    allCategories[i] = { color: "", sum: 0 };
  });
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
        case "map regions":
          const tempCategoryData = Checklist.getDataFromDataPath(taxon.d, dataCategory);
          let regionCodes = [];
          if (typeof tempCategoryData === "object" && tempCategoryData) {
            regionCodes = Object.keys(tempCategoryData);
          }
          categoryData = regionCodes.map((r) => Checklist.nameForMapRegion(r));
          break;
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
  return { individualResults, sumByCategory: allCategories };
}

// ------------------------------------------------------
// MAIN EXPORT FUNCTION
// ------------------------------------------------------

export function categoryChart(filteredTaxa) {
  const result = [];

  const chartMode = Settings.analyticalIntent() === "#S" ? "specimen" : "taxa";
  const specimenMetaIndex = Checklist.getSpecimenMetaIndex();

  const allTaxaForInheritance = chartMode === "specimen"
    ? Checklist.getEntireChecklist()
    : filteredTaxa;

  filteredTaxa = filterTerminalLeavesForMode(filteredTaxa, chartMode, specimenMetaIndex);

  let categorizedData = dataForCategoryChart(
    categoryRoot, filteredTaxa, categoryToView, chartMode, allTaxaForInheritance
  );

  if (categorizedData == null) {
    categoryRoot = "";
    Settings.categoryChartRoot("");
    categoryToView = "";
    Settings.categoryChartCategory("");
    categorizedData = dataForCategoryChart(
      categoryRoot, filteredTaxa, categoryToView, chartMode, allTaxaForInheritance
    );
  }

  const filtersToDisplay = Object.keys(Checklist.filter.data).filter(
    (f) =>
    ((Checklist.filter.data[f].type === "text" ||
      Checklist.filter.data[f].type === "badge") &&
      Checklist.filter.data[f].all.length < 40)
  );

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

    ]),

    categoryToView === "" || !categorizedData || Object.keys(categorizedData.individualResults).length === 0
      ? null
      : m(".chart-info-box", [
        m(".chart-info-item", m.trust(
          Checklist.filter.isEmpty()
            ? t(chartMode === "taxa" ? "view_cat_counted_all" : "view_cat_counted_all_specimens", [categoryVerb(categoryToView, chartMode)])
            : tf("view_cat_counted_filter", [
              categoryVerb(categoryToView, chartMode),
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

    const orderedCategories = sortByCustomOrder(
      Object.keys(categorizedData.sumByCategory),
      "data",
      categoryToView
    );

    // If a previously-sorted column no longer exists, clear sort
    if (sortColumn !== null && sortColumn !== SORT_KEY_TAXON && !orderedCategories.includes(sortColumn)) {
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
      const basis = chartMode === "specimen"
        ? categorizedData.sumByCategory[cKey].sum
        : taxon.sum;
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
      ...orderedCategories.map((cKey) =>
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
      const dataCells = orderedCategories.map((cKey) => {
        if (Object.keys(taxon.categories).includes(cKey)) {
          const ratio = getRatio(taxon, cKey);
          const verbContent = cellVerb(
            toPctString(ratio),
            cKey,
            taxonKey,
            taxon.categories[cKey],
            chartMode
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
              "Root"
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
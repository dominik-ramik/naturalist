import m from "mithril";
import dayjs from "dayjs";

import "./TraitMatrix.css";

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
    dark:  "./img/ui/menu/view_category_density.svg",
  },
  info: "Evaluate the breakdown of your data by chosen traits and apply filters to focus the comparison on specific records",
  getTaxaAlongsideSpecimens: false,
  render: ({ filteredTaxa }) => categoryChart(filteredTaxa),
};

// ─── Constants ────────────────────────────────────────────────────────────────

const displayStyles = [
  { name: t("view_cat_percentages_name"), method: "percentages", info: t("view_cat_percentages_info") },
  { name: t("view_cat_counts_name"),      method: "counts",      info: t("view_cat_counts_info") },
];

const sumMethods = [
  { method: "taxon",    name: t("view_cat_sum_by_taxon"),    info: t("view_cat_sum_by_taxon_info") },
  { method: "category", name: t("view_cat_sum_by_category"), info: t("view_cat_sum_by_category_info") },
];

const dateBinModes = [
  { method: "month", name: t("view_cat_date_bin_month") },
  { method: "year",  name: t("view_cat_date_bin_year")  },
];

const SORT_KEY_TAXON = "__taxon__";

// ─── State ────────────────────────────────────────────────────────────────────

let categoryToView   = Settings.categoryChartCategory();
let categoryRoot     = Settings.categoryChartRoot();
let display          = Settings.categoryChartDisplayMode();
let dateBinning      = Settings.categoryChartDateBinning();
let sumMethod        = Settings.categoryChartSumMethod();
let showEmptyColumns = Settings.categoryChartShowEmptyColumns();

const LS_SEC_MODE = "categoryChartSecondaryDimMode";
const LS_SEC_CAT  = "categoryChartSecondaryDimCategory";
const LS_SEC_BIN  = "categoryChartSecondaryDimDateBinning";

let secondaryDimMode        = localStorage.getItem(LS_SEC_MODE) || "taxa";
let secondaryDimCategory    = localStorage.getItem(LS_SEC_CAT)  || "";
let secondaryDimDateBinning = localStorage.getItem(LS_SEC_BIN)  || "month";

if (!displayStyles.find(ds => ds.method === display)) {
  display = displayStyles[0].method;
  Settings.categoryChartDisplayMode(display);
}

let sortColumn    = null;
let sortDirection = "desc";
let currentCellVerb = t("view_cat_click_on_cell");

// ─── Generic UI helpers ───────────────────────────────────────────────────────

const segBtn = (label, isSelected, onClick, title) =>
  m("button" + (isSelected ? ".selected" : ""), { onclick: onClick, title }, label);

function heatmapStyle(ratio) {
  if (!ratio || ratio <= 0) return "cursor: pointer;";
  const opacity    = Math.min(0.08 + ratio * 0.74, 0.82);
  const textColor  = opacity > 0.44 ? "#ffffff" : "#2a3a4a";
  const fontWeight = opacity > 0.44 ? "600" : "400";
  return (
    `background-color:rgba(85,118,155,${opacity.toFixed(2)});` +
    `color:${textColor};font-weight:${fontWeight};cursor:pointer;`
  );
}

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

function buildBreadcrumbPath(currentRoot, filteredTaxa) {
  const path = [];
  let cursor = currentRoot;
  while (cursor !== "") {
    path.unshift(cursor);
    cursor = parentOf(cursor, filteredTaxa);
  }
  return path;
}

function parentOf(taxon, filteredTaxa) {
  const found = filteredTaxa.find(tx => tx.t.find(tn => tn && tn.name === taxon));
  if (!found) return "";
  const idx = found.t.findIndex(t => t && t.name === taxon);
  return idx === 0 ? "" : found.t[idx - 1].name;
}

function toPctString(ratio) {
  const pct = ratio * 100.0;
  if (pct < 1 && pct > 0) return "< 1%";
  return pct.toFixed(0) + "%";
}

const numericDisplay = (number, percentage) =>
  display === "percentages" ? percentage : number;

// ─── Taxon-object normalisation ───────────────────────────────────────────────

/**
 * Columns with formatting="taxon" store structured objects { name, authority }
 * (or legacy { n, a }) in taxon.d.  When such a column also appears as a
 * "text" or "badge" filter, Checklist.getDataFromDataPath returns the object
 * rather than a plain string, which would produce "[object Object]" as a
 * row/column key.  This helper normalises any value to a plain name string.
 */
function normaliseLabelValue(v) {
  if (v == null) return null;
  if (typeof v === "object") {
    const name = v.name ?? v.n;
    return name != null ? String(name) : null;   // discard if no recognisable name field
  }
  return String(v);
}

// ─── Verb / info-box helpers ──────────────────────────────────────────────────

/**
 * verbCtx — rendering context passed to both verb helpers:
 *   chartMode    "taxa" | "specimen"
 *   isCustomMode  secondary dim is a trait (not taxa drill-down)
 *   colTraitName  human label for the column trait (trait to analyse)
 *   rowTraitName  human label for the row trait (custom secondary dim only)
 *
 * Build once per render frame and thread through.
 */

/**
 * One-line description of what the matrix measures.
 * Used in the info-box as the leading clause of the "counted through …" sentence.
 *
 * Row-normalised (sum by taxon):
 *   "Percentage of taxa per row having each 'Color' value"
 * Column-normalised (sum by category):
 *   "Distribution of each 'Color' value across rows"
 */
function categoryVerb(catView, sumMethodOption, verbCtx) {
  const { chartMode } = verbCtx;
  const colTraitName = Checklist.getMetaForDataPath(catView)?.searchCategory || catView;
  const unit         = t(chartMode === "specimen" ? "view_cat_unit_specimens" : "view_cat_unit_taxa");
  const displayLabel = displayStyles.find(ds => ds.method === display)?.info || "";

  return ( sumMethodOption === "taxon"
    ? tf("view_cat_info_row_pct",  [`${displayLabel} of ${unit}`, colTraitName, verbCtx.rowTraitName])
    : tf("view_cat_info_col_pct",  [colTraitName, verbCtx.rowTraitName]));
}

/**
 * Sentence shown in the cell-verb bar after clicking a data cell.
 * Varies across all four dimensions: sum method, chartMode, secondary-dim type.
 *
 * All four i18n keys share the same parameter positions:
 *   {0} percentage string  e.g. "30%"
 *   {1} raw count          e.g. "15"
 *   {2} unit               e.g. "taxa" / "specimens"
 *   {3} rowLabel           e.g. "<strong>Chordata</strong>"
 *                           or  "<strong>Habitat: Forest</strong>"
 *   {4} colLabel           e.g. "<strong>Color: Red</strong>"
 */
function cellVerb(percentage, cKey, rowKey, matchingCount, sumMethodOption, verbCtx) {
  const { chartMode, isCustomMode, colTraitName, rowTraitName } = verbCtx;
  const unit     = t(chartMode === "specimen" ? "view_cat_unit_specimens" : "view_cat_unit_taxa");
  const colLabel = `<strong>${colTraitName}: ${cKey}</strong>`;
  const rowLabel = isCustomMode
    ? `<strong>${rowTraitName}: ${rowKey}</strong>`
    : `<strong>${rowKey}</strong>`;

  let verb;
  if (sumMethodOption === "taxon") {
    // Row-normalised: "X% (N unit) in [taxon] / with [rowTrait] have [colTrait: value]"
    verb = isCustomMode
      ? tf("view_cat_cell_verb_row_pct_custom", [percentage, matchingCount, unit, rowLabel, colLabel])
      : tf("view_cat_cell_verb_row_pct_taxa",   [percentage, matchingCount, unit, rowLabel, colLabel]);
  } else {
    // Column-normalised: "X% (N unit) with [colTrait: value] belong to / also have [row]"
    verb = isCustomMode
      ? tf("view_cat_cell_verb_col_pct_custom", [percentage, matchingCount, unit, rowLabel, colLabel])
      : tf("view_cat_cell_verb_col_pct_taxa",   [percentage, matchingCount, unit, rowLabel, colLabel]);
  }

  if (!Checklist.filter.isEmpty()) {
    verb += " " + tf(
      "view_cat_cell_verb_category_filtered",
      [Settings.pinnedSearches.getHumanNameForSearch(JSON.parse(Checklist.queryKey()))],
      true
    );
  }
  return m.trust(verb);
}

// ─── Date binning helpers ─────────────────────────────────────────────────────

function unixTimestampToBin(timestamp, binMethod) {
  const d = dayjs(timestamp);
  if (!d.isValid()) return null;
  return binMethod === "year"
    ? String(d.year())
    : t("months." + Settings.MONTH_KEYS[d.month()]);
}

function buildDateBins(allTimestamps, binMethod) {
  const seen = new Set();
  const indexed = [];
  (allTimestamps ?? []).forEach(ts => {
    const d = dayjs(ts);
    if (!d.isValid()) return;
    const sortKey = binMethod === "year" ? d.year() : d.month();
    if (!seen.has(sortKey)) {
      seen.add(sortKey);
      indexed.push({ sortKey, label: unixTimestampToBin(ts, binMethod) });
    }
  });
  indexed.sort((a, b) => a.sortKey - b.sortKey);
  return indexed.map(x => x.label);
}

// ─── Trait-value extraction ───────────────────────────────────────────────────

/**
 * Return all display-label values for a given trait on a single taxon/specimen.
 * Taxon-object values in "text"/"badge" typed columns are normalised via
 * normaliseLabelValue so they produce a plain name string rather than
 * "[object Object]" as a row/column key.
 */
function getTaxonTraitValues(taxon, dataCategory, binMethod, mode, allTaxa) {
  const categoryType = Checklist.filter.data[dataCategory]?.type;
  if (!categoryType) return [];

  const rawData = (mode === "specimen" && categoryType !== "map regions")
    ? Checklist.getEffectiveDataForNode(taxon, Checklist.getSpecimenMetaIndex(), allTaxa)
    : taxon.d;

  const get   = path => Checklist.getDataFromDataPath(rawData, path);
  const toArr = v    => (Array.isArray(v) ? v : [v]);

  switch (categoryType) {
    case "text":
    case "badge": {
      return toArr(get(dataCategory))
        .map(normaliseLabelValue)
        .filter(x => x != null && x !== "" && x !== "[object Object]");
    }
    case "date": {
      return toArr(get(dataCategory))
        .filter(v => typeof v === "number" && !isNaN(v))
        .map(v => unixTimestampToBin(v, binMethod))
        .filter(Boolean);
    }
    case "months": {
      return toArr(get(dataCategory))
        .map(mVal => {
          const num = parseInt(mVal, 10);
          return (num >= 1 && num <= 12) ? t("months." + Settings.MONTH_KEYS[num - 1]) : null;
        })
        .filter(Boolean);
    }
    case "map regions": {
      const regionData = Checklist.getDataFromDataPath(taxon.d, dataCategory);
      if (typeof regionData === "object" && regionData) {
        return Object.keys(regionData).map(r => Checklist.nameForMapRegion(r));
      }
      return [];
    }
    default:
      return [];
  }
}

// ─── Column / row category builders ──────────────────────────────────────────

/**
 * Build the initial ordered column-category map from the full filter dataset.
 * Taxon objects in the `all` array are normalised to plain name strings so
 * they can be used as map keys.
 */
function buildColCategories(colCategory, binMethod) {
  const type = Checklist.filter.data[colCategory]?.type;
  const all  = Checklist.filter.data[colCategory]?.all;
  const cats = {};

  if (type === "date") {
    buildDateBins(all, binMethod).forEach(bin => { cats[bin] = { color: "", sum: 0 }; });
  } else if (type === "months") {
    [...(all || [])]
      .map(m => parseInt(m, 10)).filter(m => !isNaN(m)).sort((a, b) => a - b)
      .forEach(mVal => { cats[t("months." + Settings.MONTH_KEYS[mVal - 1])] = { color: "", sum: 0 }; });
  } else {
    (all || []).forEach(rawVal => {
      const key = normaliseLabelValue(rawVal);
      if (key != null && key !== "" && key !== "[object Object]") {
        cats[key] = { color: "", sum: 0 };
      }
    });
  }
  return cats;
}

/**
 * For date/months row types in custom-dim mode, derive chronologically-ordered
 * row bin labels filtered to those present in individualResults.
 * Returns null for other types → caller falls back to sortByCustomOrder.
 */
function buildOrderedRowBins(rowCategory, rowBinMethod, individualResults) {
  const type = Checklist.filter.data[rowCategory]?.type;
  if (type === "date") {
    return buildDateBins(Checklist.filter.data[rowCategory]?.all, rowBinMethod)
      .filter(bin => individualResults[bin]);
  }
  if (type === "months") {
    return [...(Checklist.filter.data[rowCategory]?.all || [])]
      .map(m => parseInt(m, 10)).filter(m => !isNaN(m)).sort((a, b) => a - b)
      .map(mVal => t("months." + Settings.MONTH_KEYS[mVal - 1]))
      .filter(label => individualResults[label]);
  }
  return null;
}

// ─── Cross-tabulation computation ─────────────────────────────────────────────

/**
 * Taxa drill-down mode.
 * Rows = immediate taxonomy children of rootTaxon; cols = values of colCategory.
 */
function dataForCategoryChart(rootTaxon, taxa, colCategory, mode, allTaxa, colBinMethod) {
  if (!Checklist.filter.data[colCategory]) return null;

  const allCategories = buildColCategories(colCategory, colBinMethod);
  if (Object.keys(allCategories).length === 0) return null;

  const individualResults = {};

  taxa.forEach(taxon => {
    const rootIdx = taxon.t.findIndex(x => x && x.name === rootTaxon);
    if (rootIdx < 0 && rootTaxon !== "") return;
    const child = taxon.t[rootIdx + 1]?.name;
    if (child === undefined) return;

    if (!individualResults[child]) individualResults[child] = { categories: {}, sum: 0, children: 0 };
    if (rootIdx < taxon.t.length - 2) individualResults[child].children++;

    const colValues = [...new Set(getTaxonTraitValues(taxon, colCategory, colBinMethod, mode, allTaxa))]
      .map(cd => (!cd || cd === "null") ? "[unknown]" : cd);

    colValues.forEach(cd => {
      if (!allCategories[cd]) allCategories[cd] = { color: "", sum: 0 };
      individualResults[child].categories[cd] = (individualResults[child].categories[cd] || 0) + 1;
      allCategories[cd].sum++;
    });
    individualResults[child].sum++;
  });

  const colType = Checklist.filter.data[colCategory].type;
  return {
    individualResults,
    sumByCategory:  allCategories,
    orderedBins:    (colType === "date" || colType === "months") ? Object.keys(allCategories) : null,
    orderedRowBins: null,
  };
}

/**
 * Custom secondary-dimension mode.
 * Rows = values of rowCategory (flat, no drill-down); cols = values of colCategory.
 * Each taxon may contribute to multiple row and column buckets simultaneously.
 * row.sum = number of distinct taxa in that row bucket (row-% denominator).
 */
function dataForCategoryChartCustomRows(taxa, colCategory, rowCategory, mode, allTaxa, colBinMethod, rowBinMethod) {
  if (!Checklist.filter.data[colCategory] || !Checklist.filter.data[rowCategory]) return null;

  const allCategories = buildColCategories(colCategory, colBinMethod);
  if (Object.keys(allCategories).length === 0) return null;

  const individualResults = {};

  taxa.forEach(taxon => {
    const rowValues = [...new Set(getTaxonTraitValues(taxon, rowCategory, rowBinMethod, mode, allTaxa))]
      .map(rv => (!rv || rv === "null") ? "[unknown]" : rv);
    const colValues = [...new Set(getTaxonTraitValues(taxon, colCategory, colBinMethod, mode, allTaxa))]
      .map(cv => (!cv || cv === "null") ? "[unknown]" : cv);

    if (rowValues.length === 0) return;

    rowValues.forEach(rv => {
      if (!individualResults[rv]) individualResults[rv] = { categories: {}, sum: 0, children: 0 };
      individualResults[rv].sum++;

      colValues.forEach(cv => {
        if (!allCategories[cv]) allCategories[cv] = { color: "", sum: 0 };
        individualResults[rv].categories[cv] = (individualResults[rv].categories[cv] || 0) + 1;
        allCategories[cv].sum++;
      });
    });
  });

  if (Object.keys(individualResults).length === 0) return null;

  const colType = Checklist.filter.data[colCategory].type;
  return {
    individualResults,
    sumByCategory:  allCategories,
    orderedBins:    (colType === "date" || colType === "months") ? Object.keys(allCategories) : null,
    orderedRowBins: buildOrderedRowBins(rowCategory, rowBinMethod, individualResults),
  };
}

// ─── Main render function ─────────────────────────────────────────────────────

function categoryChart(filteredTaxa) {
  const result = [];
  const isCustomMode = secondaryDimMode === "custom";

  const chartMode             = Settings.analyticalIntent() === "#S" ? "specimen" : "taxa";
  const specimenMetaIndex     = Checklist.getSpecimenMetaIndex();
  const allTaxaForInheritance = chartMode === "specimen" ? Checklist.getEntireChecklist() : filteredTaxa;

  filteredTaxa = filterTerminalLeavesForMode(filteredTaxa, chartMode, specimenMetaIndex);

  // ── Compute cross-tabulation ──────────────────────────────────────────────────
  let categorizedData;
  if (isCustomMode && secondaryDimCategory) {
    categorizedData = dataForCategoryChartCustomRows(
      filteredTaxa, categoryToView, secondaryDimCategory,
      chartMode, allTaxaForInheritance, dateBinning, secondaryDimDateBinning
    );
  } else {
    categorizedData = dataForCategoryChart(
      categoryRoot, filteredTaxa, categoryToView, chartMode, allTaxaForInheritance, dateBinning
    );
    if (categorizedData == null) {
      categoryRoot   = "";
      Settings.categoryChartRoot("");
      categoryToView = "";
      Settings.categoryChartCategory("");
      categorizedData = dataForCategoryChart(
        categoryRoot, filteredTaxa, categoryToView, chartMode, allTaxaForInheritance, dateBinning
      );
    }
  }

  // ── Verb context — built once per render, threaded into verb helpers ───────────
  const colTraitName = Checklist.getMetaForDataPath(categoryToView)?.searchCategory || categoryToView;
  const rowTraitName = isCustomMode && secondaryDimCategory
    ? (Checklist.getMetaForDataPath(secondaryDimCategory)?.searchCategory || secondaryDimCategory)
    : "";
  const verbCtx = { chartMode, isCustomMode, colTraitName, rowTraitName };
  const unit    = t(chartMode === "specimen" ? "view_cat_unit_specimens" : "view_cat_unit_taxa");

  // ── Available filter traits ───────────────────────────────────────────────────
  const filtersToDisplay = Object.keys(Checklist.filter.data).filter(f =>
    ["text", "date", "months", "badge"].includes(Checklist.filter.data[f].type)
  );

  const isDateCategory     = !!categoryToView      && Checklist.filter.data[categoryToView]?.type      === "date";
  const isDateSecondaryDim = !!secondaryDimCategory && Checklist.filter.data[secondaryDimCategory]?.type === "date";

  // ── Dropdown option helpers ───────────────────────────────────────────────────
  const traitOptions = f =>
    m("option", { value: f, disabled: f === secondaryDimCategory },
      Checklist.getMetaForDataPath(f).searchCategory);

  const secondaryOptions = f =>
    m("option", { value: f, disabled: f === categoryToView },
      Checklist.getMetaForDataPath(f).searchCategory);

  // Reused group-by segmented control
  const groupByControl = (currentBin, onChange) =>
    m(".chart-control-group", [
      m("label", t("view_cat_date_group_by")),
      m(".chart-segmented-control", dateBinModes.map(bm =>
        segBtn(bm.name, bm.method === currentBin, () => {
          if (bm.method !== currentBin) onChange(bm.method);
        })
      )),
    ]);

  // ── Control panel ─────────────────────────────────────────────────────────────
  result.push(
    // Two side-by-side cards: Trait to Analyse | Secondary Dimension
    m(".chart-controls-row", {
      style: "display:flex;flex-wrap:wrap;justify-content:space-between;"
    }, [

      // Card A: Trait to Analyse
      m(".chart-controls-card[style='flex-grow:1;']", [
        m(".chart-control-group", [
          m("label", t("view_cat_category_to_analyze")),
          m("select.chart-select", {
            value: categoryToView,
            onchange: e => {
              const v = e.target.value;
              if (v === secondaryDimCategory) {
                secondaryDimCategory = "";
                localStorage.setItem(LS_SEC_CAT, "");
              }
              categoryToView = v;
              Settings.categoryChartCategory(v);
              sortColumn = null;
              sortDirection = "desc";
            }
          }, [
            m("option", { value: "", disabled: true },
              "— " + t("view_cat_category_to_analyze") + " —"),
            ...filtersToDisplay.map(traitOptions),
          ])
        ]),
        isDateCategory ? groupByControl(dateBinning, v => {
          dateBinning = v;
          Settings.categoryChartDateBinning(v);
          sortColumn = null;
          sortDirection = "desc";
        }) : null,
      ]),

      // Card B: Secondary Dimension
      m(".chart-controls-card[style='flex-grow:1;']", [
        m(".chart-control-group", [
          m("label", t("view_cat_secondary_dimension")),
          m(".chart-segmented-control", [
            segBtn(t("view_cat_secondary_dim_taxa"), secondaryDimMode === "taxa", () => {
              secondaryDimMode = "taxa";
              localStorage.setItem(LS_SEC_MODE, "taxa");
              sortColumn = null;
            }),
            segBtn(t("view_cat_secondary_dim_custom"), secondaryDimMode === "custom", () => {
              secondaryDimMode = "custom";
              localStorage.setItem(LS_SEC_MODE, "custom");
              sortColumn = null;
            }),
          ]),
          (isCustomMode
            ? m("select.chart-select", {
                value:    secondaryDimCategory,
                disabled: !isCustomMode,
                onchange: e => {
                  const v = e.target.value;
                  if (v === categoryToView) {
                    categoryToView = "";
                    Settings.categoryChartCategory("");
                  }
                  secondaryDimCategory = v;
                  localStorage.setItem(LS_SEC_CAT, v);
                  sortColumn = null;
                  sortDirection = "desc";
                }
              }, [
                m("option", { value: "", disabled: true },
                  "— " + t("view_cat_secondary_dim_select") + " —"),
                ...filtersToDisplay.map(secondaryOptions),
              ])
            : null),
        ]),
        isCustomMode && isDateSecondaryDim ? groupByControl(secondaryDimDateBinning, v => {
          secondaryDimDateBinning = v;
          localStorage.setItem(LS_SEC_BIN, v);
          sortColumn = null;
          sortDirection = "desc";
        }) : null,
      ]),

    ]),

    // Card C: Display options (shown only once a trait is selected)
    categoryToView === "" ? null : m(".chart-controls-card", [
      m(".chart-controls-row", {
        style: "display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-end;"
      }, [
        m(".chart-control-group", [
          m("label", t("view_cat_sum_method")),
          m(".chart-segmented-control", sumMethods.map(mt =>
            segBtn(mt.name, mt.method === sumMethod, () => {
              if (mt.method !== sumMethod) {
                sumMethod = mt.method;
                Settings.categoryChartSumMethod(sumMethod);
              }
            }, mt.info)
          )),
        ]),
        m(".chart-control-group", [
          m("label", t("view_cat_display")),
          m(".chart-segmented-control", displayStyles.map(ds =>
            segBtn(ds.name, ds.method === display, () => {
              if (ds.method !== display) {
                display = ds.method;
                Settings.categoryChartDisplayMode(display);
              }
            }, ds.info)
          )),
        ]),
        m(".chart-control-group", [
          m("label", {
            style: "display:flex;align-items:center;gap:0.5em;cursor:pointer;font-size:0.9em;font-weight:normal;user-select:none;"
          }, [
            m("input[type=checkbox]", {
              style: "width:1.1em;height:1.1em;cursor:pointer;accent-color:var(--nlblue,#55769b);flex-shrink:0;",
              checked: showEmptyColumns,
              onchange: e => {
                showEmptyColumns = e.target.checked;
                Settings.categoryChartShowEmptyColumns(showEmptyColumns);
                if (!showEmptyColumns && sortColumn !== null && sortColumn !== SORT_KEY_TAXON) {
                  sortColumn = null;
                  sortDirection = "desc";
                }
              }
            }),
            t("view_cat_show_empty_columns"),
          ]),
        ]),
      ]),
    ]),

    // Info box
    categoryToView === "" || !categorizedData || Object.keys(categorizedData.individualResults).length === 0
      ? null
      : m(".chart-info-box", [
        m(".chart-info-item", m.trust(
          Checklist.filter.isEmpty()
            ? tf("view_cat_counted_all", [categoryVerb(categoryToView, sumMethod, verbCtx), unit])
            : tf("view_cat_counted_filter", [
              categoryVerb(categoryToView, sumMethod, verbCtx),
              unit,
              Settings.pinnedSearches.getHumanNameForSearch()
            ])
        )),
        Checklist.hasSpecimens()
          ? m(".chart-info-item",
              chartMode === "taxa" ? t("view_chart_mode_taxa_info") : t("view_chart_mode_specimen_info"))
          : null,
      ])
  );

  // ── Early exit ────────────────────────────────────────────────────────────────
  if (categoryToView === "" || categorizedData == null ||
      Object.keys(categorizedData.individualResults).length === 0) {
    return m(".category-chart-outer-wrapper", result);
  }

  // ── Table setup ───────────────────────────────────────────────────────────────

  const orderedCategories = categorizedData.orderedBins
    ?? sortByCustomOrder(Object.keys(categorizedData.sumByCategory), "data", categoryToView);

  const visibleCategories = showEmptyColumns
    ? orderedCategories
    : orderedCategories.filter(cKey => categorizedData.sumByCategory[cKey].sum > 0);

  if (visibleCategories.length === 0) {
    result.push(m(".chart-info-box", [m(".chart-info-item", t("view_cat_no_visible_columns"))]));
    return m(".category-chart-outer-wrapper", result);
  }

  if (sortColumn !== null && sortColumn !== SORT_KEY_TAXON && !visibleCategories.includes(sortColumn)) {
    sortColumn = null;
    sortDirection = "desc";
  }

  const baseRowKeys = isCustomMode
    ? (categorizedData.orderedRowBins
        ?? sortByCustomOrder(Object.keys(categorizedData.individualResults), "data", secondaryDimCategory))
    : Object.keys(categorizedData.individualResults);

  const getRatio = (row, cKey) => {
    if (!Object.prototype.hasOwnProperty.call(row.categories, cKey)) return 0;
    const basis = sumMethod === "category"
      ? categorizedData.sumByCategory[cKey].sum
      : row.sum;
    return row.categories[cKey] / basis;
  };

  const rowKeys = sortColumn !== null
    ? [...baseRowKeys].sort((a, b) => {
      const ir = categorizedData.individualResults;
      const rA = sortColumn === SORT_KEY_TAXON ? ir[a].sum : getRatio(ir[a], sortColumn);
      const rB = sortColumn === SORT_KEY_TAXON ? ir[b].sum : getRatio(ir[b], sortColumn);
      return sortDirection === "desc" ? rB - rA : rA - rB;
    })
    : baseRowKeys;

  const sortIconFor = cKey => {
    const active = sortColumn === cKey;
    return m("span.category-sort-icon" + (active ? "" : ".inactive"),
      active ? (sortDirection === "desc" ? "▼" : "▲") : "⇅");
  };

  const cornerLabel = isCustomMode && secondaryDimCategory
    ? (Checklist.getMetaForDataPath(secondaryDimCategory)?.searchCategory || secondaryDimCategory)
    : t("view_cat_taxon_col_header", ["s"]);

  // ── Header row ────────────────────────────────────────────────────────────────
  const headerCells = [
    m(
      "th.sticky-row.sticky-column.category-col-header.category-corner-header"
      + (sortColumn === SORT_KEY_TAXON
        ? (sortDirection === "desc" ? ".col-sorted-desc" : ".col-sorted-asc") : ""),
      { style: "z-index:200;", onclick: () => toggleSort(SORT_KEY_TAXON) },
      m(".category-header-inner", [
        m(".category-header-inner-content", [
          m("span.category-header-label", cornerLabel),
          m("span.category-header-row-count", rowKeys.length),
        ]),
        sortIconFor(SORT_KEY_TAXON),
      ])
    ),
    ...visibleCategories.map(cKey =>
      m(
        "th.sticky-row.category-col-header"
        + (sortColumn === cKey
          ? (sortDirection === "desc" ? ".col-sorted-desc" : ".col-sorted-asc") : ""),
        { title: cKey + " — click to sort", onclick: () => toggleSort(cKey) },
        m(".category-header-inner", [
          m("span.category-header-label", cKey),
          sortIconFor(cKey),
        ])
      )
    ),
  ];

  // ── Data rows ─────────────────────────────────────────────────────────────────
  const rows = rowKeys.map(rowKey => {
    const row = categorizedData.individualResults[rowKey];
    const isDrillable = !isCustomMode && row.children > 0;

    const leftCell = m(
      "td.sticky-column.category-taxon-cell",
      isDrillable ? {
        onclick: () => {
          categoryRoot = rowKey;
          Settings.categoryChartRoot(rowKey);
          sortColumn = null;
        }
      } : undefined,
      m(".category-taxon-chip" + (isDrillable ? ".drillable" : ".leaf"), [
        m("span", rowKey),
        isDrillable ? m("span.category-taxon-count", row.children) : null,
      ])
    );

    const dataCells = visibleCategories.map(cKey => {
      if (Object.prototype.hasOwnProperty.call(row.categories, cKey)) {
        const ratio       = getRatio(row, cKey);
        const verbContent = cellVerb(
          toPctString(ratio), cKey, rowKey, row.categories[cKey], sumMethod, verbCtx
        );
        return m("td.category-cell-filled", {
          style:   heatmapStyle(ratio),
          onclick: () => { currentCellVerb = verbContent; },
        }, m("span", numericDisplay(row.categories[cKey], toPctString(ratio))));
      }
      return m("td.category-cell-empty", "—");
    });

    return m("tr", [leftCell, ...dataCells]);
  });

  // ── Breadcrumb (taxa mode only) ───────────────────────────────────────────────
  const breadcrumbPath = !isCustomMode && categoryRoot !== ""
    ? buildBreadcrumbPath(categoryRoot, filteredTaxa) : [];

  const isDefaultVerb = currentCellVerb === t("view_cat_click_on_cell");
  const verbDisplay   = isDefaultVerb ? m("span.cell-verb-prompt", currentCellVerb) : currentCellVerb;

  result.push(
    !isCustomMode && categoryRoot !== ""
      ? m(".category-nav-header", [
        m("button.category-nav-up-btn", {
          onclick: () => {
            const parent = parentOf(categoryRoot, filteredTaxa);
            categoryRoot = parent;
            Settings.categoryChartRoot(parent);
            sortColumn = null;
          }
        }, [m("img[src=img/ui/checklist/level_up.svg]"), "Up"]),
        m(".category-nav-crumb", [
          m("span.category-nav-crumb-step", {
            onclick: () => {
              categoryRoot = "";
              Settings.categoryChartRoot("");
              sortColumn = null;
            }
          }, t("view_cat_category_root")),
          ...breadcrumbPath.map((step, i) => {
            const isCurrent = i === breadcrumbPath.length - 1;
            return [
              m("span.category-nav-crumb-sep", "▸"),
              isCurrent
                ? m("span.category-nav-crumb-current", step)
                : m("span.category-nav-crumb-step", {
                  onclick: () => {
                    categoryRoot = step;
                    Settings.categoryChartRoot(step);
                    sortColumn = null;
                  }
                }, step),
            ];
          }).flat(),
        ]),
      ])
      : null,

    m(".table-flex-container", [
      m(".table-wrapper", [
        m(".cell-verb", verbDisplay),
        m(".table-scroll-area", [
          m("table.category-view", [
            m("tr.header-row", headerCells),
            ...rows,
          ]),
        ]),
      ]),
    ])
  );

  return m(".category-chart-outer-wrapper", result);
}
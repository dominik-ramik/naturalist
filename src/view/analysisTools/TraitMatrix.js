import m from "mithril";
import dayjs from "dayjs";

import "./TraitMatrix.css";

import { Settings } from "../../model/Settings.js";
import {
  sortByCustomOrder,
  filterTerminalLeavesForMode,
} from "../../components/Utils.js";
import { Checklist } from "../../model/Checklist.js";
import { ANALYTICAL_INTENT_OCCURRENCE, OCCURRENCE_IDENTIFIER } from "../../model/nlDataStructureSheets.js";

// ─── Tool config ──────────────────────────────────────────────────────────────

export const config = {
  id: "tool_trait_matrix",
  label: "Trait Matrix",
  iconPath: {
    light: "./img/ui/menu/view_category_density-light.svg",
    dark: "./img/ui/menu/view_category_density.svg",
  },
  info: "Evaluate the breakdown of your data by chosen traits and apply filters to focus the comparison on specific records",
  getTaxaAlongsideOccurrences: false,

  getAvailability: (availableIntents, checklistData) => {
    const supportedIntents = availableIntents.filter(intent =>
      getAvailableTraits(intent, checklistData).length > 0
    );
    return {
      supportedIntents,
      isAvailable: supportedIntents.length > 0,
      toolDisabledReason: "No categorical trait data found in this dataset.",
      scopeDisabledReason: (intent) => {
        const scopeName = intent === ANALYTICAL_INTENT_TAXA ? "Taxa" : "Occurrences";
        return `${config.label} requires categorical trait data to be present with ${scopeName}.`;
      }
    };
  },

  render: ({ filteredTaxa }) => categoryChart(filteredTaxa),
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const getAvailableTraits = (intent, checklistData) => {
  if (!Checklist.filter || !Checklist.filter.data) return [];
  return Object.keys(Checklist.filter.data).filter(f =>
    ["text", "date", "months", "category"].includes(Checklist.filter.data[f].type)
  );
};

// Counts first - absolute numbers are universally understandable as a starting point.
const displayStyles = [
  { name: t("view_cat_percentages_name"), method: "percentages" },
  { name: t("view_cat_counts_name"), method: "counts" },
];

const dateBinModes = [
  { method: "month", name: t("view_cat_date_bin_month") },
  { method: "year", name: t("view_cat_date_bin_year") },
];

const SORT_KEY_TAXON = "__taxon__";

// ─── State ────────────────────────────────────────────────────────────────────

let categoryToView = Settings.categoryChartCategory();
let categoryRoot = Settings.categoryChartRoot();
let display = Settings.categoryChartDisplayMode();
let dateBinning = Settings.categoryChartDateBinning();
let sumMethod = Settings.categoryChartSumMethod();
let showEmptyColumns = Settings.categoryChartShowEmptyColumns();

const LS_SEC_MODE = "categoryChartSecondaryDimMode";
const LS_SEC_CAT = "categoryChartSecondaryDimCategory";
const LS_SEC_BIN = "categoryChartSecondaryDimDateBinning";
const LS_SHOW_EMPTY_ROWS = "categoryChartShowEmptyRows";
const LS_PANEL_COLLAPSED = "tmControlsCollapsed";

let secondaryDimMode = localStorage.getItem(LS_SEC_MODE) || "taxa";
let secondaryDimCategory = localStorage.getItem(LS_SEC_CAT) || "";
let secondaryDimDateBinning = localStorage.getItem(LS_SEC_BIN) || "month";
let showEmptyRows = localStorage.getItem(LS_SHOW_EMPTY_ROWS) !== null
  ? localStorage.getItem(LS_SHOW_EMPTY_ROWS) === "true" : true;
let tmControlsCollapsed = localStorage.getItem(LS_PANEL_COLLAPSED) === "true";
let tmInfoOverlayVisible = false;

if (!displayStyles.find(ds => ds.method === display)) {
  display = displayStyles[0].method;
  Settings.categoryChartDisplayMode(display);
}

let sortColumn = null;
let sortDirection = "desc";
let currentCellVerb = t("view_cat_click_on_cell");

// ─── Cross-tabulation cache ───────────────────────────────────────────────────

let _tmCacheKey = "";
let _tmCachedData = null;

function getCachedCrossTabulation(
  filteredTaxa, categoryToView, secondaryDimCategory, isCustomMode,
  categoryRoot, chartMode, allTaxaForInheritance, dateBinning, secondaryDimDateBinning
) {
  const key = JSON.stringify([
    filteredTaxa.length,
    categoryToView,
    secondaryDimCategory,
    isCustomMode,
    categoryRoot,
    chartMode,
    dateBinning,
    secondaryDimDateBinning,
    Checklist.queryKey(),
  ]);
  if (key === _tmCacheKey && _tmCachedData !== null) return _tmCachedData;

  let result = null;
  if (isCustomMode && secondaryDimCategory) {
    result = dataForCategoryChartCustomRows(
      filteredTaxa, categoryToView, secondaryDimCategory,
      chartMode, allTaxaForInheritance, dateBinning, secondaryDimDateBinning
    );
  } else {
    result = dataForCategoryChart(
      categoryRoot, filteredTaxa, categoryToView, chartMode, allTaxaForInheritance, dateBinning
    );
  }
  _tmCacheKey = key;
  _tmCachedData = result;
  return result;
}

// ─── Generic UI helpers ───────────────────────────────────────────────────────

const segBtn = (label, isSelected, onClick) =>
  m("button" + (isSelected ? ".selected" : ""), { onclick: onClick }, label);

function heatmapStyle(ratio) {
  if (!ratio || ratio <= 0) return "cursor: pointer;";
  const opacity = Math.min(0.08 + ratio * 0.74, 0.82);
  const textColor = opacity > 0.44 ? "#ffffff" : "#2a3a4a";
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

function normaliseLabelValue(v) {
  if (v == null) return null;
  if (typeof v === "object") {
    const name = v.name ?? v.n;
    return name != null ? String(name) : null;
  }
  return String(v);
}

// ─── Cell verb helper ─────────────────────────────────────────────────────────

/**
 * Sentence shown in the cell-verb bar after clicking a data cell.
 *
 * verbCtx: { chartMode, isCustomMode, colTraitName, rowTraitName }
 *
 * Shared param positions across all four i18n keys:
 *   {0} percentage string  "{0}" e.g. "30%"
 *   {1} raw count          e.g. "15"
 *   {2} unit               e.g. "taxa" / "occurrences"
 *   {3} rowLabel           e.g. "<strong>Chordata</strong>"
 *   {4} colLabel           e.g. "<strong>Red List Status: Endangered</strong>"
 */
function cellVerb(percentage, cKey, rowKey, matchingCount, sumMethodOption, verbCtx) {
  const { chartMode, isCustomMode, colTraitName, rowTraitName } = verbCtx;
  const unit = t(chartMode === OCCURRENCE_IDENTIFIER ? "view_cat_unit_occurrences" : "view_cat_unit_taxa");
  const colLabel = `<strong>${colTraitName}: ${cKey}</strong>`;
  const rowLabel = isCustomMode
    ? `<strong>${rowTraitName}: ${rowKey}</strong>`
    : `<strong>${rowKey}</strong>`;

  const key = sumMethodOption === "taxon"
    ? (isCustomMode ? "view_cat_cell_verb_row_pct_custom" : "view_cat_cell_verb_row_pct_taxa")
    : (isCustomMode ? "view_cat_cell_verb_col_pct_custom" : "view_cat_cell_verb_col_pct_taxa");

  let verb = tf(key, [percentage, matchingCount, unit, rowLabel, colLabel]);

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
    : Checklist.getMonthLabel(d.month() + 1);
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

function getTaxonTraitValues(taxon, dataCategory, binMethod, mode, allTaxa) {
  const categoryType = Checklist.filter.data[dataCategory]?.type;
  if (!categoryType) return [];

  const rawData = (mode === OCCURRENCE_IDENTIFIER && categoryType !== "mapregions")
    ? Checklist.getEffectiveDataForNode(taxon, Checklist.getOccurrenceMetaIndex(), allTaxa)
    : taxon.d;

  const get = path => Checklist.getDataFromDataPath(rawData, path);
  const toArr = v => (Array.isArray(v) ? v : [v]);

  switch (categoryType) {
    case "text":
    case "category":
      return toArr(get(dataCategory))
        .map(normaliseLabelValue)
        .filter(x => x != null && x !== "" && x !== "[object Object]");
    case "date":
      return toArr(get(dataCategory))
        .filter(v => typeof v === "number" && !isNaN(v))
        .map(v => unixTimestampToBin(v, binMethod))
        .filter(Boolean);
    case "months":
      return toArr(get(dataCategory))
        .map(mVal => {
          const num = parseInt(mVal, 10);
          return (num >= 1 && num <= 12) ? Checklist.getMonthLabel(num) : null;
        })
        .filter(Boolean);
    case "mapregions": {
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

function buildColCategories(colCategory, binMethod) {
  const type = Checklist.filter.data[colCategory]?.type;
  const all = Checklist.filter.data[colCategory]?.all;
  const cats = {};

  if (type === "date") {
    buildDateBins(all, binMethod).forEach(bin => { cats[bin] = { color: "", sum: 0 }; });
  } else if (type === "months") {
    [...(all || [])]
      .map(m => parseInt(m, 10)).filter(m => !isNaN(m)).sort((a, b) => a - b)
      .forEach(mVal => { cats[Checklist.getMonthLabel(mVal)] = { color: "", sum: 0 }; });
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

function buildOrderedRowBins(rowCategory, rowBinMethod, individualResults) {
  const type = Checklist.filter.data[rowCategory]?.type;
  if (type === "date") {
    return buildDateBins(Checklist.filter.data[rowCategory]?.all, rowBinMethod)
      .filter(bin => individualResults[bin]);
  }
  if (type === "months") {
    return [...(Checklist.filter.data[rowCategory]?.all || [])]
      .map(m => parseInt(m, 10)).filter(m => !isNaN(m)).sort((a, b) => a - b)
      .map(mVal => Checklist.getMonthLabel(mVal))
      .filter(label => individualResults[label]);
  }
  return null;
}

// ─── Cross-tabulation computation ─────────────────────────────────────────────

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
    sumByCategory: allCategories,
    orderedBins: (colType === "date" || colType === "months") ? Object.keys(allCategories) : null,
    orderedRowBins: null,
  };
}

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
    sumByCategory: allCategories,
    orderedBins: (colType === "date" || colType === "months") ? Object.keys(allCategories) : null,
    orderedRowBins: buildOrderedRowBins(rowCategory, rowBinMethod, individualResults),
  };
}

// ─── Info / welcome content ───────────────────────────────────────────────────

/**
 * Generic-example welcome content, shared between the inline empty state and
 * the ? overlay. Examples use deliberate filler words (Trait X, Group A, etc.)
 * so they never accidentally reference data columns that don't make semantic sense.
 */
function welcomeCardContent() {
  return [
    m("h3.tm-welcome-title", t("tm_welcome_title")),
    m("p.tm-welcome-body", t("tm_welcome_intro")),
    m("p.tm-welcome-examples-intro", m.trust(t("tm_welcome_examples_intro"))),
    m("ul.tm-welcome-examples", [
      m("li", m.trust(t("tm_welcome_ex1"))),
      m("li", m.trust(t("tm_welcome_ex2"))),
      m("li", m.trust(t("tm_welcome_ex3"))),
      m("li", m.trust(t("tm_welcome_ex4"))),
      m("li", m.trust(t("tm_welcome_ex5"))),
    ]),
  ];
}

// ─── Collapsed-panel summary ──────────────────────────────────────────────────

function renderPanelSummary(colTraitName, rowDimLabel) {
  const chip = (text, muted) =>
    m("span.tm-summary-chip" + (muted ? ".tm-summary-chip--muted" : ""), text);
  const sep = m("span.tm-summary-sep", "·");

  if (!categoryToView) {
    return m(".tm-panel-summary", chip(t("tm_summary_no_trait"), true));
  }

  return m(".tm-panel-summary", [
    chip(colTraitName),
    sep,
    chip(rowDimLabel),
    sep,
    chip(display === "percentages" ? "%" : "#"),
    display === "percentages" ? [
      sep,
      chip(tf("tm_summary_within", [sumMethod === "taxon" ? rowDimLabel : colTraitName])),
    ] : null,
    !Checklist.filter.isEmpty() ? [sep, chip("⊂ " + t("tm_summary_filtered"))] : null,
  ]);
}

// ─── Living panel ─────────────────────────────────────────────────────────────

/**
 * Always-visible plain-language description of the current configuration.
 * The "↔ Switch" button is an inline affordance that toggles sumMethod directly,
 * teaching the comparison-direction concept through the resulting question itself.
 *
 * Template param positions for tm_living_* keys:
 *   {0} = unit (taxa / occurrences)
 *   {1} = rowDimLabel
 *   {2} = colTraitName
 */
function renderLivingPanel(rowDimLabel, colTraitName, unit) {
  const args = [unit, rowDimLabel, colTraitName];

  const text = display === "percentages"
    ? tf(sumMethod === "taxon" ? "tm_living_row_pct" : "tm_living_col_pct", args)
    : tf("tm_living_counts", args);

  const flipLabel = display === "percentages"
    ? tf(sumMethod === "taxon" ? "tm_living_flip_to_col" : "tm_living_flip_to_row", args)
    : null;

  return m(".tm-living-panel", [
    m("span.tm-living-text", m.trust(text)),
    false && flipLabel ? m("button.tm-living-flip", {
      onclick: () => {
        sumMethod = sumMethod === "taxon" ? "category" : "taxon";
        Settings.categoryChartSumMethod(sumMethod);
      }
    }, m.trust(flipLabel)) : null,
    !Checklist.filter.isEmpty()
      ? m("span.tm-living-filter",
        m.trust(tf("tm_living_filtered", [Settings.pinnedSearches.getHumanNameForSearch()])))
      : null,
  ]);
}

// ─── Main render function ─────────────────────────────────────────────────────

function categoryChart(filteredTaxa) {
  const result = [];
  const isCustomMode = secondaryDimMode === "custom";

  const chartMode = Settings.analyticalIntent() === ANALYTICAL_INTENT_OCCURRENCE ? OCCURRENCE_IDENTIFIER : "taxa";
  const occurrenceMetaIndex = Checklist.getOccurrenceMetaIndex();
  const allTaxaForInheritance = chartMode === OCCURRENCE_IDENTIFIER ? Checklist.getEntireChecklist() : filteredTaxa;

  filteredTaxa = filterTerminalLeavesForMode(filteredTaxa, chartMode, occurrenceMetaIndex);

  // ── Derived labels & flags ────────────────────────────────────────────────

  const filtersToDisplay = Object.keys(Checklist.filter.data).filter(f =>
    ["text", "date", "months", "category"].includes(Checklist.filter.data[f].type)
  );

  const isDateCategory = !!categoryToView && Checklist.filter.data[categoryToView]?.type === "date";
  const isDateSecondaryDim = !!secondaryDimCategory && Checklist.filter.data[secondaryDimCategory]?.type === "date";

  const colTraitName = Checklist.getMetaForDataPath(categoryToView)?.searchCategory || categoryToView;
  const rowDimLabel = isCustomMode && secondaryDimCategory
    ? (Checklist.getMetaForDataPath(secondaryDimCategory)?.searchCategory || secondaryDimCategory)
    : t("tm_rows_taxonomy");
  const unit = t(chartMode === OCCURRENCE_IDENTIFIER ? "view_cat_unit_occurrences" : "view_cat_unit_taxa");

  // ── Compute cross-tabulation first so refine-strip can show accurate counts ─

  let categorizedData = null;
  let emptyColCount = 0;
  let visibleCategories = [];
  let rowKeys = [];
  let emptyRowCount = 0;
  let getRatio = () => 0;
  const verbCtx = {
    chartMode, isCustomMode, colTraitName,
    rowTraitName: isCustomMode && secondaryDimCategory
      ? (Checklist.getMetaForDataPath(secondaryDimCategory)?.searchCategory || secondaryDimCategory)
      : "",
  };

  if (categoryToView !== "") {
    categorizedData = getCachedCrossTabulation(
      filteredTaxa, categoryToView, secondaryDimCategory, isCustomMode,
      categoryRoot, chartMode, allTaxaForInheritance, dateBinning, secondaryDimDateBinning
    );
    if (categorizedData == null && !isCustomMode) {
      // Reset local variables synchronously so the fallback getCachedCrossTabulation
      // call below uses the cleared values.  The Settings (localStorage) writes are
      // deferred so they never mutate persistent state while Mithril is rendering.
      categoryRoot = "";
      categoryToView = "";
      setTimeout(() => {
        Settings.categoryChartRoot("");
        Settings.categoryChartCategory("");
      }, 0);
      categorizedData = getCachedCrossTabulation(
        filteredTaxa, categoryToView, secondaryDimCategory, isCustomMode,
        categoryRoot, chartMode, allTaxaForInheritance, dateBinning, secondaryDimDateBinning
      );
    }

    if (categorizedData && Object.keys(categorizedData.individualResults).length > 0) {
      const orderedCategories = categorizedData.orderedBins
        ?? sortByCustomOrder(Object.keys(categorizedData.sumByCategory), "data", categoryToView);

      emptyColCount = orderedCategories.filter(cKey =>
        categorizedData.sumByCategory[cKey].sum === 0
      ).length;

      visibleCategories = showEmptyColumns
        ? orderedCategories
        : orderedCategories.filter(cKey => categorizedData.sumByCategory[cKey].sum > 0);

      if (sortColumn !== null && sortColumn !== SORT_KEY_TAXON && !visibleCategories.includes(sortColumn)) {
        sortColumn = null; sortDirection = "desc";
      }

      const baseRowKeys = isCustomMode
        ? (categorizedData.orderedRowBins
          ?? sortByCustomOrder(Object.keys(categorizedData.individualResults), "data", secondaryDimCategory))
        : Object.keys(categorizedData.individualResults);

      getRatio = (row, cKey) => {
        if (!Object.prototype.hasOwnProperty.call(row.categories, cKey)) return 0;
        const basis = sumMethod === "category"
          ? categorizedData.sumByCategory[cKey].sum
          : row.sum;
        return row.categories[cKey] / basis;
      };

      const sortedRowKeys = sortColumn !== null
        ? [...baseRowKeys].sort((a, b) => {
          const ir = categorizedData.individualResults;
          const rA = sortColumn === SORT_KEY_TAXON ? ir[a].sum : getRatio(ir[a], sortColumn);
          const rB = sortColumn === SORT_KEY_TAXON ? ir[b].sum : getRatio(ir[b], sortColumn);
          return sortDirection === "desc" ? rB - rA : rA - rB;
        })
        : baseRowKeys;

      emptyRowCount = sortedRowKeys.filter(rowKey =>
        Object.keys(categorizedData.individualResults[rowKey].categories).length === 0
      ).length;

      rowKeys = showEmptyRows
        ? sortedRowKeys
        : sortedRowKeys.filter(rowKey =>
          Object.keys(categorizedData.individualResults[rowKey].categories).length > 0
        );
    }
  }

  // ── Panel: never allow collapsed when no trait is chosen ──────────────────

  const isCollapsed = tmControlsCollapsed && categoryToView !== "";

  const togglePanel = () => {
    tmControlsCollapsed = !tmControlsCollapsed;
    localStorage.setItem(LS_PANEL_COLLAPSED, String(tmControlsCollapsed));
  };

  // ── Dropdown option builders ──────────────────────────────────────────────

  const traitOptions = f =>
    m("option", { value: f, disabled: f === secondaryDimCategory },
      Checklist.getMetaForDataPath(f).searchCategory);

  const secondaryOptions = f =>
    m("option", { value: f, disabled: f === categoryToView },
      Checklist.getMetaForDataPath(f).searchCategory);

  const groupByControl = (currentBin, onChange) =>
    m(".chart-control-group", [
      m("label", t("view_cat_date_group_by")),
      m(".chart-segmented-control", dateBinModes.map(bm =>
        segBtn(bm.name, bm.method === currentBin, () => {
          if (bm.method !== currentBin) onChange(bm.method);
        })
      )),
    ]);

  // ── Info overlay ──────────────────────────────────────────────────────────

  if (tmInfoOverlayVisible) {
    result.push(
      m(".tm-info-overlay", { onclick: () => { tmInfoOverlayVisible = false; } }, [
        m(".tm-info-overlay-card", { onclick: e => e.stopPropagation() }, [
          m("button.tm-overlay-close-btn", {
            onclick: () => { tmInfoOverlayVisible = false; }
          }, "✕"),
          ...welcomeCardContent(),
          categoryToView !== "" ? m("button.tm-welcome-reset-btn", {
            onclick: () => {
              categoryToView = ""; Settings.categoryChartCategory("");
              categoryRoot = ""; Settings.categoryChartRoot("");
              secondaryDimMode = "taxa"; localStorage.setItem(LS_SEC_MODE, "taxa");
              secondaryDimCategory = ""; localStorage.setItem(LS_SEC_CAT, "");
              sortColumn = null;
              tmInfoOverlayVisible = false;
              tmControlsCollapsed = false;
              localStorage.setItem(LS_PANEL_COLLAPSED, "false");
            }
          }, t("tm_welcome_reset")) : null,
        ])
      ])
    );
  }

  // ── Collapsible panel (primary controls + living panel + refine strip) ────

  const panelHeader = isCollapsed
    ? m(".tm-panel-header.tm-panel-header--collapsed", { onclick: togglePanel }, [
      renderPanelSummary(colTraitName, rowDimLabel),
      m("button.tm-panel-edit-btn", {
        onclick: e => { e.stopPropagation(); togglePanel(); }
      }, [
        m("img.tm-panel-collapse-img", { src: "./img/ui/search/expand.svg" }),
        t("tm_panel_edit")]),
    ])
    : m(".tm-panel-header.tm-panel-header--expanded", [
      m("span.tm-panel-title", t("tm_panel_title")),
      m("button.tm-help-btn", {
        title: t("tm_recall_info"),
        onclick: e => { e.stopPropagation(); tmInfoOverlayVisible = !tmInfoOverlayVisible; }
      }, "?"),
      categoryToView !== ""
        ? m("button.tm-panel-collapse-btn", { onclick: togglePanel },
          [
            m("img.tm-panel-collapse-img", { src: "./img/ui/search/collapse.svg" })
            ,
            t("tm_panel_edit_close")
          ]
        )
        : null,
    ]);

  const panelBody = isCollapsed ? null : m(".tm-panel-body", [

    // Primary controls ───────────────────────────────────────────────────────
    m(".tm-controls-inner", [

      m(".chart-control-group.tm-trait-group", [
        m("label", t("tm_trait_label")),
        m("select.chart-select", {
          value: categoryToView || "",
          onchange: e => {
            const v = e.target.value;
            if (v === secondaryDimCategory) {
              secondaryDimCategory = "";
              localStorage.setItem(LS_SEC_CAT, "");
            }
            categoryToView = v;
            Settings.categoryChartCategory(v);
            sortColumn = null; sortDirection = "desc";
          }
        }, [
          m("option[value=''][disabled]", t("tm_trait_placeholder")),
          ...filtersToDisplay.map(traitOptions),
        ])
      ]),

      isDateCategory ? groupByControl(dateBinning, v => {
        dateBinning = v; Settings.categoryChartDateBinning(v);
        sortColumn = null; sortDirection = "desc";
      }) : null,

      categoryToView !== "" && filtersToDisplay.length > 1
        ? m(".chart-control-group.tm-rows-group", [
          m("label", t("tm_rows_label")),
          m(".chart-segmented-control", [
            segBtn(t("tm_rows_taxonomy"), secondaryDimMode === "taxa", () => {
              secondaryDimMode = "taxa";
              localStorage.setItem(LS_SEC_MODE, "taxa");
              sortColumn = null;
            }),
            segBtn(t("tm_rows_custom"), secondaryDimMode === "custom", () => {
              secondaryDimMode = "custom";
              localStorage.setItem(LS_SEC_MODE, "custom");
              sortColumn = null;
            }),
          ]),
          isCustomMode ? m("select.chart-select", {
            value: secondaryDimCategory || "",
            onchange: e => {
              const v = e.target.value;
              if (v === categoryToView) {
                categoryToView = ""; Settings.categoryChartCategory("");
              }
              secondaryDimCategory = v;
              localStorage.setItem(LS_SEC_CAT, v);
              sortColumn = null; sortDirection = "desc";
            }
          }, [
            m("option[value=''][disabled]", t("tm_rows_custom_placeholder")),
            ...filtersToDisplay.map(secondaryOptions),
          ]) : null,
        ])
        : null,

      categoryToView !== "" && isCustomMode && (isDateSecondaryDim || 1 == 1)
        ? groupByControl(secondaryDimDateBinning, v => {
          secondaryDimDateBinning = v;
          localStorage.setItem(LS_SEC_BIN, v);
          sortColumn = null; sortDirection = "desc";
        })
        : null,
    ]),

    // Living panel - once a trait is selected ────────────────────────────────
    categoryToView !== "" ? renderLivingPanel(rowDimLabel, colTraitName, unit) : null,

    // Refine strip - once a trait is selected ────────────────────────────────
    categoryToView !== "" ? m(".tm-refine-strip", [

      m(".tm-refine-row", [
        m("span.tm-refine-label", t("tm_show_as")),
        m(".chart-segmented-control.tm-refine-segmented",
          displayStyles.map(ds =>
            segBtn(ds.name, ds.method === display, () => {
              if (ds.method !== display) {
                display = ds.method;
                Settings.categoryChartDisplayMode(display);
              }
            })
          )
        ),
      ]),

      // "Compare within each" - always visible; disables (greyed) in counts mode
      // because in counts mode sumMethod has no effect on the numbers displayed,
      // but it still affects heatmap intensity so we grey rather than hide.
      m(".tm-refine-row", [
        m("span.tm-refine-label" + (display !== "percentages" ? ".disabled" : ""), t("tm_compare_within")),
        m(".chart-segmented-control.tm-refine-segmented" + (display !== "percentages" ? ".disabled" : ""), [
          segBtn(rowDimLabel, sumMethod === "taxon", () => {
            sumMethod = "taxon"; Settings.categoryChartSumMethod("taxon");
          }),
          segBtn(colTraitName, sumMethod === "category", () => {
            sumMethod = "category"; Settings.categoryChartSumMethod("category");
          }),
        ]),
      ]),

      emptyColCount > 0 ? m("label.tm-refine-checkbox", [
        m("input[type=checkbox]", {
          checked: showEmptyColumns,
          onchange: e => {
            showEmptyColumns = e.target.checked;
            Settings.categoryChartShowEmptyColumns(showEmptyColumns);
            if (!showEmptyColumns && sortColumn !== null && sortColumn !== SORT_KEY_TAXON) {
              sortColumn = null; sortDirection = "desc";
            }
          }
        }),
        m.trust(tf("tm_empty_cols_checkbox", [emptyColCount])),
      ]) : null,

      emptyRowCount > 0 ? m("label.tm-refine-checkbox", [
        m("input[type=checkbox]", {
          checked: showEmptyRows,
          onchange: e => {
            showEmptyRows = e.target.checked;
            localStorage.setItem(LS_SHOW_EMPTY_ROWS, String(showEmptyRows));
          }
        }),
        m.trust(tf("tm_empty_rows_checkbox", [emptyRowCount, rowDimLabel])),
      ]) : null,

    ]) : null,

  ]);

  result.push(m(".tm-panel", [panelHeader, panelBody]));

  // ── Empty state (no trait chosen) ─────────────────────────────────────────

  if (categoryToView === "") {
    result.push(m(".tm-empty-state", welcomeCardContent()));
    return m(".category-chart-outer-wrapper", result);
  }

  // ── No data ───────────────────────────────────────────────────────────────

  if (categorizedData == null || Object.keys(categorizedData.individualResults).length === 0) {
    result.push(m(".chart-info-box", m(".chart-info-item", t("tm_no_data_for_selection"))));
    return m(".category-chart-outer-wrapper", result);
  }

  if (visibleCategories.length === 0) {
    result.push(m(".chart-info-box", m(".chart-info-item", t("view_cat_no_visible_columns"))));
    return m(".category-chart-outer-wrapper", result);
  }

  // ── Table ─────────────────────────────────────────────────────────────────

  const sortIconFor = cKey => {
    const active = sortColumn === cKey;
    return m("span.category-sort-icon" + (active ? "" : ".inactive"),
      active ? (sortDirection === "desc" ? "▼" : "▲") : "⇅");
  };

  const headerCells = [
    m(
      "th.sticky-row.sticky-column.category-col-header.category-corner-header" +
      (sortColumn === SORT_KEY_TAXON
        ? (sortDirection === "desc" ? ".col-sorted-desc" : ".col-sorted-asc") : ""),
      { style: "z-index:200;", onclick: () => toggleSort(SORT_KEY_TAXON) },
      m(".category-header-inner", [
        m(".category-header-inner-content", [
          m("span.category-header-label", rowDimLabel),
          m("span.category-header-row-count", rowKeys.length),
        ]),
        sortIconFor(SORT_KEY_TAXON),
      ])
    ),
    ...visibleCategories.map(cKey =>
      m(
        "th.sticky-row.category-col-header" +
        (sortColumn === cKey
          ? (sortDirection === "desc" ? ".col-sorted-desc" : ".col-sorted-asc") : ""),
        { onclick: () => toggleSort(cKey) },
        m(".category-header-inner", [
          m("span.category-header-label", cKey),
          sortIconFor(cKey),
        ])
      )
    ),
  ];

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
        const ratio = getRatio(row, cKey);
        const verbContent = cellVerb(
          toPctString(ratio), cKey, rowKey, row.categories[cKey], sumMethod, verbCtx
        );
        return m("td.category-cell-filled", {
          style: heatmapStyle(ratio),
          onclick: () => { currentCellVerb = verbContent; },
        }, m("span", numericDisplay(row.categories[cKey], toPctString(ratio))));
      }
      return m("td.category-cell-empty", "-");
    });

    return m("tr", [leftCell, ...dataCells]);
  });

  // ── Breadcrumb (taxa mode only) ───────────────────────────────────────────

  const breadcrumbPath = !isCustomMode && categoryRoot !== ""
    ? buildBreadcrumbPath(categoryRoot, filteredTaxa) : [];

  const isDefaultVerb = currentCellVerb === t("view_cat_click_on_cell");
  const verbDisplay = isDefaultVerb ? m("span.cell-verb-prompt", currentCellVerb) : currentCellVerb;

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
              categoryRoot = ""; Settings.categoryChartRoot(""); sortColumn = null;
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
                    categoryRoot = step; Settings.categoryChartRoot(step); sortColumn = null;
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

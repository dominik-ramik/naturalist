import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

import { Checklist } from "../../model/Checklist";
import { Settings } from "../../model/Settings";
import { dataCustomTypes } from "../../model/customTypes/index.js";

import "./TabSummary.css";

import { getLegendConfig, getCachedRegionColor, getCachedAggregateStats } from "../../model/customTypes/CustomTypeMapregions.js";
import {
  collectNumericValues,
  parseNumericStatus,
} from "../../components/MapregionsColorEngine.js";
import { MONTH_KEYS } from "../../model/MonthNames.js";
import { ANALYTICAL_INTENT_OCCURRENCE } from "../../model/nlDataStructureSheets.js";

registerMessages(selfKey, {
  en: {
    sp_view: "View",
    sp_occurrences: "Occurrences",
    sp_general: "General",
    sp_in_group: "sibling taxa",
    sp_children_taxa: "{0} child taxa",
    sp_title_for_occurrences: "{0} (occurrences)",
    sp_taxonomy: "Taxonomy",
    sp_spec_own: "Own",
    sp_spec_total: "Total",
    sp_cat_col_value: "Category",
    sp_cat_col_count: "Count",
    sp_cat_col_pct: "%",
    sp_region_col_region: "Region",
    sp_region_col_status: "Status",
    sp_region_col_status_range: "Values range",
    sp_region_col_count: "Count",
    sp_region_col_pct: "%",
    sp_region_details_toggle: "Per-region details",
    sp_region_stat_max: "Max",
    sp_region_stat_avg: "Average",
    sp_region_stat_median: "Median",
    sp_region_stat_min: "Min",
    sp_region_stat_value: "Value",
  },
  fr: {
    sp_view: "Vue",
    sp_occurrences: "Occurrences",
    sp_general: "Général",
    sp_in_group: "taxons frères",
    sp_children_taxa: "{0} taxons enfants",
    sp_title_for_occurrences: "{0} (occurrences)",
    sp_taxonomy: "Taxonomie",
    sp_spec_own: "Directes",
    sp_spec_total: "Totales",
    sp_cat_col_value: "Catégorie",
    sp_cat_col_count: "Nombre",
    sp_cat_col_pct: "%",
    sp_region_col_region: "Région",
    sp_region_col_status: "Statut",
    sp_region_col_status_range: "Plage de valeurs",
    sp_region_col_count: "Nombre",
    sp_region_col_pct: "%",
    sp_region_details_toggle: "Détails par région",
    sp_region_stat_max: "Max",
    sp_region_stat_avg: "Moyenne",
    sp_region_stat_median: "Médiane",
    sp_region_stat_min: "Min",
    sp_region_stat_value: "Valeur",    
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Public entry point
// ═══════════════════════════════════════════════════════════════════════════════

export function TabSummary(taxon) {
  const ctx = buildContext(taxon);
  if (!ctx) return m("p.sp-empty", "-");

  const perspectives = [
    buildTaxonomyPerspective(ctx),
    ...(ctx.showOccurrences ? [buildOccurrencesPerspective(ctx)] : []),
    ...buildCategoryPerspectives(ctx),
    ...buildMapRegionsPerspectives(ctx),
    ...buildMonthsPerspectives(ctx),
  ].filter(Boolean);

  if (!perspectives.length) return m("p.sp-empty", "-");

  // Wrap in a stateful component so the nav index tracks the active tab
  return m(SummaryView, { perspectives });
}

// ─── Stateful nav wrapper ─────────────────────────────────────────────────────
// Defined once at module level so Mithril always sees the same component
// reference and preserves instance state (activeIdx) across redraws.

const SummaryView = {
  oninit(vnode) {
    vnode.state.activeIdx = 0;
  },
  onbeforeupdate(vnode) {
    // Clamp the index when the perspectives array shrinks (e.g. taxon switch).
    // Done here rather than in view() so state is never mutated while Mithril
    // is building the vnode tree.
    if (vnode.state.activeIdx >= vnode.attrs.perspectives.length) {
      vnode.state.activeIdx = 0;
    }
  },
  view(vnode) {
    const { perspectives } = vnode.attrs;
    const selectAttrs = {
      value: vnode.state.activeIdx,
      onchange(e) { vnode.state.activeIdx = +e.target.value; },
    };
    const toOption = (p, i) => m("option", { value: i }, p.title);

    let nav = null;
    if (perspectives.length > 1) {
      const hasSpec = perspectives.some(p => p.forOccurrence);
      const hasNonSpec = perspectives.some(p => !p.forOccurrence);
      if (hasSpec && hasNonSpec) {
        nav = m("select.sp-nav-select", selectAttrs, [
          m("optgroup", { label: t("sp_general") },
            perspectives.map((p, i) => !p.forOccurrence ? toOption(p, i) : null)
          ),
          m("optgroup", { label: t("sp_occurrences") },
            perspectives.map((p, i) => p.forOccurrence ? toOption(p, i) : null)
          ),
        ]);
      } else {
        nav = m("select.sp-nav-select", selectAttrs,
          perspectives.map(toOption)
        );
      }
    }

    return m(".sp-wrapper", [
      m(".sp-dropdown-wrapper", [
        m(".dropdown-title", t("sp_view")),
        nav
      ]),
      renderPerspective(perspectives[vnode.state.activeIdx]),
    ]);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Context factory - computed once, shared by all builders
// ═══════════════════════════════════════════════════════════════════════════════

function buildContext(taxon) {
  const checklist = Checklist.getEntireChecklist();
  const taxaMeta = Checklist.getTaxaMeta();
  const taxaKeys = Object.keys(taxaMeta);
  const occurrenceDataPath = Checklist.getOccurrenceDataPath();
  const occurrenceMetaIndex = Checklist.getOccurrenceMetaIndex();
  const showOccurrences = Settings.analyticalIntent() === ANALYTICAL_INTENT_OCCURRENCE
    && Checklist.hasOccurrences()
    && occurrenceMetaIndex !== -1;

  // Deepest non-null, non-occurrence taxon level for this node
  let currentLevelIndex = -1;
  for (let i = taxaKeys.length - 1; i >= 0; i--) {
    if (taxaKeys[i] === occurrenceDataPath) continue;
    if (taxon.t[i] != null) { currentLevelIndex = i; break; }
  }
  if (currentLevelIndex === -1) return null;

  // Ancestry map: levelIndex → taxon name
  const ancestry = {};
  for (let i = 0; i <= currentLevelIndex; i++) {
    if (taxaKeys[i] === occurrenceDataPath || taxon.t[i] == null) continue;
    ancestry[i] = taxon.t[i].name;
  }

  // Checklist rows in the full subtree rooted at the current taxon
  const subtreeRows = checklist.filter(row =>
    Object.entries(ancestry).every(([i, name]) => row.t[+i]?.name === name)
  );

  const _scopeCache = {};
  const ctx = {
    taxon, checklist, subtreeRows, taxaMeta, taxaKeys,
    occurrenceDataPath, occurrenceMetaIndex, currentLevelIndex,
    ancestry, showOccurrences,
    dataMeta: Checklist.getDataMeta(),
  };
  ctx.getScopeForLevel = (li) => {
    if (!_scopeCache[li]) {
      _scopeCache[li] = getScopeForLevel(checklist, ancestry, li);
    }
    return _scopeCache[li];
  };
  return ctx;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Deepest taxon level index, ignoring the occurrence pseudo-level. */
function deepestTaxonLevelOf(row, occurrenceMetaIndex) {
  let d = -1;
  for (let i = 0; i < row.t.length; i++) {
    if (i === occurrenceMetaIndex) continue;
    if (row.t[i] != null) d = i;
  }
  return d;
}

function isOccurrenceRow(row, occurrenceMetaIndex) {
  return occurrenceMetaIndex !== -1
    && row.t[occurrenceMetaIndex] != null
    && row.t[occurrenceMetaIndex].name?.trim() !== "";
}

/**
 * All checklist rows matching ancestry[0..li] inclusive.
 * Wider than subtreeRows for ancestor levels; equals subtreeRows at current level.
 */
function getScopeForLevel(checklist, ancestry, li) {
  return checklist.filter(row => {
    for (let i = 0; i <= li; i++) {
      if (ancestry[i] !== undefined && row.t[i]?.name !== ancestry[i]) return false;
    }
    return true;
  });
}

/** value → occurrence count */
function tally(values) {
  const counts = {};
  for (const v of values) {
    if (v == null || v === "") continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  return counts;
}

/** [{ value, count, pct }] sorted descending by count */
function toBreakdown(counts, total) {
  return Object.entries(counts)
    .map(([value, count]) => ({
      value, count,
      pct: total > 0 ? Math.round(count / total * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Count distinct taxon names at level li within a row set. */
function countTaxaAtLevel(rows, li) {
  const set = new Set();
  rows.forEach(r => { if (r.t[li] != null) set.add(r.t[li].name); });
  return set.size;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Perspective builders
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. Taxonomy ───────────────────────────────────────────────────────────────

function buildTaxonomyPerspective(ctx) {
  const { taxaKeys, taxaMeta, occurrenceDataPath, currentLevelIndex,
    ancestry, checklist, subtreeRows } = ctx;
  const rows = [];

  taxaKeys.forEach((levelKey, li) => {
    if (levelKey === occurrenceDataPath) return;
    const levelName = taxaMeta[levelKey].name;

    if (li <= currentLevelIndex) {
      const name = ancestry[li];
      if (name == null) return; // taxonomy gap

      const siblingsSet = new Set();
      checklist.forEach(row => {
        for (let i = 0; i < li; i++) {
          if (ancestry[i] !== undefined && row.t[i]?.name !== ancestry[i]) return;
        }
        if (row.t[li] != null) siblingsSet.add(row.t[li].name);
      });

      rows.push({
        kind: li === currentLevelIndex ? "current" : "ancestor",
        levelName, name, siblingCount: siblingsSet.size,
      });
    } else {
      const n = countTaxaAtLevel(subtreeRows, li);
      if (n === 0) return;
      rows.push({ kind: "descendant", levelName, count: n });
    }
  });

  return rows.length ? { type: "taxonomy", title: t("sp_taxonomy"), rows, forOccurrence: false } : null;
}

// ── 2. Occurrences ──────────────────────────────────────────────────────────────

function buildOccurrencesPerspective(ctx) {
  const { taxaKeys, taxaMeta, occurrenceDataPath, occurrenceMetaIndex,
    currentLevelIndex, ancestry, checklist, subtreeRows } = ctx;
  const rows = [];

  // No early guard: getScopeForLevel includes sibling branches, so ancestor-
  // level rows populate even when the current taxon's own subtree has no occurrences.

  taxaKeys.forEach((levelKey, li) => {
    if (levelKey === occurrenceDataPath) return;
    const levelName = taxaMeta[levelKey].name;

    if (li <= currentLevelIndex) {
      const name = ancestry[li];
      if (name == null) return;

      const scope = ctx.getScopeForLevel(li);
      let direct = 0, cumulative = 0;
      scope.forEach(row => {
        if (!isOccurrenceRow(row, occurrenceMetaIndex)) return;
        cumulative++;
        if (deepestTaxonLevelOf(row, occurrenceMetaIndex) === li) direct++;
      });
      if (direct === 0 && cumulative === 0) return;

      rows.push({
        kind: li === currentLevelIndex ? "current" : "ancestor",
        levelName, name, direct, cumulative,
      });
    } else {
      let direct = 0, cumulative = 0;
      subtreeRows.forEach(row => {
        if (!isOccurrenceRow(row, occurrenceMetaIndex) || row.t[li] == null) return;
        cumulative++;
        if (deepestTaxonLevelOf(row, occurrenceMetaIndex) === li) direct++;
      });
      if (direct === 0 && cumulative === 0) return;
      const n = countTaxaAtLevel(subtreeRows, li);
      rows.push({ kind: "descendant", levelName, count: n, direct, cumulative });
    }
  });

  return rows.length ? { type: "occurrences", title: t("sp_occurrences"), rows, forOccurrence: true } : null;
}

// ── 3. Categories ─────────────────────────────────────────────────────────────

function buildCategoryPerspectives(ctx) {
  const { dataMeta, showOccurrences, subtreeRows, occurrenceMetaIndex } = ctx;
  const catPaths = Object.keys(dataMeta).filter(p => dataMeta[p]?.formatting === "category");

  return catPaths.flatMap(catPath => {
    const meta = dataMeta[catPath];
    const results = [];
    const hasVal = r => {
      const v = Checklist.getDataFromDataPath(r.d, catPath);
      return v != null && v.toString().trim() !== "";
    };

    if (subtreeRows.some(r => !isOccurrenceRow(r, occurrenceMetaIndex) && hasVal(r))) {
      const p = buildCategoryPerspective(ctx, catPath, meta, false);
      if (p) results.push(p);
    }
    if (showOccurrences && subtreeRows.some(r => isOccurrenceRow(r, occurrenceMetaIndex) && hasVal(r))) {
      const p = buildCategoryPerspective(ctx, catPath, meta, true);
      if (p) results.push(p);
    }
    return results;
  });
}

function buildCategoryPerspective(ctx, catPath, meta, forOccurrence) {
  const { taxaKeys, taxaMeta, occurrenceDataPath, occurrenceMetaIndex,
    currentLevelIndex, ancestry, checklist, subtreeRows } = ctx;

  // Use getAllLeafData so that multi-valued lists (e.g. "list comma"
  // with category subitems) are expanded into individual values.
  const getVals = row => {
    const v = Checklist.getDataFromDataPath(row.d, catPath);
    if (v == null) return [];
    return Checklist.getAllLeafData(v, false, catPath)
      .filter(x => x != null && String(x).trim() !== "");
  };
  const eligible = rows =>
    rows.filter(r => isOccurrenceRow(r, occurrenceMetaIndex) === forOccurrence && getVals(r).length > 0);

  const rows = [];

  taxaKeys.forEach((levelKey, li) => {
    if (levelKey === occurrenceDataPath) return;
    const levelName = taxaMeta[levelKey].name;

    if (li <= currentLevelIndex) {
      const name = ancestry[li];
      if (name == null) return;
      const e = eligible(ctx.getScopeForLevel(li));
      if (e.length === 0) return;
      rows.push({
        kind: li === currentLevelIndex ? "current" : "ancestor",
        levelName, name,
        breakdown: toBreakdown(tally(e.flatMap(getVals)), e.length),
        total: e.length,
      });
    } else {
      // Filter to deepest-level rows to avoid double-counting genus + species
      const e = eligible(subtreeRows)
        .filter(r => deepestTaxonLevelOf(r, occurrenceMetaIndex) === li);
      if (e.length === 0) return;
      rows.push({
        kind: "descendant", levelName,
        count: countTaxaAtLevel(subtreeRows, li),
        breakdown: toBreakdown(tally(e.flatMap(getVals)), e.length),
        total: e.length,
      });
    }
  });

  if (!rows.length) return null;
  const base = meta.title || meta.searchCategory || catPath;
  const title = forOccurrence ? tf("sp_title_for_occurrences", [base], true) : base;
  return { type: "category", title, catPath, meta, rows, forOccurrence };
}

// ── 4. Map regions ────────────────────────────────────────────────────────────

function buildMapRegionsPerspectives(ctx) {
  const { dataMeta, showOccurrences, subtreeRows, occurrenceMetaIndex } = ctx;
  const mapPaths = Object.keys(dataMeta).filter(p => dataMeta[p]?.formatting === "mapregions");

  return mapPaths.flatMap(mapPath => {
    const meta = dataMeta[mapPath];
    const results = [];
    const hasData = r => {
      const v = Checklist.getDataFromDataPath(r.d, mapPath);
      return v && typeof v === "object" && Object.keys(v).length > 0;
    };

    if (subtreeRows.some(r => !isOccurrenceRow(r, occurrenceMetaIndex) && hasData(r))) {
      const p = buildMapRegionsPerspective(ctx, mapPath, meta, false);
      if (p) results.push(p);
    }
    if (showOccurrences && subtreeRows.some(r => isOccurrenceRow(r, occurrenceMetaIndex) && hasData(r))) {
      const p = buildMapRegionsPerspective(ctx, mapPath, meta, true);
      if (p) results.push(p);
    }
    return results;
  });
}

function buildMapRegionsPerspective(ctx, mapPath, meta, forOccurrence) {
  const { taxaKeys, taxaMeta, occurrenceDataPath, occurrenceMetaIndex,
    currentLevelIndex, ancestry, checklist, subtreeRows } = ctx;

  const hasData = r => {
    const v = Checklist.getDataFromDataPath(r.d, mapPath);
    return v && typeof v === "object" && Object.keys(v).length > 0;
  };
  const eligible = rows =>
    rows.filter(r => isOccurrenceRow(r, occurrenceMetaIndex) === forOccurrence && hasData(r));

  const lc = getLegendConfig(mapPath);
  const allNumericValues = [];
  eligible(subtreeRows).forEach(row => {
    const data = Checklist.getDataFromDataPath(row.d, mapPath);
    if (data) collectNumericValues(data, lc).forEach(n => allNumericValues.push(n));
  });
  const aggregateStats = getCachedAggregateStats(allNumericValues, mapPath);

  const rows = [];

  taxaKeys.forEach((levelKey, li) => {
    if (levelKey === occurrenceDataPath) return;
    const levelName = taxaMeta[levelKey].name;

    if (li <= currentLevelIndex) {
      const name = ancestry[li];
      if (name == null) return;
      const e = eligible(ctx.getScopeForLevel(li));
      if (e.length === 0) return;
      const breakdown = buildRegionBreakdown(e, mapPath, e.length, aggregateStats);
      if (!breakdown.length) return;
      rows.push({
        kind: li === currentLevelIndex ? "current" : "ancestor",
        levelName, name, breakdown, total: e.length,
      });
    } else {
      const e = eligible(subtreeRows)
        .filter(r => deepestTaxonLevelOf(r, occurrenceMetaIndex) === li);
      if (e.length === 0) return;
      const breakdown = buildRegionBreakdown(e, mapPath, e.length, aggregateStats);
      if (!breakdown.length) return;
      rows.push({
        kind: "descendant", levelName,
        count: countTaxaAtLevel(subtreeRows, li),
        breakdown, total: e.length,
      });
    }
  });

  if (!rows.length) return null;
  const base = meta.title || meta.searchCategory || mapPath;
  const title = forOccurrence ? tf("sp_title_for_occurrences", [base], true) : base;
  return { type: "mapregions", title, mapPath, meta, rows, forOccurrence };
}

/**
 * Build the per-region status breakdown for a set of checklist rows.
 *
 * Gradient columns: numeric values per region are collapsed into a single
 * range entry (min–max) with a colour sampled at the midpoint, rather than
 * emitting one row per distinct decimal value.  Categorical overrides within
 * a gradient column are still grouped as discrete entries.
 *
 * Stepped / category columns: values are grouped by their resolved bin legend
 * so that multiple raw numeric values that fall in the same bin are counted
 * together.  The colour and label are captured at accumulation time, avoiding
 * the mistake of later trying to resolve a legend string as a status code.
 */
function buildRegionBreakdown(rows, mapPath, totalRows, aggregateStats) {
  const lc = getLegendConfig(mapPath);

  // byRegion: regionCode → {
  //   _grad?: { min, max, count, rawValues }  - gradient numeric accumulator
  //   [binLabel]: { fill, count, resolvedAs, rawValues }  - stepped / category bins
  // }
  const byRegion = {};

  rows.forEach(row => {
    const data = Checklist.getDataFromDataPath(row.d, mapPath);
    if (!data) return;

    Object.entries(data).forEach(([code, info]) => {
      if (!code || !info) return;
      const status = info.status ?? "";
      const resolved = getCachedRegionColor(status, lc, aggregateStats, mapPath)
        ?? { fill: "#ccc", legend: status, appendedLegend: "", resolvedAs: "fallback" };

      if (!byRegion[code]) byRegion[code] = {};

      if (resolved.resolvedAs === "gradient" && parseNumericStatus(status) !== null) {
        // Accumulate numeric gradient values as a range per region.
        const n = parseNumericStatus(status);
        if (!byRegion[code]._grad) {
          byRegion[code]._grad = { min: n, max: n, count: 0, rawValues: [] };
        } else {
          byRegion[code]._grad.min = Math.min(byRegion[code]._grad.min, n);
          byRegion[code]._grad.max = Math.max(byRegion[code]._grad.max, n);
        }
        byRegion[code]._grad.count++;
        // Store per-value fill so summary stats get correct colors
        byRegion[code]._grad.rawValues.push({ value: n, fill: resolved.fill });
      } else {
        // Categorical, stepped, and fallback: group by the resolved legend label.
        // Colour is captured now from the actual resolved status - not re-derived
        // from the label string later, which would fail to find a match.
        const binLabel = resolved.legend || status;
        if (!byRegion[code][binLabel]) {
          byRegion[code][binLabel] = { fill: resolved.fill, count: 0, resolvedAs: resolved.resolvedAs, rawValues: [] };
        }
        byRegion[code][binLabel].count++;
        // Capture the raw numeric value with its individually-resolved fill
        const rawNum = parseNumericStatus(status);
        if (rawNum !== null) byRegion[code][binLabel].rawValues.push({ value: rawNum, fill: resolved.fill });
      }
    });
  });

  return Object.entries(byRegion)
    .map(([code, bins]) => {
      const statuses = [];
      let totalCount = 0;

      // ── Gradient range entry ─────────────────────────────────────────────
      if (bins._grad) {
        const g = bins._grad;
        // Sample the colour at the midpoint of the observed range.
        const mid = (g.min + g.max) / 2;
        const midResolved = getCachedRegionColor(String(mid), lc, aggregateStats, mapPath);
        const rangeLabel = g.min === g.max
          ? g.min.toLocaleString()
          : `${g.min.toLocaleString()} – ${g.max.toLocaleString()}`;
        statuses.push({
          status: rangeLabel,
          count: g.count,
          pct: Math.round(g.count / totalRows * 100),
          fill: midResolved?.fill ?? "#ccc",
          legend: rangeLabel,
          resolvedAs: "gradient",
          rawValues: g.rawValues,
        });
        totalCount += g.count;
      }

      // ── Stepped / category / fallback bins ───────────────────────────────
      Object.entries(bins).forEach(([binLabel, bin]) => {
        if (binLabel === "_grad") return;
        statuses.push({
          status: binLabel,
          count: bin.count,
          pct: Math.round(bin.count / totalRows * 100),
          fill: bin.fill,
          legend: binLabel,
          resolvedAs: bin.resolvedAs,
          rawValues: bin.rawValues,
        });
        totalCount += bin.count;
      });

      statuses.sort((a, b) => b.count - a.count);

      return {
        regionCode: code,
        regionName: Checklist.nameForMapRegion(code),
        totalCount,
        totalPct: Math.round(totalCount / totalRows * 100),
        statuses,
      };
    })
    .sort((a, b) => b.totalCount - a.totalCount);
}

// ── 5. Months ─────────────────────────────────────────────────────────────────

function buildMonthsPerspectives(ctx) {
  const { dataMeta, showOccurrences, subtreeRows, occurrenceMetaIndex } = ctx;
  const monthPaths = Object.keys(dataMeta).filter(p => dataMeta[p]?.formatting === "months");

  return monthPaths.flatMap(monthsPath => {
    const meta = dataMeta[monthsPath];
    const results = [];
    const hasData = r => {
      const v = Checklist.getDataFromDataPath(r.d, monthsPath);
      return Array.isArray(v) && v.length > 0;
    };

    if (subtreeRows.some(r => !isOccurrenceRow(r, occurrenceMetaIndex) && hasData(r))) {
      const p = buildMonthsPerspective(ctx, monthsPath, meta, false);
      if (p) results.push(p);
    }
    if (showOccurrences && subtreeRows.some(r => isOccurrenceRow(r, occurrenceMetaIndex) && hasData(r))) {
      const p = buildMonthsPerspective(ctx, monthsPath, meta, true);
      if (p) results.push(p);
    }
    return results;
  });
}

function buildMonthsPerspective(ctx, monthsPath, meta, forOccurrence) {
  const { taxaKeys, taxaMeta, occurrenceDataPath, occurrenceMetaIndex,
    currentLevelIndex, ancestry, checklist, subtreeRows } = ctx;

  const hasData = r => {
    const v = Checklist.getDataFromDataPath(r.d, monthsPath);
    return Array.isArray(v) && v.length > 0;
  };
  const eligible = rows =>
    rows.filter(r => isOccurrenceRow(r, occurrenceMetaIndex) === forOccurrence && hasData(r));
  const getMonths = row => {
    const v = Checklist.getDataFromDataPath(row.d, monthsPath);
    return Array.isArray(v) ? v : [];
  };

  const rows = [];

  taxaKeys.forEach((levelKey, li) => {
    if (levelKey === occurrenceDataPath) return;
    const levelName = taxaMeta[levelKey].name;

    if (li <= currentLevelIndex) {
      const name = ancestry[li];
      if (name == null) return;
      const e = eligible(ctx.getScopeForLevel(li));
      if (e.length === 0) return;
      // Union of months across all eligible rows in scope (cumulative upward)
      const monthsUnion = new Set();
      e.forEach(r => getMonths(r).forEach(m => monthsUnion.add(m)));
      rows.push({
        kind: li === currentLevelIndex ? "current" : "ancestor",
        levelName, name, months: monthsUnion,
      });
    } else {
      // Include all rows at or below this level - union naturally deduplicates
      const e = eligible(subtreeRows).filter(r => r.t[li] != null);
      if (e.length === 0) return;
      const monthsUnion = new Set();
      e.forEach(r => getMonths(r).forEach(m => monthsUnion.add(m)));
      rows.push({
        kind: "descendant", levelName,
        count: countTaxaAtLevel(subtreeRows, li),
        months: monthsUnion,
      });
    }
  });

  if (!rows.length) return null;
  const base = meta.title || meta.searchCategory || monthsPath;
  const title = forOccurrence ? tf("sp_title_for_occurrences", [base], true) : base;
  return { type: "months", title, monthsPath, meta, rows, forOccurrence };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Renderers
// ═══════════════════════════════════════════════════════════════════════════════

function renderPerspective(p) {
  return m(".sp-card", { class: `sp-card--${p.type}` },
    p.rows.map(row => renderLevelBlock(row, p))
  );
}

// ── Two-row level block: header + data ────────────────────────────────────────

function renderLevelBlock(row, p) {
  const dataContent = renderLevelData(row, p);
  // Treat both null and an all-null array as "no data"
  const hasData = Array.isArray(dataContent)
    ? dataContent.some(Boolean)
    : dataContent != null;

  return m(".sp-level", { class: `sp-level--${row.kind}` }, [
    renderLevelHeader(row, p),
    hasData ? m(".sp-level-data", dataContent) : null,
  ]);
}

function renderLevelHeader(row, p) {
  const nameNode = row.kind === "descendant"
    ? m("span.sp-level-name.sp-level-name--count", (row.count > 0 ? tf("sp_children_taxa", [row.count], true) : ""))
    : m("span.sp-level-name", row.name);

  // Sibling count only shown in taxonomy perspective
  const aside = (p.type === "taxonomy"
    && row.kind !== "descendant"
    && row.siblingCount > 1)
    ? m("span.sp-level-aside",
      "+" + (row.siblingCount - 1) + "\u00a0" + t("sp_in_group"))
    : null;

  return m(".sp-level-header", [
    m("span.sp-level-rank", row.levelName),
    nameNode,
    aside,
  ]);
}

// ── Data content per perspective type ─────────────────────────────────────────

function renderLevelData(row, p) {
  switch (p.type) {
    case "taxonomy": return null;
    case "occurrences": return renderOccurrencesData(row);
    case "category": return renderCategoryData(row.breakdown, p.meta);
    case "mapregions": return renderRegionsLevelContent(row.breakdown);
    case "months": return renderMonthsGrid(row.months);
    default: return null;
  }
}

// ── Occurrences ─────────────────────────────────────────────────────────────────

function renderOccurrencesData(row) {
  // Two explicit labeled columns. Labels are always visible - no tooltip needed.
  // "Own" = occurrences whose deepest identification is exactly this taxonomic level.
  // "Total" = all occurrences in this branch, regardless of further sub-level IDs.
  return m(".sp-spec-cols", [
    m(".sp-spec-col", [
      m(".sp-spec-label", t("sp_spec_own")),
      m(".sp-spec-value", String(row.direct)),
    ]),
    m(".sp-spec-col", [
      m(".sp-spec-label", t("sp_spec_total")),
      m(".sp-spec-value", String(row.cumulative)),
    ]),
  ]);
}

// ── Category ─────────────────────────────────────────────────────────────────

function renderCategoryData(breakdown, meta) {
  if (!breakdown?.length) return null;

  const header = m(".sp-cat-item.sp-cat-header-row", [
    m(".sp-cat-badge", m("span.sp-cat-plain", t("sp_cat_col_value"))),
    m(".sp-cat-stats", [
      m("span.sp-stat-count", t("sp_cat_col_count")),
      m("span.sp-stat-sep", "/"),
      m("span.sp-stat-pct", t("sp_cat_col_pct")),
    ]),
  ]);

  return [header, ...breakdown.map(({ value, count, pct }) => {
    let badge;
    try {
      badge = dataCustomTypes["category"].render(value, { meta });
    } catch (_) {
      badge = m("span.sp-cat-plain", value);
    }
    return m(".sp-cat-item", [
      m(".sp-cat-badge",
        // render() returns either m.trust(html) or a plain string
        typeof badge === "string" ? m.trust(badge) : badge
      ),
      m(".sp-cat-stats", [
        m("span.sp-stat-count", String(count)),
        m("span.sp-stat-sep", "/"),
        m("span.sp-stat-pct", pct + "%"),
      ]),
    ]);
  })];
}

// ── Map regions ───────────────────────────────────────────────────────────────

// ── Summary helpers ───────────────────────────────────────────────────────────

/**
 * Given a flat array of { value, fill, count } items (count = how many
 * observations this value represents), compute weighted min/avg/median/max
 * and pick the fill from the entry whose value is nearest each stat.
 */
function computeWeightedStats(weightedPoints) {
  if (!weightedPoints.length) return null;

  // Expand into a sorted flat list respecting observation counts
  const expanded = [];
  weightedPoints.forEach(({ value, fill, count }) => {
    for (let i = 0; i < count; i++) expanded.push({ value, fill });
  });
  expanded.sort((a, b) => a.value - b.value);

  const vals = expanded.map(x => x.value);
  const min = vals[0];
  const max = vals[vals.length - 1];
  const sum = vals.reduce((s, v) => s + v, 0);
  const avg = sum / vals.length;
  const n = vals.length;
  const median = n % 2 === 0
    ? (vals[n / 2 - 1] + vals[n / 2]) / 2
    : vals[Math.floor(n / 2)];

  const nearest = (target) =>
    expanded.reduce((best, x) =>
      Math.abs(x.value - target) < Math.abs(best.value - target) ? x : best
    ).fill;

  return {
    min, fill_min: nearest(min),
    max, fill_max: nearest(max),
    avg: Math.round(avg * 100) / 100, fill_avg: nearest(avg),
    median: Math.round(median * 100) / 100, fill_median: nearest(median),
  };
}

/**
 * Aggregate all region statuses in a breakdown into a level-wide summary.
 *
 * Returns { type: "categorical" | "numeric" | "mixed", categorical, numeric }
 *
 * categorical.entries - [ { fill, legend, count, pct } ]
 * categorical.stats   - computeWeightedStats result from actual raw values when
 *                        stepped/numeric data is present, else null
 * numeric             - computeWeightedStats result for pure gradient columns
 */
function buildRegionLevelSummary(breakdown) {
  if (!breakdown?.length) return null;

  // legend → { fill, count, rawValues: number[] }
  const catTotals = {};
  // All individual raw numeric values from gradient entries → { value, fill, count:1 }
  const gradPoints = [];

  breakdown.forEach(region => {
    region.statuses.forEach(s => {
      if (s.resolvedAs === "gradient") {
        // rawValues are {value, fill} pairs with per-value resolved colors
        const rv = s.rawValues ?? [];
        rv.forEach(pt => gradPoints.push({ value: pt.value, fill: pt.fill, count: 1 }));
      } else {
        const key = s.legend || s.status || "";
        if (!catTotals[key]) {
          catTotals[key] = { fill: s.fill, count: 0, rawValues: [] };
        }
        catTotals[key].count += s.count;
        // Collect {value, fill} pairs (available for stepped bins)
        const rv = s.rawValues ?? [];
        catTotals[key].rawValues.push(...rv);
      }
    });
  });

  const hasCat = Object.keys(catTotals).length > 0;
  const hasGrad = gradPoints.length > 0;

  // ── Categorical block ──────────────────────────────────────────────────────
  let categorical = null;
  if (hasCat) {
    const grandTotal = Object.values(catTotals).reduce((s, v) => s + v.count, 0);

    // Stepped-numeric: any entry that has actual raw numeric values.
    const hasSteppedNums = Object.values(catTotals).some(e => e.rawValues.length > 0);

    // Compute stats from actual raw underlying values with per-value fills
    let catStats = null;
    if (hasSteppedNums) {
      const allRawPoints = [];
      Object.values(catTotals).forEach(e => {
        e.rawValues.forEach(pt => allRawPoints.push({ value: pt.value, fill: pt.fill, count: 1 }));
      });
      catStats = computeWeightedStats(allRawPoints);
    }

    // Determine sort order: if any entry has raw numeric data, sort by the
    // median of its raw values so bins read low → high.
    const entries = Object.entries(catTotals)
      .map(([legend, { fill, count, rawValues }]) => {
        const sortKey = rawValues.length > 0
          ? rawValues.reduce((s, pt) => s + pt.value, 0) / rawValues.length
          : null;
        return {
          legend, fill, count,
          pct: grandTotal > 0 ? Math.round(count / grandTotal * 100) : 0,
          sortKey,
        };
      })
      .sort((a, b) =>
        (a.sortKey !== null && b.sortKey !== null)
          ? a.sortKey - b.sortKey        // stepped bins: ascending by value
          : (a.sortKey !== null ? -1      // numeric entries before text
            : b.sortKey !== null ? 1
              : b.count - a.count)          // pure text: most frequent first
      );

    categorical = {
      entries,
      stats: catStats,
      hasSteppedNums,
    };
  }

  // ── Pure gradient / numeric block ─────────────────────────────────────────
  let numeric = null;
  if (hasGrad) {
    numeric = computeWeightedStats(gradPoints);
  }

  const type = hasCat && hasGrad ? "mixed" : hasCat ? "categorical" : "numeric";
  return { type, categorical, numeric };
}

/**
 * Render the collapsed-by-default level summary for mapregions.
 * Summary is always visible; the per-region detail table is inside <details>.
 */
function renderRegionsLevelContent(breakdown) {
  if (!breakdown?.length) return null;

  const summary = buildRegionLevelSummary(breakdown);
  if (!summary) return null;

  const summaryNode = m(".sp-region-level-summary", [
    summary.categorical ? renderCategoricalSummary(summary.categorical) : null,
    summary.numeric ? renderNumericSummary(summary.numeric) : null,
  ]);

  const detailsNode = m("details.sp-region-details", [
    m("summary.sp-region-details-toggle", t("sp_region_details_toggle")),
    m(".sp-region-detail-table", renderRegionsDetailRows(breakdown)),
  ]);

  return [summaryNode, detailsNode];
}

function renderCategoricalSummary(categorical) {
  const { entries, stats, hasSteppedNums } = categorical;
  if (!entries?.length) return null;

  const header = m(".sp-region-summary-row.sp-region-summary-header", [
    m("span.sp-region-summary-swatch-col"),
    m("span.sp-region-summary-label-col", t("sp_region_col_status")),
    m("span.sp-stat-count", t("sp_region_col_count")),
    m("span.sp-stat-sep", "/"),
    m("span.sp-stat-pct", t("sp_region_col_pct")),
  ]);

  const rows = entries.map(({ fill, legend, count, pct }) =>
    m(".sp-region-summary-row", [
      m("span.sp-region-summary-swatch-col",
        m("span.sp-region-swatch", { style: { background: fill } })
      ),
      m("span.sp-region-summary-label-col", legend),
      m("span.sp-stat-count", String(count)),
      m("span.sp-stat-sep", "/"),
      m("span.sp-stat-pct", pct + "%"),
    ])
  );

  // For stepped / binned numeric columns, append the aggregate stats block
  // directly beneath the per-bin table so the user sees both breakdowns.
  const statsBlock = (hasSteppedNums && stats)
    ? renderNumericSummary(stats)
    : null;

  return m(".sp-region-cat-summary", [header, ...rows, statsBlock]);
}

function renderNumericSummary(numeric) {
  const { min, max, avg, median, fill_min, fill_max, fill_avg, fill_median } = numeric;

  const fmt = v => (Number.isInteger(v) ? String(v) : v.toLocaleString());

  const statDefs = [
    { label: t("sp_region_stat_max"), value: fmt(max), fill: fill_max },
    { label: t("sp_region_stat_avg"), value: fmt(avg), fill: fill_avg },
    { label: t("sp_region_stat_median"), value: fmt(median), fill: fill_median },
    { label: t("sp_region_stat_min"), value: fmt(min), fill: fill_min },
  ];

  const header = m(".sp-region-summary-row.sp-region-summary-header", [
    m("span.sp-region-summary-swatch-col"),
    m("span.sp-region-summary-label-col", t("sp_region_col_status_range")),
    m("span.sp-stat-count", t("sp_region_stat_value")),
  ]);

  const rows = statDefs.map(({ label, value, fill }) =>
    m(".sp-region-summary-row", [
      m("span.sp-region-summary-swatch-col",
        m("span.sp-region-swatch", { style: { background: fill } })
      ),
      m("span.sp-region-summary-label-col", label),
      m("span.sp-stat-count", value),
    ])
  );

  return m(".sp-region-num-summary", [header, ...rows]);
}

/** The original per-region detail rows - now rendered inside <details>. */
function renderRegionsDetailRows(breakdown) {
  if (!breakdown?.length) return null;

  const isGradient = breakdown.some(r => r.statuses.some(s => s.resolvedAs === "gradient"));

  const header = m(".sp-region-row.sp-region-header-row", [
    m("span.sp-region-dot", { style: { visibility: "hidden" } }),
    m("span.sp-region-name", t("sp_region_col_region")),
    m(".sp-region-stats",
      m(".sp-region-status", [
        m("span.sp-region-status-label", isGradient ? t("sp_region_col_status_range") : t("sp_region_col_status")),
        m("span.sp-stat-count", t("sp_region_col_count")),
        m("span.sp-stat-sep", "/"),
        m("span.sp-stat-pct", t("sp_region_col_pct")),
      ])
    ),
  ]);

  return [header, ...breakdown.map(region => {
    const multiStatus = region.statuses.length > 1;

    return m(".sp-region-row", [
      m("span.sp-region-dot",
        { style: { background: region.statuses[0]?.fill ?? "#ccc" } }
      ),
      m("span.sp-region-name", region.regionName),
      m(".sp-region-stats",
        multiStatus
          ? region.statuses.map(s =>
            m(".sp-region-status", [
              m("span.sp-region-swatch", { style: { background: s.fill } }),
              m("span.sp-region-status-label", s.legend || s.status),
              m("span.sp-stat-count", String(s.count)),
              m("span.sp-stat-sep", "/"),
              m("span.sp-stat-pct", s.pct + "%"),
            ])
          )
          : m(".sp-region-status", [
            m("span.sp-region-status-label",
              region.statuses[0]?.legend || region.statuses[0]?.status || ""
            ),
            m("span.sp-stat-count", String(region.totalCount)),
            m("span.sp-stat-sep", "/"),
            m("span.sp-stat-pct", region.totalPct + "%"),
          ])
      ),
    ]);
  })];
}

// ── Months grid ───────────────────────────────────────────────────────────────

function renderMonthsGrid(months) {
  // months: Set<number>, values are 1-based (1 = Jan, 12 = Dec)

  let currentMonths = Checklist.getMonthNames(Checklist.getCurrentLanguage());

  return m(".sp-months-grid",
    MONTH_KEYS.map((key, i) => {
      const active = months.has(i + 1);
      // Prefer the localized month name from Checklist; fall back to the
      // MONTH_KEYS entry if unavailable, then take its first letter.
      const source = Array.isArray(currentMonths) && currentMonths[i]
        ? currentMonths[i]
        : MONTH_KEYS[i];
      const letter = String(source).charAt(0).toUpperCase();
      return m("span.sp-month-cell",
        { class: active ? "sp-month-cell--on" : "sp-month-cell--off" },
        letter
      );
    })
  );
}
import m from "mithril";

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

// ═══════════════════════════════════════════════════════════════════════════════
// Public entry point
// ═══════════════════════════════════════════════════════════════════════════════

export function TabSummary(taxon) {
  const ctx = buildContext(taxon);
  if (!ctx) return m("p.sp-empty", "—");

  const perspectives = [
    buildTaxonomyPerspective(ctx),
    ...(ctx.showOccurrences ? [buildOccurrencesPerspective(ctx)] : []),
    ...buildCategoryPerspectives(ctx),
    ...buildMapRegionsPerspectives(ctx),
    ...buildMonthsPerspectives(ctx),
  ].filter(Boolean);

  if (!perspectives.length) return m("p.sp-empty", "—");

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
      const hasSpec    = perspectives.some(p =>  p.forOccurrence);
      const hasNonSpec = perspectives.some(p => !p.forOccurrence);
      if (hasSpec && hasNonSpec) {
        nav = m("select.sp-nav-select", selectAttrs, [
          m("optgroup", { label: t("sp_general") },
            perspectives.map((p, i) => !p.forOccurrence ? toOption(p, i) : null)
          ),
          m("optgroup", { label: t("sp_occurrences") },
            perspectives.map((p, i) =>  p.forOccurrence ? toOption(p, i) : null)
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
// Context factory — computed once, shared by all builders
// ═══════════════════════════════════════════════════════════════════════════════

function buildContext(taxon) {
  const checklist         = Checklist.getEntireChecklist();
  const taxaMeta          = Checklist.getTaxaMeta();
  const taxaKeys          = Object.keys(taxaMeta);
  const occurrenceDataPath  = Checklist.getOccurrenceDataPath();
  const occurrenceMetaIndex = Checklist.getOccurrenceMetaIndex();
  const showOccurrences     = Settings.analyticalIntent() === "#S"
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
  //   _grad?: { min, max, count }   — gradient numeric accumulator
  //   [binLabel]: { fill, count, resolvedAs }  — stepped / category bins
  // }
  const byRegion = {};

  rows.forEach(row => {
    const data = Checklist.getDataFromDataPath(row.d, mapPath);
    if (!data) return;

    Object.entries(data).forEach(([code, info]) => {
      if (!code || !info) return;
      const status   = info.status ?? "";
      const resolved = getCachedRegionColor(status, lc, aggregateStats, mapPath)
        ?? { fill: "#ccc", legend: status, appendedLegend: "", resolvedAs: "fallback" };

      if (!byRegion[code]) byRegion[code] = {};

      if (resolved.resolvedAs === "gradient" && parseNumericStatus(status) !== null) {
        // Accumulate numeric gradient values as a range per region.
        const n = parseNumericStatus(status);
        if (!byRegion[code]._grad) {
          byRegion[code]._grad = { min: n, max: n, count: 0 };
        } else {
          byRegion[code]._grad.min = Math.min(byRegion[code]._grad.min, n);
          byRegion[code]._grad.max = Math.max(byRegion[code]._grad.max, n);
        }
        byRegion[code]._grad.count++;
      } else {
        // Categorical, stepped, and fallback: group by the resolved legend label.
        // Colour is captured now from the actual resolved status — not re-derived
        // from the label string later, which would fail to find a match.
        const binLabel = resolved.legend || status;
        if (!byRegion[code][binLabel]) {
          byRegion[code][binLabel] = { fill: resolved.fill, count: 0, resolvedAs: resolved.resolvedAs };
        }
        byRegion[code][binLabel].count++;
      }
    });
  });

  return Object.entries(byRegion)
    .map(([code, bins]) => {
      const statuses = [];
      let totalCount = 0;

      // ── Gradient range entry ─────────────────────────────────────────────
      if (bins._grad) {
        const g   = bins._grad;
        // Sample the colour at the midpoint of the observed range.
        const mid = (g.min + g.max) / 2;
        const midResolved = getCachedRegionColor(String(mid), lc, aggregateStats, mapPath);
        const rangeLabel  = g.min === g.max
          ? g.min.toLocaleString()
          : `${g.min.toLocaleString()} – ${g.max.toLocaleString()}`;
        statuses.push({
          status:     rangeLabel,
          count:      g.count,
          pct:        Math.round(g.count / totalRows * 100),
          fill:       midResolved?.fill ?? "#ccc",
          legend:     rangeLabel,
          resolvedAs: "gradient",
        });
        totalCount += g.count;
      }

      // ── Stepped / category / fallback bins ───────────────────────────────
      Object.entries(bins).forEach(([binLabel, bin]) => {
        if (binLabel === "_grad") return;
        statuses.push({
          status:     binLabel,
          count:      bin.count,
          pct:        Math.round(bin.count / totalRows * 100),
          fill:       bin.fill,
          legend:     binLabel,
          resolvedAs: bin.resolvedAs,
        });
        totalCount += bin.count;
      });

      statuses.sort((a, b) => b.count - a.count);

      return {
        regionCode: code,
        regionName: Checklist.nameForMapRegion(code),
        totalCount,
        totalPct:   Math.round(totalCount / totalRows * 100),
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
      // Include all rows at or below this level — union naturally deduplicates
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
    case "taxonomy":  return null;
    case "occurrences": return renderOccurrencesData(row);
    case "category":  return renderCategoryData(row.breakdown, p.meta);
    case "mapregions": return renderRegionsData(row.breakdown);
    case "months":    return renderMonthsGrid(row.months);
    default:          return null;
  }
}

// ── Occurrences ─────────────────────────────────────────────────────────────────

function renderOccurrencesData(row) {
  // Two explicit labeled columns. Labels are always visible — no tooltip needed.
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

function renderRegionsData(breakdown) {
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
      // Colour dot using the dominant (highest-count) status colour
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
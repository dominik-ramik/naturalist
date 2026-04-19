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
    sp_calculating: "Calculating…",
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
    sp_calculating: "Calcul en cours…",
  }
});

// ─── postTask polyfill ────────────────────────────────────────────────────────
// scheduler.postTask() is available in Chromium 94+ and Firefox 115+.
// For environments that don't support it yet we fall back to a simple
// Promise-wrapped setTimeout so the rest of the code is identical.
const _postTask = (typeof scheduler !== "undefined" && typeof scheduler.postTask === "function")
  ? (fn, opts) => scheduler.postTask(fn, opts)
  : (fn) => new Promise(resolve => setTimeout(() => resolve(fn()), 0));

// ═══════════════════════════════════════════════════════════════════════════════
// Public entry point
// ═══════════════════════════════════════════════════════════════════════════════

// Memoize ctx and firstPerspective by taxon identity so that repeated Mithril
// redraws for the SAME taxon reuse the same object references.  Without this,
// buildContext() returns a fresh object on every redraw, causing onbeforeupdate
// in SummaryView to treat every redraw as a taxon change → infinite reset loop
// → endless spinner + select dropdown being destroyed on every redraw.
let _memoTaxon = null;
let _memoCtx = null;
let _memoSpecs = null;
let _lastPerspectiveId = null;

export function TabSummary(taxon) {
  if (taxon !== _memoTaxon) {
    _memoTaxon = taxon;
    _memoCtx = buildContext(taxon);
    if (_memoCtx) {
      _memoSpecs = buildPerspectiveSpecs(_memoCtx);
      // Pre-fill the first (taxonomy) perspective synchronously so the tab
      // renders immediately without a spinner on first open.
      if (_memoSpecs.length > 0) _memoSpecs[0].result = buildTaxonomyPerspective(_memoCtx);
    } else {
      _memoSpecs = null;
    }
  }

  const ctx = _memoCtx;
  const specs = _memoSpecs;

  if (!ctx) return m("p.sp-empty", "-");

  return m(SummaryView, { ctx, specs });
}

// ─── Lazy per-perspective loader ─────────────────────────────────────────────

// Triggers an async build of specs[idx] the first time it is selected.
// Sets spec.loading = true immediately (visible in the current render) and
// then fills spec.result when the background task finishes.
function _ensurePerspectiveBuilt(vnode, idx) {
  const spec = vnode.attrs.specs?.[idx];
  if (!spec || spec.result !== undefined || spec.loading) return;

  const expectedCtx = vnode.attrs.ctx;
  spec.loading = true;
  _postTask(() => spec.buildFn(), { priority: "background" })
    .then(result => {
      if (vnode.attrs.ctx !== expectedCtx) return; // taxon changed, discard
      spec.result = result;
      spec.loading = false;
      m.redraw();
    })
    .catch(() => {
      if (vnode.attrs.ctx !== expectedCtx) return;
      spec.loading = false;
      m.redraw();
    });
}

const SummaryView = {
  oninit(vnode) {
    vnode.state.activeIdx = 0;
  },

  onbeforeupdate(vnode, old) {
    // Taxon changed: try to restore the last selected perspective.
    if (vnode.attrs.ctx !== old.attrs.ctx) {
      const specs = vnode.attrs.specs;
      const matchIdx = _lastPerspectiveId != null
        ? specs?.findIndex(s => s.id === _lastPerspectiveId)
        : -1;
      vnode.state.activeIdx = matchIdx > 0 ? matchIdx : 0;
    }
  },

  view(vnode) {
    const { activeIdx } = vnode.state;
    const specs = vnode.attrs.specs;

    if (!specs?.length) return m("p.sp-empty", "-");

    const clampedIdx = Math.min(activeIdx, specs.length - 1);
    const activeSpec = specs[clampedIdx];

    // Trigger lazy build on first access (sets loading=true synchronously so
    // the spinner is visible in this very render).
    _ensurePerspectiveBuilt(vnode, clampedIdx);

    const selectAttrs = {
      value: clampedIdx,
      onchange(e) {
        const idx = +e.target.value;
        vnode.state.activeIdx = idx;
        _lastPerspectiveId = vnode.attrs.specs?.[idx]?.id ?? null;
        _ensurePerspectiveBuilt(vnode, idx);
      },
    };
    const toOption = (spec, i) => m("option", { value: i }, spec.title);

    let nav = null;
    if (specs.length > 1) {
      const hasSpec = specs.some(p => p.forOccurrence);
      const hasNonSpec = specs.some(p => !p.forOccurrence);
      if (hasSpec && hasNonSpec) {
        nav = m("select.sp-nav-select", selectAttrs, [
          m("optgroup", { label: t("sp_general") },
            specs.map((p, i) => !p.forOccurrence ? toOption(p, i) : null)
          ),
          m("optgroup", { label: t("sp_occurrences") },
            specs.map((p, i) => p.forOccurrence ? toOption(p, i) : null)
          ),
        ]);
      } else {
        nav = m("select.sp-nav-select", selectAttrs, specs.map(toOption));
      }
    }

    const content = activeSpec.loading
      ? m(".sp-spinner-wrapper", [
        m(".sp-spinner"),
        m(".sp-spinner-text", t("sp_calculating")),
      ])
      : activeSpec.result ? renderPerspective(activeSpec.result) : null;

    return m(".sp-wrapper", [
      m(".sp-dropdown-wrapper", [
        m(".dropdown-title", t("sp_view")),
        nav,
      ]),
      content,
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

  // Pre-compute entries once so the per-row filter avoids repeated
  // Object.entries() allocation and string-to-number coercion.
  const ancestryEntries = Object.entries(ancestry).map(([i, name]) => [+i, name]);

  // Checklist rows in the full subtree rooted at the current taxon
  const subtreeRows = checklist.filter(row =>
    ancestryEntries.every(([i, name]) => row.t[i]?.name === name)
  );

  // ── Pre-partition rows by occurrence/non-occurrence once ──────────────────
  // Avoids re-running isOccurrenceRow() in every per-perspective filter loop.
  const subtreeOccurrenceRows = occurrenceMetaIndex === -1
    ? []
    : subtreeRows.filter(r => isOccurrenceRow(r, occurrenceMetaIndex));
  const subtreeTaxonRows = occurrenceMetaIndex === -1
    ? subtreeRows
    : subtreeRows.filter(r => !isOccurrenceRow(r, occurrenceMetaIndex));

  // ── Per-row deepest-level cache ───────────────────────────────────────────
  // deepestTaxonLevelOf() is O(row.t.length) and called thousands of times
  // across all builders. A WeakMap keyed by the row object avoids the repeat.
  const _deepestCache = new Map();
  const cachedDeepest = (row) => {
    if (!_deepestCache.has(row)) {
      _deepestCache.set(row, deepestTaxonLevelOf(row, occurrenceMetaIndex));
    }
    return _deepestCache.get(row);
  };

  // ── countTaxaAtLevel cache ────────────────────────────────────────────────
  const _taxaAtLevelCache = {};
  const cachedCountTaxaAtLevel = (li) => {
    if (_taxaAtLevelCache[li] === undefined) {
      _taxaAtLevelCache[li] = countTaxaAtLevel(subtreeRows, li);
    }
    return _taxaAtLevelCache[li];
  };

  // ── getScopeForLevel cache ─────────────────────────────────────────────────
  const _scopeCache = {};
  // Pre-partitioned scope caches (avoids re-filtering inside builders)
  const _scopeTaxonCache = {};
  const _scopeOccCache = {};

  const ctx = {
    taxon, checklist, subtreeRows, taxaMeta, taxaKeys,
    occurrenceDataPath, occurrenceMetaIndex, currentLevelIndex,
    ancestry, showOccurrences,
    dataMeta: Checklist.getDataMeta(),
    subtreeOccurrenceRows,
    subtreeTaxonRows,
    cachedDeepest,
    cachedCountTaxaAtLevel,
  };

  ctx.getScopeForLevel = (li) => {
    // Short-circuit: scope at currentLevelIndex is exactly subtreeRows
    if (li === currentLevelIndex) return subtreeRows;
    if (!_scopeCache[li]) {
      _scopeCache[li] = getScopeForLevel(checklist, ancestry, li);
    }
    return _scopeCache[li];
  };

  // Scoped rows pre-partitioned for non-occurrence builders
  ctx.getScopeTaxonRows = (li) => {
    if (!_scopeTaxonCache[li]) {
      const scope = ctx.getScopeForLevel(li);
      _scopeTaxonCache[li] = occurrenceMetaIndex === -1
        ? scope
        : scope.filter(r => !isOccurrenceRow(r, occurrenceMetaIndex));
    }
    return _scopeTaxonCache[li];
  };

  // Scoped rows pre-partitioned for occurrence builders
  ctx.getScopeOccRows = (li) => {
    if (!_scopeOccCache[li]) {
      const scope = ctx.getScopeForLevel(li);
      _scopeOccCache[li] = occurrenceMetaIndex === -1
        ? []
        : scope.filter(r => isOccurrenceRow(r, occurrenceMetaIndex));
    }
    return _scopeOccCache[li];
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
// Perspective spec builder
// ═══════════════════════════════════════════════════════════════════════════════

// Returns an array of spec objects – one per perspective eligible for ctx.
// Each spec has: { title, forOccurrence, result, loading, buildFn }.
// result starts as `undefined` (not yet built); null means built but empty.
// The caller pre-fills specs[0].result with the taxonomy perspective.
function buildPerspectiveSpecs(ctx) {
  const { dataMeta, showOccurrences, subtreeTaxonRows, subtreeOccurrenceRows } = ctx;
  const specs = [];

  // 1. Taxonomy — always present; result pre-filled by TabSummary
  specs.push({
    id: "taxonomy",
    title: t("sp_taxonomy"),
    forOccurrence: false,
    result: undefined,
    loading: false,
    buildFn: () => buildTaxonomyPerspective(ctx),
  });

  // 2. Occurrences
  if (showOccurrences && subtreeOccurrenceRows.length > 0) {
    specs.push({
      id: "occurrences",
      title: t("sp_occurrences"),
      forOccurrence: true,
      result: undefined,
      loading: false,
      buildFn: () => buildOccurrencesPerspective(ctx),
    });
  }

  // 3. Categories
  const catPaths = Object.keys(dataMeta).filter(p => dataMeta[p]?.formatting === "category");
  catPaths.forEach(catPath => {
    const meta = dataMeta[catPath];
    const base = meta.title || meta.searchCategory || catPath;
    const hasVal = r => {
      const v = Checklist.getDataFromDataPath(r.d, catPath);
      return v != null && v.toString().trim() !== "";
    };
    if (subtreeTaxonRows.some(hasVal)) {
      specs.push({
        id: `cat:${catPath}`,
        title: base,
        forOccurrence: false,
        result: undefined,
        loading: false,
        buildFn: () => buildCategoryPerspective(ctx, catPath, meta, false),
      });
    }
    if (showOccurrences && subtreeOccurrenceRows.some(hasVal)) {
      specs.push({
        id: `cat_occ:${catPath}`,
        title: tf("sp_title_for_occurrences", [base], true),
        forOccurrence: true,
        result: undefined,
        loading: false,
        buildFn: () => buildCategoryPerspective(ctx, catPath, meta, true),
      });
    }
  });

  // 4. Map regions
  const mapPaths = Object.keys(dataMeta).filter(p => dataMeta[p]?.formatting === "mapregions");
  mapPaths.forEach(mapPath => {
    const meta = dataMeta[mapPath];
    const base = meta.title || meta.searchCategory || mapPath;
    const hasData = r => {
      const v = Checklist.getDataFromDataPath(r.d, mapPath);
      return v && typeof v === "object" && Object.keys(v).length > 0;
    };
    if (subtreeTaxonRows.some(hasData)) {
      specs.push({
        id: `map:${mapPath}`,
        title: base,
        forOccurrence: false,
        result: undefined,
        loading: false,
        buildFn: () => buildMapRegionsPerspective(ctx, mapPath, meta, false),
      });
    }
    if (showOccurrences && subtreeOccurrenceRows.some(hasData)) {
      specs.push({
        id: `map_occ:${mapPath}`,
        title: tf("sp_title_for_occurrences", [base], true),
        forOccurrence: true,
        result: undefined,
        loading: false,
        buildFn: () => buildMapRegionsPerspective(ctx, mapPath, meta, true),
      });
    }
  });

  // 5. Months
  const monthPaths = Object.keys(dataMeta).filter(p => dataMeta[p]?.formatting === "months");
  monthPaths.forEach(monthsPath => {
    const meta = dataMeta[monthsPath];
    const base = meta.title || meta.searchCategory || monthsPath;
    const hasData = r => {
      const v = Checklist.getDataFromDataPath(r.d, monthsPath);
      return Array.isArray(v) && v.length > 0;
    };
    if (subtreeTaxonRows.some(hasData)) {
      specs.push({
        id: `months:${monthsPath}`,
        title: base,
        forOccurrence: false,
        result: undefined,
        loading: false,
        buildFn: () => buildMonthsPerspective(ctx, monthsPath, meta, false),
      });
    }
    if (showOccurrences && subtreeOccurrenceRows.some(hasData)) {
      specs.push({
        id: `months_occ:${monthsPath}`,
        title: tf("sp_title_for_occurrences", [base], true),
        forOccurrence: true,
        result: undefined,
        loading: false,
        buildFn: () => buildMonthsPerspective(ctx, monthsPath, meta, true),
      });
    }
  });

  return specs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Perspective builders
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. Taxonomy ───────────────────────────────────────────────────────────────

function buildTaxonomyPerspective(ctx) {
  const { taxaKeys, taxaMeta, occurrenceDataPath, currentLevelIndex,
    ancestry, checklist, subtreeRows, cachedCountTaxaAtLevel } = ctx;
  const rows = [];

  taxaKeys.forEach((levelKey, li) => {
    if (levelKey === occurrenceDataPath) return;
    const levelName = taxaMeta[levelKey].name;

    if (li <= currentLevelIndex) {
      const name = ancestry[li];
      if (name == null) return; // taxonomy gap

      // Use the cached narrower scope instead of scanning all checklist rows.
      // For li=0 there is no parent constraint so we need all rows;
      // for li>0 getScopeForLevel(li-1) is already the right parent scope.
      const siblingScope = li === 0 ? checklist : ctx.getScopeForLevel(li - 1);
      const siblingsSet = new Set();
      siblingScope.forEach(row => {
        if (row.t[li] != null) siblingsSet.add(row.t[li].name);
      });

      rows.push({
        kind: li === currentLevelIndex ? "current" : "ancestor",
        levelName, name, siblingCount: siblingsSet.size,
      });
    } else {
      const n = cachedCountTaxaAtLevel(li);
      if (n === 0) return;
      rows.push({ kind: "descendant", levelName, count: n });
    }
  });

  return rows.length ? { type: "taxonomy", title: t("sp_taxonomy"), rows, forOccurrence: false } : null;
}

// ── 2. Occurrences ──────────────────────────────────────────────────────────────

function buildOccurrencesPerspective(ctx) {
  const { taxaKeys, taxaMeta, occurrenceDataPath, occurrenceMetaIndex,
    currentLevelIndex, ancestry, subtreeRows, cachedDeepest,
    cachedCountTaxaAtLevel } = ctx;
  const rows = [];

  taxaKeys.forEach((levelKey, li) => {
    if (levelKey === occurrenceDataPath) return;
    const levelName = taxaMeta[levelKey].name;

    if (li <= currentLevelIndex) {
      const name = ancestry[li];
      if (name == null) return;

      // Use the pre-partitioned occurrence scope
      const e = ctx.getScopeOccRows(li);
      if (e.length === 0) return;

      let direct = 0;
      e.forEach(row => {
        if (cachedDeepest(row) === li) direct++;
      });
      const cumulative = e.length;
      if (direct === 0 && cumulative === 0) return;

      rows.push({
        kind: li === currentLevelIndex ? "current" : "ancestor",
        levelName, name, direct, cumulative,
      });
    } else {
      // subtreeOccurrenceRows is already filtered for isOccurrenceRow
      const e = ctx.subtreeOccurrenceRows.filter(row => row.t[li] != null);
      if (e.length === 0) return;
      let direct = 0;
      e.forEach(row => { if (cachedDeepest(row) === li) direct++; });
      const cumulative = e.length;
      if (direct === 0 && cumulative === 0) return;
      const n = cachedCountTaxaAtLevel(li);
      rows.push({ kind: "descendant", levelName, count: n, direct, cumulative });
    }
  });

  return rows.length ? { type: "occurrences", title: t("sp_occurrences"), rows, forOccurrence: true } : null;
}

// ── 3. Categories ─────────────────────────────────────────────────────────────

function buildCategoryPerspective(ctx, catPath, meta, forOccurrence) {
  const { taxaKeys, taxaMeta, occurrenceDataPath, occurrenceMetaIndex,
    currentLevelIndex, ancestry, subtreeRows, cachedDeepest,
    cachedCountTaxaAtLevel } = ctx;

  // Memoize per row: getDataFromDataPath + getAllLeafData are expensive and
  // each row is queried at least twice (once in the eligibility filter, once
  // in the flatMap extraction).
  const _valsCache = new Map();
  const getVals = row => {
    if (_valsCache.has(row)) return _valsCache.get(row);
    const v = Checklist.getDataFromDataPath(row.d, catPath);
    const result = v == null ? [] : Checklist.getAllLeafData(v, false, catPath)
      .filter(x => x != null && String(x).trim() !== "");
    _valsCache.set(row, result);
    return result;
  };

  // Use pre-partitioned scope rows to avoid re-checking isOccurrenceRow per row
  const getScopedEligible = (li) => {
    const scopeRows = forOccurrence ? ctx.getScopeOccRows(li) : ctx.getScopeTaxonRows(li);
    return scopeRows.filter(r => getVals(r).length > 0);
  };

  const rows = [];

  taxaKeys.forEach((levelKey, li) => {
    if (levelKey === occurrenceDataPath) return;
    const levelName = taxaMeta[levelKey].name;

    if (li <= currentLevelIndex) {
      const name = ancestry[li];
      if (name == null) return;
      const e = getScopedEligible(li);
      if (e.length === 0) return;
      rows.push({
        kind: li === currentLevelIndex ? "current" : "ancestor",
        levelName, name,
        breakdown: toBreakdown(tally(e.flatMap(getVals)), e.length),
        total: e.length,
      });
    } else {
      // Use pre-partitioned subtree rows; filter to deepest-level only to avoid double-counting
      const pool = forOccurrence ? ctx.subtreeOccurrenceRows : ctx.subtreeTaxonRows;
      const e = pool.filter(r => r.t[li] != null && cachedDeepest(r) === li && getVals(r).length > 0);
      if (e.length === 0) return;
      rows.push({
        kind: "descendant", levelName,
        count: cachedCountTaxaAtLevel(li),
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

function buildMapRegionsPerspective(ctx, mapPath, meta, forOccurrence) {
  const { taxaKeys, taxaMeta, occurrenceDataPath, occurrenceMetaIndex,
    currentLevelIndex, ancestry, subtreeRows, cachedDeepest,
    cachedCountTaxaAtLevel } = ctx;

  // Cache getDataFromDataPath per row: it is called inside hasData checks and
  // then again immediately to retrieve the actual data object — easily 3-4×
  // per row across the aggregate pass and each per-level filter.
  const _mapDataCache = new Map();
  const getMapData = row => {
    if (_mapDataCache.has(row)) return _mapDataCache.get(row);
    const v = Checklist.getDataFromDataPath(row.d, mapPath);
    const result = (v && typeof v === "object" && Object.keys(v).length > 0) ? v : null;
    _mapDataCache.set(row, result);
    return result;
  };
  const hasData = r => getMapData(r) !== null;

  // Use pre-partitioned pools
  const subtreePool = forOccurrence ? ctx.subtreeOccurrenceRows : ctx.subtreeTaxonRows;

  const lc = getLegendConfig(mapPath);

  // Collect numeric values for aggregate stats once from the full subtree pool
  const allNumericValues = [];
  subtreePool.forEach(row => {
    const data = getMapData(row);
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
      const scopePool = forOccurrence ? ctx.getScopeOccRows(li) : ctx.getScopeTaxonRows(li);
      const e = scopePool.filter(hasData);
      if (e.length === 0) return;
      const breakdown = buildRegionBreakdown(e, mapPath, e.length, aggregateStats, getMapData, lc);
      if (!breakdown.length) return;
      const levelSummary = buildRegionLevelSummary(breakdown);
      rows.push({
        kind: li === currentLevelIndex ? "current" : "ancestor",
        levelName, name, breakdown, total: e.length, levelSummary,
      });
    } else {
      const e = subtreePool.filter(r => r.t[li] != null && cachedDeepest(r) === li && hasData(r));
      if (e.length === 0) return;
      const breakdown = buildRegionBreakdown(e, mapPath, e.length, aggregateStats, getMapData, lc);
      if (!breakdown.length) return;
      const levelSummary = buildRegionLevelSummary(breakdown);
      rows.push({
        kind: "descendant", levelName,
        count: cachedCountTaxaAtLevel(li),
        breakdown, total: e.length, levelSummary,
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
// lc (legendConfig) is passed in from buildMapRegionsPerspective, which already
// holds the cached reference — no need to call getLegendConfig() again here.
function buildRegionBreakdown(rows, mapPath, totalRows, aggregateStats, getMapData, lc) {
  // byRegion: regionCode → {
  //   _grad?: { min, max, count, rawValues }  - gradient numeric accumulator
  //   [binLabel]: { fill, count, resolvedAs, rawValues }  - stepped / category bins
  // }
  const byRegion = {};

  rows.forEach(row => {
    const data = getMapData ? getMapData(row) : Checklist.getDataFromDataPath(row.d, mapPath);
    if (!data) return;

    Object.entries(data).forEach(([code, info]) => {
      if (!code || !info) return;
      const status = info.status ?? "";
      const resolved = getCachedRegionColor(status, lc, aggregateStats, mapPath)
        ?? { fill: "#ccc", legend: status, appendedLegend: "", resolvedAs: "fallback" };

      if (!byRegion[code]) byRegion[code] = {};

      // Parse once; result is used in both branches.
      const n = parseNumericStatus(status);

      if (resolved.resolvedAs === "gradient" && n !== null) {
        // Accumulate numeric gradient values as a range per region.
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
        if (n !== null) byRegion[code][binLabel].rawValues.push({ value: n, fill: resolved.fill });
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

function buildMonthsPerspective(ctx, monthsPath, meta, forOccurrence) {
  const { taxaKeys, taxaMeta, occurrenceDataPath, occurrenceMetaIndex,
    currentLevelIndex, ancestry, cachedCountTaxaAtLevel } = ctx;

  // Combined cache: one getDataFromDataPath call per row serves both the
  // hasData guard and the getMonths extraction (each row is touched twice
  // per level otherwise).
  const _monthsCache = new Map();
  const getMonths = row => {
    if (_monthsCache.has(row)) return _monthsCache.get(row);
    const v = Checklist.getDataFromDataPath(row.d, monthsPath);
    const result = Array.isArray(v) && v.length > 0 ? v : null;
    _monthsCache.set(row, result);
    return result;
  };
  const hasData = r => getMonths(r) !== null;

  const rows = [];

  taxaKeys.forEach((levelKey, li) => {
    if (levelKey === occurrenceDataPath) return;
    const levelName = taxaMeta[levelKey].name;

    if (li <= currentLevelIndex) {
      const name = ancestry[li];
      if (name == null) return;
      // Use pre-partitioned scoped rows
      const scopeRows = forOccurrence ? ctx.getScopeOccRows(li) : ctx.getScopeTaxonRows(li);
      const e = scopeRows.filter(hasData);
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
      const pool = forOccurrence ? ctx.subtreeOccurrenceRows : ctx.subtreeTaxonRows;
      const e = pool.filter(r => r.t[li] != null && hasData(r));
      if (e.length === 0) return;
      const monthsUnion = new Set();
      e.forEach(r => getMonths(r).forEach(m => monthsUnion.add(m)));
      rows.push({
        kind: "descendant", levelName,
        count: cachedCountTaxaAtLevel(li),
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
    case "mapregions": return renderRegionsLevelContent(row.breakdown, row.levelSummary);
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
function renderRegionsLevelContent(breakdown, summary) {
  if (!breakdown?.length) return null;
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
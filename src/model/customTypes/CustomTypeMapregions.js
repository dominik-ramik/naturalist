/*
 * MAP REGIONS DATA FORMATS
 *
 * 1. INLINE FORMAT (Single Cell)
 *    Header: [root]  e.g. "map"
 *    Syntax: "RegionCode:Status#Note | RegionCode:Status"
 *
 * 2. MULTICOLUMN FORMAT (Column-per-Region)
 *    Header: [root].[regionCode]  e.g. "map.fr"
 *    Syntax: "Status#Note"
 */

import m from "mithril";
import { helpers } from "./helpers.js";
import { t, tf } from 'virtual:i18n-self';
import { nlDataStructure } from "../DataManagerData.js";
import { Checklist } from "../Checklist.js";
import { processMarkdownWithBibliography, htmlToPlainText } from "../../components/Utils.js";
import { Logger } from "../../components/Logger.js";
import { colorSVGMap } from "../../components/ColorSVGMap.js";
import { FullscreenableMedia } from "../../components/FullscreenableMedia.js";
import { applyHighlight, highlightHtml } from "../HighlightUtils.js";

import {
  parseLegendConfig,
  collectNumericValues,
  computeDatasetStats,
  resolveRegionColor,
  gradientCSSForConfig,
  gradientTicksForConfig,
  steppedBinsForConfig,
  parseNumericStatus,
  isRuntimeResolvedAnchor,
} from "../../components/MapregionsColorEngine.js";

import { filterPluginMapregions } from "../filterPlugins/filterPluginMapregions.js";
import { CacheManager, CacheScope } from "../CacheManager.js";
import { ANALYTICAL_INTENTS } from "../DataStructure.js";
import { Settings } from "../Settings.js";




const nlData = nlDataStructure;

// ─── Legend config cache ──────────────────────────────────────────────────────
// Keyed by dataPath. Invalidate on dataset or language change via CacheManager.

const _legendConfigCache = {};

// Markdown rendering cache - processMarkdownWithBibliography is expensive
// (marked + DOMPurify) and the same note strings recur across renders.
const _mdCache = new Map();

export function clearLegendConfigCache() {
  Object.keys(_legendConfigCache).forEach(k => delete _legendConfigCache[k]);
  _mdCache.clear();
  _resolvedColorCache.clear();
  clearDatasetStatsCache();
  Object.keys(_knownCodesCache).forEach(k => delete _knownCodesCache[k]);
}

function cachedMarkdown(text) {
  if (!_mdCache.has(text)) {
    _mdCache.set(text, processMarkdownWithBibliography(text));
  }
  return _mdCache.get(text);
}

// ─── Resolved color cache ─────────────────────────────────────────────────────
//
// Previous structure: Map<dataPath → Map<`${status}::${statsKey}` → result>>
//   where statsKey was built as:
//     `${stats.min}|${stats.max}|${stats.mean}|${stats.sd}|${stats.sorted.join(",")}`
//   This forced an O(n) string serialisation of the entire sorted numeric array
//   on EVERY call, even when the result was already cached - the dominant cost
//   for large numeric-gradient perspectives.
//
// New structure: Map<dataPath → Map<statsRef | "no-stats" → Map<status → result>>>
//   The datasetStats object is used as a key by reference (object identity).
//   This is O(1) per lookup with zero string construction.
//   clearLegendConfigCache() still wipes the entire outer Map, so invalidation
//   semantics are unchanged.

const _resolvedColorCache = new Map(); // Map<dataPath, Map<statsRef|"no-stats", Map<status, result>>>

export function getCachedRegionColor(status, legendConfig, datasetStats, dataPath) {
  if (!_resolvedColorCache.has(dataPath)) {
    _resolvedColorCache.set(dataPath, new Map());
  }
  const byPath = _resolvedColorCache.get(dataPath);

  // Use the stats object reference directly as the second-level key.
  // "no-stats" is a string constant - always the same identity - and serves
  // as a safe sentinel for the null case.
  const statsRef = datasetStats ?? "no-stats";
  if (!byPath.has(statsRef)) {
    byPath.set(statsRef, new Map());
  }
  const byStats = byPath.get(statsRef);

  if (!byStats.has(status)) {
    byStats.set(status, resolveRegionColor(status, legendConfig, datasetStats));
  }
  return byStats.get(status);
}

const _datasetStatsCache = new Map();

function buildMapregionsDataSignature(data) {
  return Object.entries(data || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, regionData]) => `${code}=${regionData?.status ?? ""}`)
    .join("|");
}

export function clearDatasetStatsCache() {
  _datasetStatsCache.clear();
}

export function getCachedDatasetStats(data, legendConfig, dataPath) {
  const key = dataPath + ":" + buildMapregionsDataSignature(data);
  if (!_datasetStatsCache.has(key)) {
    const numericVals = collectNumericValues(data, legendConfig);
    _datasetStatsCache.set(key, computeDatasetStats(numericVals));
  }
  return _datasetStatsCache.get(key);
}

const _knownCodesCache = {}; // keyed by langCode
function getKnownCodeSet(langCode) {
  if (!_knownCodesCache[langCode]) {
    const data = nlData.sheets.appearance.tables.mapRegionsNames.data[langCode];
    _knownCodesCache[langCode] = new Set(data ? data.map(x => x.code) : []);
  }
  return _knownCodesCache[langCode];
}

// For TabSummary aggregate case: caller collects allNumericValues, we cache the sort.
export function getCachedAggregateStats(allNumericValues, mapPath) {
  const key = mapPath + ":" + allNumericValues.join(",");
  if (!_datasetStatsCache.has(key)) {
    _datasetStatsCache.set(key, computeDatasetStats(allNumericValues));
  }
  return _datasetStatsCache.get(key);
}

/**
 * Exported so TabSummary, FilterDropdownView, and other consumers can share
 * the same cached instance without calling parseLegendConfig on every render.
 */
const _DEFAULT_NO_STATUS_ROW = {
  fill: '#4bc455',
  legend: '',
  appendedLegend: '',
};

export function getLegendConfig(dataPath) {
  if (!_legendConfigCache[dataPath]) {
    const config = parseLegendConfig(
      Checklist.getMapRegionsLegendRows(),
      dataPath
    );
    if (!config.categoryStatusMap.has("\0")) {
      // Inherit the fill from the user-supplied fallback row when present,
      // so that bare-code regions (status==="\0") are colored identically to
      // what the legend swatch will show. Falling back to the hardcoded default
      // only when the user has set no fallback row at all.
      const fallbackFill = config.fallbackRow?.fill ?? _DEFAULT_NO_STATUS_ROW.fill;
      const row = { status: "\0", ..._DEFAULT_NO_STATUS_ROW, fill: fallbackFill };
      config.categoryRows.push(row);
      config.categoryStatusSet.add("\0");
      config.categoryStatusMap.set("\0", row);
    }
    _legendConfigCache[dataPath] = config;
  }
  return _legendConfigCache[dataPath];
}

// ─── Public plugin interface ──────────────────────────────────────────────────

export let customTypeMapregions = {
  dataType: "mapregions",
  expectedColumns: (basePath) => [basePath], // source comes from template, base column only

  readData: function (context, computedPath) {
    const { headers, row, langCode } = context;
    const lowerPath = computedPath.toLowerCase();

    const concernedColumns = headers.filter(h =>
      h === lowerPath || h.toLowerCase().startsWith(lowerPath + ".")
    );

    let resultObject = {};
    const hasChildColumns = concernedColumns.some(col => col.length > lowerPath.length);

    if (concernedColumns.length === 0 || !hasChildColumns) {
      resultObject = parseInlineMapRegions(readSimpleData(context, computedPath));
    } else {
      const childColumnsOnly = concernedColumns.filter(col => col.length > lowerPath.length);
      resultObject = parseColumnMapRegions(childColumnsOnly, context, computedPath);
    }

    const regionNamesData = nlData.sheets.appearance.tables.mapRegionsNames.data[langCode];
    if (!regionNamesData) {
      Logger.error(tf("dm_mapregions_names_table_not_loaded", [computedPath, langCode]));
    } else {
      const knownCodes = getKnownCodeSet(langCode);
      Object.keys(resultObject).forEach(code => {
        if (!knownCodes.has(code)) {
          Logger.error(tf("dm_mapregions_unknown_region_code", [code, computedPath, JSON.stringify(resultObject)]));
        }
      });
    }

    return resultObject;
  },

  getPreloadableAssetPaths: function (mediaItem, rowTemplate, entry) {
    // mapregions: source comes entirely from the template evaluated against
    // the entry - the mediaItem itself carries no source path.
    return [helpers.processSourceForPreload("", rowTemplate, entry)];
  },

  getSearchableText: function (data, uiContext) {
    if (!data || typeof data !== "object") return [];
    const result = [];
    const dataPath = uiContext?.dataPath;
    const legendConfig = dataPath ? getLegendConfig(dataPath) : null;
    const datasetStats = dataPath ? getCachedDatasetStats(data, legendConfig, dataPath) : null;

    Object.keys(data).forEach(regionCode => {
      const regionName = Checklist.nameForMapRegion(regionCode);
      if (regionName && !result.includes(regionName)) result.push(regionName);

      if (!legendConfig) return;

      const status = data[regionCode]?.status ?? "";
      const resolved = getCachedRegionColor(status, legendConfig, datasetStats, dataPath);
      const appendedLegend = (
        resolved?.resolvedAs === "category" ||
        resolved?.resolvedAs === "stepped"
      ) ? resolved?.appendedLegend?.trim() : "";

      if (appendedLegend && !result.includes(appendedLegend)) {
        result.push(appendedLegend);
      }

      const notes = data[regionCode]?.notes;
      if (Array.isArray(notes)) {
        notes.forEach(note => {
          const searchable = htmlToPlainText(processMarkdownWithBibliography(note)).trim();
          if (searchable && !result.includes(searchable)) result.push(searchable);
        });
      }
    });
    return result;
  },

  filterPlugin: filterPluginMapregions,

  extractFilterLeafValues(rawValue) {
    if (!rawValue || typeof rawValue !== "object") return [];
    return Object.keys(rawValue).map(code => Checklist.nameForMapRegion(code));
  },

  toDwC: function (data, subPath) {
    // The mapregions data structure is complex and doesn't have a straightforward mapping to DwC fields. The recommended approach is to use the `media:` directive in DwC export to include the original data as a media file (e.g. JSON or CSV) and document the structure in the metadata. This allows consumers to access the full richness of the data without losing information through an oversimplified mapping.
    return null;
  },

  render: function (data, uiContext) {
    const hl = uiContext?.highlightRegex || null;
    return uiContext.placement === "details"
      ? renderDetailsMap(data, uiContext)
      : renderRegionsList(data, uiContext, hl);
  },
};

// ─── Parsing (unchanged from original) ───────────────────────────────────────

function parseRegionString(inputString) {
  const result = { status: "", notes: [] };
  if (inputString == null) return result;
  const safeStringSource = String(inputString);
  if (safeStringSource.trim() === "") return result;

  const placeholder = "§§HASH_PLACEHOLDER§§";
  const safeString = safeStringSource.replace(/\\#/g, placeholder);
  const parts = safeString.split("#").map(p => p.trim());

  if (parts.length > 0) result.status = parts[0].replace(new RegExp(placeholder, "g"), "#");
  for (let i = 1; i < parts.length; i++) {
    const note = parts[i].replace(new RegExp(placeholder, "g"), "#");
    if (note !== "") result.notes.push(note.replace(/\r?\n/g, " "));
  }
  return result;
}

function parseInlineMapRegions(mapRegions) {
  const result = {};
  if (!mapRegions || mapRegions.trim() === "") return result;

  mapRegions.split("|").map(r => r.trim()).forEach(regionStr => {
    if (!regionStr) return;
    const idxColon = regionStr.indexOf(":");
    const idxHash = regionStr.indexOf("#");
    let splitIndex = -1;
    if (idxColon !== -1 && idxHash !== -1) splitIndex = Math.min(idxColon, idxHash);
    else if (idxColon !== -1) splitIndex = idxColon;
    else if (idxHash !== -1) splitIndex = idxHash;

    let regionCode, tail;
    const isBareCode = splitIndex === -1;
    if (isBareCode) { regionCode = regionStr; tail = ""; }
    else { regionCode = regionStr.substring(0, splitIndex); tail = regionStr.substring(splitIndex); }
    regionCode = regionCode.trim();
    if (!regionCode) return;
    if (tail.startsWith(":")) tail = tail.substring(1);
    const parsed = parseRegionString(tail);
    if (isBareCode) parsed.status = "\0";
    result[regionCode] = parsed;
  });

  return result;
}

function parseColumnMapRegions(concernedColumns, context, computedPath) {
  const result = {};
  concernedColumns.forEach(columnName => {
    const data = readSimpleData(context, columnName);
    if (data && data.toString().trim() !== "") {
      result[columnName.substring(computedPath.length + 1)] = parseRegionString(data.toString());
    }
  });
  return result;
}

function readSimpleData(context, path) {
  const { headers, row, langCode } = context;
  let idx = headers.indexOf(path);
  if (idx < 0) idx = headers.indexOf(path + ":" + langCode);
  return idx >= 0 && row[idx] !== undefined ? row[idx] : null;
}

// ─── Color helpers ───────────────────────────────────────────────────────────

function buildRegionColors(data, legendConfig, datasetStats, fixForWorldMap, dataPath) {
  const regionColors = {};

  Object.keys(data).forEach(regionCode => {
    const regionData = data[regionCode];
    if (!regionData || regionCode.trim() === "") return;

    const result = getCachedRegionColor(regionData.status ?? "", legendConfig, datasetStats, dataPath);
    if (!result) return;

    let key = regionCode;
    if (fixForWorldMap) {
      if (key === "fr") key = "frx";
      if (key === "nl") key = "nlx";
      if (key === "cn") key = "cnx";
    }
    regionColors[key] = result.fill;
  });

  return regionColors;
}

// ─── State ────────────────────────────────────────────────────────────────────

const _tableExpanded = {};

// Debounce map-coloring: at most one pending colorSVGMap timer per mapId.
// Without this, every Mithril redraw schedules a fresh setTimeout whose
// per-closure `colored` flag can never be set by the earlier onload, causing
// O(redraws × maps) redundant colorSVGMap calls after the SVG is first loaded.
const _pendingRecolorTimers = {};

function scheduleColorMap(mapId, regionColors) {
  clearTimeout(_pendingRecolorTimers[mapId]);
  _pendingRecolorTimers[mapId] = window.setTimeout(() => {
    delete _pendingRecolorTimers[mapId];
    const el = document.getElementById(mapId);
    if (el && el.contentDocument) {
      colorSVGMap(el, regionColors);
    }
  }, 50);
}

// ─── Details map ──────────────────────────────────────────────────────────────

function renderDetailsMap(data, uiContext) {
  if (!data || typeof data !== "object") return null;
  const regionCodes = Object.keys(data);
  if (!regionCodes.length) return null;

  const dataPath = uiContext.dataPath;
  const legendConfig = getLegendConfig(dataPath);
  const datasetStats = getCachedDatasetStats(data, legendConfig, dataPath);

  let source = "";
  if (uiContext.meta.template && uiContext.meta.template !== "") {
    source = uiContext.meta.template;
    if (Checklist.handlebarsTemplates[dataPath]) {
      const td = Checklist.getDataObjectForHandlebars("", uiContext.originalData, uiContext.taxon.name, uiContext.taxon.authority);
      source = Checklist.handlebarsTemplates[dataPath](td);
    }
  }
  if (!source || source.trim() === "") return null;
  if (source.startsWith("/")) source = source.substring(1);

  const mapId = "map_" + dataPath.replace(/\./g, "_");
  const isWorld = source.toLowerCase().endsWith("world.svg");

  const regionColors = buildRegionColors(data, legendConfig, datasetStats, isWorld, dataPath);
  scheduleColorMap(mapId, regionColors);

  return m(".media-map", [
    m(".media-map-card", [
      m(FullscreenableMedia, {
        type: 'svg-object',
        fullSrc: `usercontent/${source}`,
        svgId: mapId,
        oncreate: function (vnode) {
          // Native listener avoids a Mithril auto-redraw on SVG load.
          vnode.dom.addEventListener("load", function () {
            clearTimeout(_pendingRecolorTimers[mapId]);
            delete _pendingRecolorTimers[mapId];
            colorSVGMap(vnode.dom, regionColors);
          });
        },
      }),
      renderMapLegend(legendConfig, datasetStats, data),
      renderMapDataTable(data, dataPath, legendConfig, datasetStats, mapId),
    ]),
  ]);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Format a number for compact display in legend/stats annotations.
 * Strips trailing zeros; adapts decimal precision to magnitude.
 */
const fmtNum = n => {
  if (n == null || isNaN(n)) return '';
  const abs = Math.abs(n);
  const dec = abs >= 1000 ? 0 : abs >= 10 ? 1 : abs >= 0.1 ? 2 : 3;
  return parseFloat(n.toFixed(dec)).toString();
};

/**
 * Returns true when at least one numeric row in the legend config uses an
 * anchor whose resolved value is unknowable at design time (i.e. any relative
 * anchor: %, p, s, or A5 with a modifier). Used to decide whether to render
 * the per-taxon scale notice below the legend.
 */
function hasRuntimeResolvedAnchors(numericRows) {
  return numericRows.some(r => isRuntimeResolvedAnchor(r.anchor));
}

/**
 * Return region codes sorted according to display rules:
 *   – No numeric mode → mapRegionsNames default order.
 *   – Numeric only    → highest value first.
 *   – Mixed           → category rows (default order) then numeric rows (value desc).
 */
function sortedRegionCodes(data, legendConfig) {
  const { numericMode, categoryStatusSet } = legendConfig;
  const codes = Object.keys(data);

  const namesMeta = Checklist.getMapRegionsNamesMeta() || [];
  const posMap = new Map(namesMeta.map((x, i) => [x.code, i]));
  const defaultPos = code => posMap.get(code) ?? Infinity;

  if (!numericMode) {
    return [...codes].sort((a, b) => defaultPos(a) - defaultPos(b));
  }

  const isCat = code => categoryStatusSet.has(data[code]?.status ?? '');
  const cats = codes.filter(isCat).sort((a, b) => defaultPos(a) - defaultPos(b));
  const nums = codes.filter(c => !isCat(c)).sort((a, b) => {
    const va = parseNumericStatus(data[a]?.status ?? '') ?? -Infinity;
    const vb = parseNumericStatus(data[b]?.status ?? '') ?? -Infinity;
    return vb - va; // highest first
  });

  return cats.length && nums.length ? [...cats, ...nums] : cats.length ? cats : nums;
}

/**
 * Render a statistical appendix below the data table.
 * Shows category counts (with color swatches) and/or numeric summary stats.
 */
function renderTableStats(data, legendConfig, datasetStats) {
  const { numericMode, categoryRows, categoryStatusSet } = legendConfig;
  const groups = [];

  // ── Category counts ────────────────────────────────────────────────────────
  if (categoryRows.length) {
    const counts = new Map();
    Object.values(data).forEach(rd => {
      const s = rd?.status ?? '';
      if (categoryStatusSet.has(s)) counts.set(s, (counts.get(s) || 0) + 1);
    });
    const present = categoryRows.filter(r => counts.has(r.status));
    if (present.length) {
      groups.push(m('.map-stats-group', present.map(r =>
        m('.map-stats-row', [
          m('span.map-data-table-dot', { style: { backgroundColor: r.fill } }),
          m('span.map-stats-label', r.legend || r.status),
          m('span.map-stats-value', String(counts.get(r.status))),
        ])
      )));
    }
  }

  // ── Numeric summary ────────────────────────────────────────────────────────
  if (numericMode && datasetStats) {
    const { min, max, mean, sorted } = datasetStats;
    const n = sorted.length;
    const median = n % 2 === 1
      ? sorted[Math.floor(n / 2)]
      : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

    const statRows = [
      { key: 'max', label: t('map_stats_max'), value: max },
      { key: 'mean', label: t('map_stats_mean'), value: mean },
      { key: 'median', label: t('map_stats_median'), value: median },
      { key: 'min', label: t('map_stats_min'), value: min },
    ];

    groups.push(m('.map-stats-group', statRows.map(({ label, value }) => {
      const fill = resolveRegionColor(String(value), legendConfig, datasetStats)?.fill ?? '#ccc';
      return m('.map-stats-row', [
        m('span.map-data-table-dot', { style: { backgroundColor: fill } }),
        m('span.map-stats-label', label),
        m('span.map-stats-value', fmtNum(value)),
      ]);
    })));
  }

  return groups.length ? m('.map-stats-appendix', groups) : null;
}

// ─── Legend ───────────────────────────────────────────────────────────────────

/**
 * Render the map legend.
 *
 * Gradient mode: continuous color ramp with tick marks pinned at each
 * anchor's proportional position.  With ≤2 ticks all labels go below;
 * with ≥3 ticks labels alternate below/above to avoid crowding.
 * Resolved dataset values are appended in grey parentheses.
 *
 * Stepped mode: color swatch + label + resolved range per bin.
 * Category rows always follow numeric rows.
 */
function renderMapLegend(legendConfig, datasetStats, data) {
  const { categoryRows, numericRows, numericMode, fallbackRow } = legendConfig;

  const presentStatuses = new Set(Object.values(data).map(r => r?.status ?? ''));

  // Statuses explicitly covered by a non-fallback category row.
  // "\0" is the internal sentinel for bare-code regions (no status given) and
  // is semantically the fallback case - exclude it here just like "".
  const explicitlyCoveredStatuses = new Set(
    categoryRows.filter(r => r.status !== '' && r.status !== '\0').map(r => r.status)
  );

  // The fallback row should appear when at least one present status is not
  // matched by any explicit row or by the numeric mode (gradient/stepped).
  // "\0" (bare-code) and "" both count as "using the fallback", so neither
  // should suppress fallbackIsActive.
  const fallbackIsActive = [...presentStatuses].some(
    s => s !== '' && s !== '\0' && !explicitlyCoveredStatuses.has(s) && !(numericMode && parseNumericStatus(s) !== null)
  ) || presentStatuses.has('\0');

  // Only render explicit (non-fallback, non-sentinel) category rows inline.
  const presentCatRows = categoryRows.filter(r => {
    if (r.status === '' || r.status === '\0') return false; // handled by fallback block below
    return presentStatuses.has(r.status);
  });

  const items = [];

  if (numericMode === 'gradient') {
    const css = gradientCSSForConfig(numericRows, datasetStats);
    const ticks = gradientTicksForConfig(numericRows, datasetStats);
    if (css && ticks.length >= 2) {
      // alternate below/above for ≥3 ticks; ≤2 → all below.
      const hasAbove = ticks.length > 2;
      const ticksIdx = ticks.map((t, i) => ({ ...t, idx: i }));
      const belowTicks = hasAbove ? ticksIdx.filter(t => t.idx % 2 === 0) : ticksIdx;
      const aboveTicks = hasAbove ? ticksIdx.filter(t => t.idx % 2 === 1) : [];

      // label renderer - first always left, last always right,
      // resolved value in grey parentheses.
      const renderLabel = (t, total) => {
        const isFirst = t.idx === 0;
        const isLast = t.idx === total - 1;
        const align = isFirst ? 'left' : isLast ? 'right' : 'center';
        const tx = align === 'left' ? '0%' : align === 'right' ? '-100%' : '-50%';
        return m('span.map-gradient-label', {
          style: { left: t.pct.toFixed(2) + '%', transform: `translateX(${tx})` },
          class: (isFirst || isLast) ? 'map-gradient-label--edge' : 'map-gradient-label--mid',
        }, [
          t.legend,
          t.resolved != null
            ? m('span.map-gradient-label-value', ` (${isFirst ? '\u2264' : isLast ? '\u2265' : ''}${fmtNum(t.resolved)})`)
            : null,
        ]);
      };

      const tickEl = (t, above = false) =>
        m('.map-gradient-tick' + (above ? '.map-gradient-tick--above' : ''),
          { style: { left: t.pct.toFixed(2) + '%' } });

      items.push(m('.legend-item.legend-item--gradient',
        m('.map-gradient-widget', [
          hasAbove
            ? m('.map-gradient-labels.map-gradient-labels--above',
              aboveTicks.map(t => renderLabel(t, ticks.length)))
            : null,
          m('.map-gradient-ramp', { style: { background: css } },
            [...belowTicks.map(t => tickEl(t)), ...aboveTicks.map(t => tickEl(t, true))]
          ),
          m('.map-gradient-labels.map-gradient-labels--below',
            belowTicks.map(t => renderLabel(t, ticks.length))),
        ])
      ));
    }

  } else if (numericMode === 'stepped') {
    // show resolved range [binLo – binHi) in grey parentheses.
    const bins = steppedBinsForConfig(numericRows, datasetStats);
    bins.forEach((bin, i) => {
      const nextResolved = bins[i + 1]?.resolved;
      const rangeStr = bin.resolved != null
        ? (nextResolved != null
          ? `${i === 0 ? '≤' : ''}${fmtNum(bin.resolved)}–${fmtNum(nextResolved)}`
          : `≥${fmtNum(bin.resolved)}`)
        : null;
      items.push(m('.legend-item', [
        m('.map-fill', { style: { backgroundColor: bin.fill } }),
        m('.map-legend-title', [
          bin.legend,
          rangeStr ? m('span.map-legend-resolved-value', ` (${rangeStr})`) : null,
        ]),
      ]));
    });
  }

  if (numericMode && hasRuntimeResolvedAnchors(numericRows)) {
    items.push(m('.map-legend-scale-notice', m.trust(tf('map_legend_scale_per_taxon', [
      (ANALYTICAL_INTENTS.find(i => i.id === Settings.analyticalIntent()) || ANALYTICAL_INTENTS[0]).single,
    ]))));
  }

  presentCatRows.forEach(r => {
    items.push(m('.legend-item', [
      m('.map-fill', { style: { backgroundColor: r.fill } }),
      m('.map-legend-title', r.legend),
    ]));
  });

  if (fallbackIsActive && fallbackRow?.legend) {
    items.push(m('.legend-item', [
      m('.map-fill', { style: { backgroundColor: fallbackRow.fill } }),
      m('.map-legend-title', fallbackRow.legend),
    ]));
  }

  return items.length ? m('.legend.media-map-legend', items) : null;
}

// ─── Data table ───────────────────────────────────────────────────────────────

function renderMapDataTable(data, dataPath, legendConfig, datasetStats, mapId) {
  const isExpanded = !!_tableExpanded[mapId];
  // sorted region codes (default order / gradient desc / mixed)
  const regionCodes = sortedRegionCodes(data, legendConfig);
  const hasNotes = regionCodes.some(rc => data[rc].notes?.length > 0);

  const toggleTable = e => {
    let sc = e.currentTarget.parentElement;
    while (sc) {
      const oy = window.getComputedStyle(sc).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      sc = sc.parentElement;
    }
    const savedTop = sc ? sc.scrollTop : 0;

    _tableExpanded[mapId] = !_tableExpanded[mapId];
    e.stopPropagation();

    if (sc) requestAnimationFrame(() => { sc.scrollTop = savedTop; });
  };

  return m('.map-data-table-wrap', [
    m('.map-data-table-header', { onclick: toggleTable }, [
      m('span.map-data-table-toggle', isExpanded ? '▲' : '▼'),
      m('span.map-data-table-header-label', t('map_data_table')),
      m('span.map-data-table-count', tf('map_data_table_count', [regionCodes.length], true)),
    ]),
    isExpanded ? m('.map-data-table-body', [
      // statistical appendix
      renderTableStats(data, legendConfig, datasetStats),
      m('table.map-data-table', [
        m('thead', m('tr', [
          m('th.map-data-table-th', t('map_data_table_region')),
          m('th.map-data-table-th', t('map_data_table_status')),
          hasNotes ? m('th.map-data-table-th', t('map_data_table_notes')) : null,
        ])),
        m('tbody', regionCodes.map((regionCode, index) => {
          const regionData = data[regionCode];
          const resolved = getCachedRegionColor(regionData.status ?? '', legendConfig, datasetStats, dataPath);
          const rawStatus = regionData.status ?? '';

          // stepped shows bin label + actual value in parentheses.
          // Gradient shows the raw value. Category/fallback shows legend label.
          const statusCell = (() => {
            if (!resolved) return rawStatus;
            if (resolved.resolvedAs === 'gradient') return rawStatus;
            if (resolved.resolvedAs === 'stepped') {
              return [
                resolved.legend,
                rawStatus ? m('span.map-data-table-value-actual', ` (${rawStatus})`) : null,
              ];
            }
            return resolved.legend ?? rawStatus;
          })();

          return m('tr.map-data-table-row' + (index % 2 === 0 ? '.map-data-table-row-even' : ''), [
            m('td.map-data-table-td', Checklist.nameForMapRegion(regionCode)),
            m('td.map-data-table-td', [
              m('span.map-data-table-dot', { style: { backgroundColor: resolved?.fill ?? '#ccc' } }),
              m('span', statusCell),
            ]),
            hasNotes ? m('td.map-data-table-td.map-data-table-td-notes', m.trust(((regionData.notes.map(note => processMarkdownWithBibliography(note))) || []).join('; '))) : null,
          ]);
        })),
      ]),
    ]) : null,
  ]);
}

// ─── Regions list ─────────────────────────────────────────────────────────────

function renderRegionsList(data, uiContext, hl) {
  const dataPath = uiContext.dataPath;
  const legendConfig = getLegendConfig(dataPath);
  const datasetStats = getCachedDatasetStats(data, legendConfig, dataPath);

  const uniqueNotesMap = new Map();
  const uniqueNotesList = [];
  let noteCounter = 1;

  function registerNote(rawNote) {
    if (!rawNote?.trim()) return null;
    const processed = cachedMarkdown(rawNote.trim());
    if (!uniqueNotesMap.has(processed)) {
      uniqueNotesMap.set(processed, noteCounter);
      uniqueNotesList.push(processed);
      noteCounter++;
    }
    return uniqueNotesMap.get(processed);
  }

  // ── Determine ordered region codes ────────────────────────────────────────
  // Each item: { regionCode: string, groupLabel: string|null }
  // groupLabel is non-null only on the first region of each new group.
  const orderedItems = [];
  const meta = Checklist.getMetaForDataPath(dataPath);
  const searchCategoryOrder = meta?.searchCategoryOrder;
  const hasOrder = Array.isArray(searchCategoryOrder) && searchCategoryOrder.length > 0;

  if (hasOrder) {
    // searchCategoryOrder entries use region *names* as their title (matching what
    // extractFilterLeafValues and the filter dropdown expose to the user), not the
    // raw region codes that key the data object.  Build a reverse name→code map so
    // we can resolve each entry back to a data key.
    const nameToCode = new Map();
    Object.keys(data).forEach(code => {
      nameToCode.set(Checklist.nameForMapRegion(code), code);
    });

    // Unique sentinel: ensures the very first group always emits its label.
    const UNSET = Symbol();
    let prevGroup = UNSET;
    const coveredCodes = new Set();

    for (const entry of searchCategoryOrder) {
      const code = nameToCode.get(entry.title); // entry.title is the region name
      if (code === undefined) continue; // name not present in this taxon's data
      coveredCodes.add(code);
      // Treat a missing/empty group string as null (no label).
      const group = (entry.group != null && entry.group !== "") ? entry.group : null;
      // Emit the group label only when the group changes.
      const groupLabel = (group !== prevGroup) ? group : null;
      orderedItems.push({ regionCode: code, groupLabel });
      prevGroup = group;
    }

    // Append any region codes present in data but absent from searchCategoryOrder,
    // preserving their original insertion order (same as the no-order path).
    Object.keys(data)
      .filter(code => !coveredCodes.has(code))
      .forEach(code => orderedItems.push({ regionCode: code, groupLabel: null }));
  } else {
    // No searchCategoryOrder: preserve existing Object.keys insertion order.
    Object.keys(data).forEach(code => orderedItems.push({ regionCode: code, groupLabel: null }));
  }

  if (!orderedItems.length) return null;

  // ── Render regions, interleaving group labels ──────────────────────────────
  const fd = uiContext?.filterDef || Checklist.filter.data[uiContext.dataPath] || null;
  const sfStatuses = fd?.statusFilter?.selectedStatuses;
  const statusRange = fd?.statusFilter || null;

  const contentItems = [];
  let isFirst = true;

  orderedItems.forEach(({ regionCode, groupLabel }) => {
    const regionInfo = data[regionCode];
    const status = regionInfo.status ?? "";
    const resolved = getCachedRegionColor(status, legendConfig, datasetStats, dataPath);

    // Per spec §4.6:
    //   category → show appendedLegend from the matched row (may be empty - intentional)
    //   stepped  → show appendedLegend from the matched bin if non-empty;
    //              fall back to the raw numeric value if appendedLegend is empty
    //   gradient → always show the raw numeric value (appendedLegend is never used)
    //   fallback → no appended text
    let appendedLegend = "";
    if (resolved?.resolvedAs === 'gradient') {
      const rawVal = status.trim();
      if (rawVal) {
        appendedLegend = cachedMarkdown(" _(" + rawVal + ")_");
      }
    } else if (resolved?.resolvedAs === 'stepped') {
      const binLabel = resolved.appendedLegend?.trim();
      const text = binLabel || status.trim();
      if (text) {
        appendedLegend = cachedMarkdown(" _(" + text + ")_");
      }
    } else if (resolved?.resolvedAs === 'category') {
      if (resolved.appendedLegend?.trim()) {
        appendedLegend = cachedMarkdown(" _(" + resolved.appendedLegend + ")_");
      }
      // empty appendedLegend on a category row is intentional - show nothing
    }

    const regionName = Checklist.nameForMapRegion(regionCode);
    const notesArray = Array.isArray(regionInfo.notes) ? regionInfo.notes : (regionInfo.notes ? [regionInfo.notes] : []);
    const footnoteIndices = notesArray.map(registerNote).filter(i => i !== null);

    // For the region filter, fd.selected contains names - the hl regex covers them.
    // For the status filter, check exact match against the raw status code to avoid
    // substring false-positives (e.g. "v" matching inside "vagrant").
    const statusIsSelected = sfStatuses?.length > 0 && sfStatuses.includes(status);
    const numericStatus = parseNumericStatus(status);
    const statusIsInNumericRange = numericStatus !== null &&
      statusRange !== null &&
      (statusRange.rangeMin !== null || statusRange.rangeMax !== null) &&
      (statusRange.rangeMin === null || numericStatus >= statusRange.rangeMin) &&
      (statusRange.rangeMax === null || numericStatus <= statusRange.rangeMax);

    const regionContent = [m("span.region-name", applyHighlight(regionName, hl))];
    if (footnoteIndices.length > 0) regionContent.push(m("sup", footnoteIndices.sort((a, b) => a - b).join(",")));
    if (appendedLegend) {
      regionContent.push(
        (statusIsSelected || statusIsInNumericRange)
          ? m("em", m("mark.search-highlight", m.trust(appendedLegend)))
          : m("em", m.trust(highlightHtml(appendedLegend, hl)))
      );
    }

    // Comma separator before every region except the first; no comma before a new group.
    if (!isFirst) contentItems.push(groupLabel != null ? " " : ", ");
    // Group label (plain text, followed by ": ") at the start of each new group.
    if (groupLabel != null) contentItems.push(m("span.region-group-label", groupLabel));
    contentItems.push(m("span.region-content", regionContent));
    isFirst = false;
  });

  const footnotesElements = uniqueNotesList.map((noteHtml, index) =>
    m(".region-footnote", [
      m("sup.region-footnotes-number", (index + 1).toString()),
      "\u00A0",
      m.trust(highlightHtml(noteHtml, hl)),
    ])
  );

  return m(".map-regions-data", [
    m("span", contentItems),
    footnotesElements.length ? m(".region-footnotes", footnotesElements) : null,
  ]);
}

CacheManager.subscribe("customTypes.mapregions", {
  scopes: [CacheScope.DATASET, CacheScope.LANGUAGE],
  description: "Mapregions legend, markdown, color, stats, and known-code caches.",
  clear: clearLegendConfigCache,
});
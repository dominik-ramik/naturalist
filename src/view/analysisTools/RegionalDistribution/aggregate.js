/**
 * RegionalDistribution - aggregate computation
 *
 * Pure functions; no Mithril, no DOM, no module-level state.
 * All impure dependencies (Checklist, etc.) are referenced via closures
 * passed in by the caller so these functions stay testable.
 */

import { Checklist } from '../../../model/Checklist.js';
import {
  computeDatasetStats,
  resolveRegionColor,
  parseNumericStatus,
} from '../../../components/MapregionsColorEngine.js';
import { OCCURRENCE_IDENTIFIER } from '../../../model/DataStructure.js';
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { getDataFromDataPath } from '../../../model/DataPath.js';
import { resolveToHex } from '../../../components/Utils.js';

// ─── Segment detection ────────────────────────────────────────────────────────

/**
 * Analyse a parsed legendConfig and describe what data flavours are present.
 *
 * @returns {{
 *   hasNumeric: boolean,
 *   numericMode: 'gradient'|'stepped'|null,
 *   namedCategories: Array<{status,fill,legend,appendedLegend}>,
 *   hasFallback: boolean,
 *   isPresenceOnly: boolean,   // pure presence/absence - no status distinctions
 * }}
 */
export function detectSegments(legendConfig) {
  const { numericMode, categoryRows, fallbackRow } = legendConfig;
  const namedCategories = categoryRows.filter(r => r.status);
  return {
    hasNumeric: numericMode !== null,
    numericMode,
    namedCategories,
    hasFallback: !!fallbackRow,
    isPresenceOnly: !numericMode && namedCategories.length === 0,
  };
}

// ─── Numeric operations catalogue ────────────────────────────────────────────

/**
 * Metadata for every supported numeric aggregate operation.
 *
 * usesLegendScale  – true when the result is in the same domain as the
 *                    original data values and the legend color ramp applies.
 * usesDenominator  – true when the result is a record count that can be
 *                    expressed as a % of filter / region / total.
 * usesThreshold    – true when an extra threshold input is required.
 */
export const NUMERIC_OPERATIONS = [
  { id: 'count', labelKey: 'rd_op_count', usesLegendScale: false, usesDenominator: true, usesThreshold: false, resultIsPercent: false },
  { id: 'sum', labelKey: 'rd_op_sum', usesLegendScale: false, usesDenominator: false, usesThreshold: false, resultIsPercent: false },
  { id: 'mean', labelKey: 'rd_op_mean', usesLegendScale: true, usesDenominator: false, usesThreshold: false, resultIsPercent: false },
  { id: 'median', labelKey: 'rd_op_median', usesLegendScale: true, usesDenominator: false, usesThreshold: false, resultIsPercent: false },
  { id: 'min', labelKey: 'rd_op_min', usesLegendScale: true, usesDenominator: false, usesThreshold: false, resultIsPercent: false },
  { id: 'max', labelKey: 'rd_op_max', usesLegendScale: true, usesDenominator: false, usesThreshold: false, resultIsPercent: false },
  { id: 'stddev', labelKey: 'rd_op_stddev', usesLegendScale: false, usesDenominator: false, usesThreshold: false, resultIsPercent: false },
  { id: 'pct_above', labelKey: 'rd_op_pct_above', usesLegendScale: false, usesDenominator: false, usesThreshold: true, resultIsPercent: true },
  { id: 'pct_below', labelKey: 'rd_op_pct_below', usesLegendScale: false, usesDenominator: false, usesThreshold: true, resultIsPercent: true },
];

export function getOperationMeta(id) {
  return NUMERIC_OPERATIONS.find(o => o.id === id) ?? NUMERIC_OPERATIONS.find(o => o.id === 'mean');
}

// ─── Data collection ──────────────────────────────────────────────────────────

/**
 * For each terminal leaf, extract its map data for `dataPath` and accumulate
 * per-region collections of status strings and numeric values.
 *
 * @returns {Object}  regionCode → { statuses, numerics, records }
 *   statuses  – every raw status string present across all leaves
 *   numerics  – subset that parsed as numbers (via parseNumericStatus)
 *   records   – [{name, status, numeric|null}] for drill-down display
 */
export function collectRegionData(leaves, dataPath, mode, occurrenceMetaIndex) {
  const map = {};

  leaves.forEach(leaf => {
    const effectiveD = mode === OCCURRENCE_IDENTIFIER
      ? Checklist.getEffectiveDataForNode(leaf, occurrenceMetaIndex, leaves)
      : leaf.d;
    const mapData = getDataFromDataPath(effectiveD, dataPath);
    if (!mapData || typeof mapData !== 'object') return;

    const name = leafDisplayName(leaf);
    Object.entries(mapData).forEach(([code, regionData]) => {
      const status = regionData?.status ?? '';
      const numeric = parseNumericStatus(status);
      if (!map[code]) map[code] = { statuses: [], numerics: [], records: [] };
      map[code].statuses.push(status);
      if (numeric !== null) map[code].numerics.push(numeric);
      map[code].records.push({ name, status, numeric, regionCode: code });
    });
  });

  return map;
}

function leafDisplayName(leaf) {
  for (let i = leaf.t.length - 1; i >= 0; i--) {
    if (leaf.t[i]?.name) return leaf.t[i].name;
  }
  return '?';
}

// ─── Region groups ────────────────────────────────────────────────────────────

/**
 * Return groups declared in the map column's searchCategoryOrder.
 *
 * The searchCategoryOrder is a flat array of `{group, title}` entries where
 * `group` is a shared group heading and `title` is a region name.
 * We derive groups by collecting unique non-empty `group` values and gathering
 * their member `title` values.
 *
 * @returns {Array<{title: string, names: string[]}>}
 */
export function getRegionGroups(dataPath) {
  const order = Checklist.getMetaForDataPath?.(dataPath)?.searchCategoryOrder ?? [];
  const seen = new Set();
  const groups = [];
  for (const entry of order) {
    if (entry.group && !seen.has(entry.group)) {
      seen.add(entry.group);
      groups.push(entry.group);
    }
  }
  return groups.map(groupTitle => ({
    title: groupTitle,
    names: order.filter(e => e.group === groupTitle).map(e => e.title),
  }));
}

/**
 * Merge individual region entries (keyed by code) into group buckets.
 *
 * Groups list region **names** from searchCategoryOrder.  We resolve them back
 * to region codes via Checklist.nameForMapRegion so they can match regionMap
 * keys.  If an item is already a code that exists in regionMap (legacy / future
 * data), it is accepted directly as a fallback.
 *
 * Regions not covered by any group are passed through under their original key.
 *
 * @returns {{ groupedMap, groupIndex }}
 *   groupedMap – keyed by group title (or original code for ungrouped regions)
 *   groupIndex – groupTitle → [region codes that contributed data]
 */
export function mergeToGroups(regionMap, groups) {
  if (!groups.length) return { groupedMap: regionMap, groupIndex: {} };

  // Reverse map: lowercased region name → code (for groups that use names)
  const nameToCode = {};
  Object.keys(regionMap).forEach(code => {
    const name = Checklist.nameForMapRegion(code);
    if (name) nameToCode[name.toLowerCase()] = code;
  });

  // Resolve a group item (name or code) to the actual code key in regionMap.
  const resolveCode = item => {
    if (!item) return null;
    if (regionMap[item]) return item;                           // direct code hit
    return nameToCode[item.toLowerCase()] ?? null;             // name lookup
  };

  const used = new Set();
  const grouped = {};
  const groupIdx = {};

  groups.forEach(g => {
    const memberCodes = (g.names ?? [])
      .map(resolveCode)
      .filter(code => code !== null && regionMap[code]);

    if (!memberCodes.length) return;

    const merged = { statuses: [], numerics: [], records: [], _isGroup: true, memberCodes };
    memberCodes.forEach(code => {
      merged.statuses.push(...regionMap[code].statuses);
      merged.numerics.push(...regionMap[code].numerics);
      merged.records.push(...regionMap[code].records);
      used.add(code);
    });
    grouped[g.title] = merged;
    groupIdx[g.title] = memberCodes;
  });

  // Pass ungrouped regions through unchanged
  Object.entries(regionMap).forEach(([code, data]) => {
    if (!used.has(code)) grouped[code] = data;
  });

  return { groupedMap: grouped, groupIndex: groupIdx };
}

// ─── Aggregate computation ────────────────────────────────────────────────────

const NUMERIC_FNS = {
  sum: nums => nums.reduce((a, b) => a + b, 0),
  mean: nums => nums.reduce((a, b) => a + b, 0) / nums.length,
  median: nums => { const s = [...nums].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; },
  min: nums => Math.min(...nums),
  max: nums => Math.max(...nums),
  stddev: nums => { const avg = nums.reduce((a, b) => a + b, 0) / nums.length; return Math.sqrt(nums.reduce((a, v) => a + (v - avg) ** 2, 0) / nums.length); },
};

/**
 * Compute a single aggregate value for one region's collected data.
 * Returns null when the region should be omitted from results
 * (e.g. no numeric data when a numeric operation is requested).
 *
 * @returns {{ value, count, recordCount, excluded } | null}
 *   value       – the aggregate scalar used for color and display
 *   count       – records that contributed to `value`
 *   recordCount – all records in this region (including non-contributing)
 *   excluded    – records with non-numeric status when track is numeric
 */
function aggregateRegion(data, segmentTrack, categoryStatus, numericOperation, threshold) {
  if (segmentTrack === 'numeric') {
    const excluded = data.statuses.length - data.numerics.length;

    if (numericOperation === 'count') {
      // Count only records that have a numeric value (consistent with every other
      // numeric operation which operates exclusively on data.numerics).
      // For groups a leaf can appear in multiple member regions; deduplicate by name.
      if (!data.numerics.length) return null;
      const count = data._isGroup
        ? new Set(data.records.filter(r => r.numeric !== null).map(r => r.name)).size
        : data.numerics.length;
      return { value: count, count, recordCount: data.statuses.length, excluded };
    }
    if (numericOperation === 'pct_above') {
      if (!data.numerics.length) return null;
      return { value: data.numerics.filter(n => n > threshold).length / data.numerics.length * 100, count: data.numerics.length, recordCount: data.statuses.length, excluded };
    }
    if (numericOperation === 'pct_below') {
      if (!data.numerics.length) return null;
      return { value: data.numerics.filter(n => n < threshold).length / data.numerics.length * 100, count: data.numerics.length, recordCount: data.statuses.length, excluded };
    }
    if (!data.numerics.length) return null;
    const fn = NUMERIC_FNS[numericOperation] ?? NUMERIC_FNS.mean;
    return { value: fn(data.numerics), count: data.numerics.length, recordCount: data.statuses.length, excluded };
  }

  // Category / presence track
  // For groups a leaf can appear in multiple member regions; deduplicate by name.
  if (data._isGroup) {
    const uniqueLeafNames = new Set(data.records.map(r => r.name));
    const matching = categoryStatus
      ? new Set(data.records.filter(r => r.status === categoryStatus).map(r => r.name)).size
      : uniqueLeafNames.size;
    if (matching === 0) return null;
    return { value: matching, count: matching, recordCount: uniqueLeafNames.size, excluded: 0 };
  }

  const matching = categoryStatus
    ? data.statuses.filter(s => s === categoryStatus).length
    : data.statuses.length;
  if (matching === 0) return null;
  return { value: matching, count: matching, recordCount: data.statuses.length, excluded: 0 };
}

/**
 * Compute per-region aggregate results for the whole working map.
 * @returns {Object}  key → { value, count, recordCount, excluded }
 */
export function computeRegionAggregates(regionMap, segmentTrack, categoryStatus, numericOperation, threshold) {
  const result = {};
  Object.entries(regionMap).forEach(([key, data]) => {
    const agg = aggregateRegion(data, segmentTrack, categoryStatus, numericOperation, threshold);
    if (agg) result[key] = agg;
  });
  return result;
}

// ─── Baseline counts (denominator support) ───────────────────────────────────

/**
 * Scan all leaves and count per-region presences.
 *
 * @returns {Object}  { regionCode: count, ..., __total__: totalLeavesWithMapData }
 *   __total__ = leaves that have at least one region entry in this map column.
 */
export function computeAllRegionCounts(allLeaves, dataPath, mode, occurrenceMetaIndex) {
  const counts = { __total__: 0 };
  const leafSets = {};   // regionCode → Set<leafName> - used by buildEffectiveAllCounts for groups
  const seen = new Set();

  allLeaves.forEach(leaf => {
    const effectiveD = mode === OCCURRENCE_IDENTIFIER
      ? Checklist.getEffectiveDataForNode(leaf, occurrenceMetaIndex, allLeaves)
      : leaf.d;
    const mapData = getDataFromDataPath(effectiveD, dataPath);
    if (!mapData || typeof mapData !== 'object' || !Object.keys(mapData).length) return;

    const name = leafDisplayName(leaf);
    if (!seen.has(name)) { seen.add(name); counts.__total__++; }
    Object.keys(mapData).forEach(code => {
      counts[code] = (counts[code] || 0) + 1;
      if (!leafSets[code]) leafSets[code] = new Set();
      leafSets[code].add(name);
    });
  });

  counts.__leafSets__ = leafSets;
  return counts;
}

/**
 * When groups are active, re-map the per-region counts to per-group counts.
 * The `__total__` key is preserved unchanged (it refers to all leaves, not regions).
 */
export function buildEffectiveAllCounts(allRegionCounts, regionData) {
  const result = { __total__: allRegionCounts.__total__ };
  const leafSets = allRegionCounts.__leafSets__ ?? {};
  Object.entries(regionData).forEach(([key, data]) => {
    if (data._isGroup && data.memberCodes) {
      // Union the per-region leaf-name sets so each leaf is counted only once
      // even if it appears in multiple member regions.
      const union = new Set();
      data.memberCodes.forEach(c => (leafSets[c] ?? new Set()).forEach(n => union.add(n)));
      result[key] = union.size;
    } else {
      result[key] = allRegionCounts[key] || 0;
    }
  });
  return result;
}

// ─── Color computation ───────────────────────────────────────────────────────

const DEFAULT_COLOR = '#55769b';  // --nlblue
const MIN_INTENSITY = 0.12;       // lightest shade is never pure white

function fadeToWhite(hex, t) {
  hex = resolveToHex((hex || '').toString().trim());

  const h = hex.replace('#', '').padStart(6, '0');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  const blend = c => Math.min(255, Math.max(0, Math.round(255 + (c - 255) * t)));
  return '#' + [r, g, b].map(c => blend(c).toString(16).padStart(2, '0')).join('');
}

export function computeRatio(value, key, denominator, filteredCount, effectiveAllCounts) {
  switch (denominator) {
    case 'region': {
      const regionTotal = effectiveAllCounts[key] ?? 0;
      return regionTotal > 0 ? value / regionTotal : 0;
    }
    case 'total': return effectiveAllCounts.__total__ > 0 ? value / effectiveAllCounts.__total__ : 0;
    default: return filteredCount > 0 ? value / filteredCount : 0;  // 'filter'
  }
}

/**
 * Compute a CSS color string for each region key.
 *
 * Strategy:
 *   numeric + legend-compatible op (mean/median/min/max):
 *     → resolve through the legend color engine using aggregate-level stats.
 *       Semantically correct because the result is still in the original data
 *       domain (e.g. a mean pH is still measured in pH).
 *
 *   everything else (category counts, numeric count/sum/stddev/pct_*):
 *     → relative intensity fading from white to the base color.
 *       Ratios are scaled relative to each other so the highest-value region
 *       always appears at full color, giving visual discrimination even when
 *       absolute percentages are low.
 */
export function computeColorMapping(
  regionAggregates,
  segmentTrack, numericOperation,
  legendConfig,
  denominator, filteredCount, effectiveAllCounts,
  categoryStatus,
) {
  if (!Object.keys(regionAggregates).length) return {};

  const opMeta = getOperationMeta(numericOperation);

  // ── Legend-scale path ──
  if (segmentTrack === 'numeric' && opMeta.usesLegendScale) {
    const allValues = Object.values(regionAggregates).map(r => r.value);
    const aggStats = computeDatasetStats(allValues);

    return Object.fromEntries(
      Object.entries(regionAggregates).map(([key, data]) => {
        const resolved = resolveRegionColor(String(data.value), legendConfig, aggStats);
        return [key, resolved?.fill ?? DEFAULT_COLOR];
      })
    );
  }

  // ── Relative-intensity fading path ──
  const baseColor = (segmentTrack === 'category' && categoryStatus)
    ? (legendConfig.categoryStatusMap.get(categoryStatus)?.fill ?? DEFAULT_COLOR)
    : (legendConfig.fallbackRow?.fill ?? DEFAULT_COLOR);

  const rawRatios = Object.fromEntries(
    Object.entries(regionAggregates).map(([key, data]) => [
      key, computeRatio(data.value, key, denominator, filteredCount, effectiveAllCounts),
    ])
  );

  const vals = Object.values(rawRatios);
  const minR = Math.min(...vals);
  const maxR = Math.max(...vals);
  const range = maxR - minR;

  return Object.fromEntries(
    Object.entries(rawRatios).map(([key, ratio]) => {
      const scaled = range > 0 ? (ratio - minR) / range : 0.5;
      return [key, fadeToWhite(baseColor, MIN_INTENSITY + scaled * (1 - MIN_INTENSITY))];
    })
  );
}

// ─── World-map region code remapping ─────────────────────────────────────────

/**
 * Apply the fr→frx / nl→nlx / cn→cnx remapping required by world.svg.
 * Only called when the active map is identified as the world map.
 */
export function remapForWorldMap(colorsObj) {
  const out = { ...colorsObj };
  [['fr', 'frx'], ['nl', 'nlx'], ['cn', 'cnx']].forEach(([from, to]) => {
    if (Object.prototype.hasOwnProperty.call(out, from)) {
      out[to] = out[from];
      delete out[from];
    }
  });
  return out;
}
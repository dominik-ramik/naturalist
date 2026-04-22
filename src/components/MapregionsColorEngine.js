/**
 * MapregionsColorEngine
 *
 * Pure, stateless functions for resolving mapregions display properties.
 * No framework or app-state dependencies - safe to import anywhere.
 *
 * Dataset semantics (per spec §4.6):
 *   For A2/A3/A4/A5 anchors the "dataset" is the numeric values present in
 *   the CURRENT TAXON's mapregions object for the given column - not the
 *   filtered checklist.  Each taxon therefore carries its own independent
 *   color scale, which means:
 *     - Individual map-card display:  always per-taxon stats (no filter dependency)
 *     - Filter _checkDataFilters:     also per-taxon stats (avoids circular ref)
 *     - TabSummary aggregate view:    aggregate values across the scope rows
 *     - RegionalDistribution tool:    deferred - uses its own count-based pipeline
 */

// ─── Numeric value parsing ────────────────────────────────────────────────────

/**
 * Parse a status string as a number.
 * Handles trailing %, comma decimal separator ("65,4%" → 65.4).
 * Returns the raw numeric value or null.
 */
export function parseNumericStatus(str) {
  if (str == null) return null;
  let s = String(str).trim();
  if (s.endsWith('%')) s = s.slice(0, -1);
  s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ─── Anchor notation parser ───────────────────────────────────────────────────

const _NUM = '([+-]?\\d+(?:\\.\\d+)?)'; // captures signed decimal

/**
 * Parse a legend-table status code as an anchor descriptor (A1–A5).
 * Returns null when the string is a plain category code, not an anchor.
 */
export function parseAnchorNotation(str) {
  if (!str) return null;
  str = str.trim();

  // A5 - must be tested before A4/A2 because it contains 's' or '%' followed by 'c'
  // Syntax: magnitude[%|s]cCenter  e.g. "-100%c0", "2sc28", "0c28", "-5c10"
  const a5 = str.match(new RegExp(`^${_NUM}(%|s)?c${_NUM}$`));
  if (a5) return { type: 'A5', magnitude: +a5[1], modifier: a5[2] || null, center: +a5[3] };

  // A4 - number followed by 's'
  const a4 = str.match(new RegExp(`^${_NUM}s$`));
  if (a4) return { type: 'A4', sigmas: +a4[1] };

  // A3 - number followed by 'p'
  const a3 = str.match(new RegExp(`^${_NUM}p$`));
  if (a3) return { type: 'A3', percentile: +a3[1] };

  // A2 - number followed by '%'
  const a2 = str.match(new RegExp(`^${_NUM}%$`));
  if (a2) return { type: 'A2', pct: +a2[1] };

  // A1 - plain number (no suffix)
  const a1 = str.match(new RegExp(`^${_NUM}$`));
  if (a1) return { type: 'A1', value: +a1[1] };

  return null;
}

// ─── Legend config ────────────────────────────────────────────────────────────

/**
 * Build a resolved legend config for a specific dataPath from all legend table rows.
 *
 * Expected row shape:
 *   { columnName, statusCode, fillColor, legend, appendedLegend, legendType }
 *
 * Column-name scoping: rows with a matching columnName take priority over global
 * rows (empty columnName).  The compound key (columnName + statusCode) is unique
 * per spec, so there is never a real conflict - we simply include both sets.
 */
export function parseLegendConfig(rows, dataPath) {
  const applicable = rows.filter(r => !r.columnName || r.columnName === dataPath);

  const categoryRows = [];
  const numericRows  = [];
  let   fallbackRow  = null;

  for (const row of applicable) {
    const ltype = (row.legendType || '').toLowerCase().trim();
    if (ltype === 'gradient' || ltype === 'stepped') {
      const anchor = parseAnchorNotation(row.statusCode);
      if (anchor) {
        numericRows.push({
          anchor,
          fill:     row.fillColor,
          legend:   row.legend,
          // appendedLegend is only meaningful for 'stepped' rows (spec §4.6).
          // Gradient rows must always emit '' so _legendResult doesn't leak it.
          appendedLegend: ltype === 'stepped' ? (row.appendedLegend || '') : '',
          legendType: ltype,
        });
      }
    } else {
      // empty legendType or 'category'
      if (!row.statusCode) {
        fallbackRow = { fill: row.fillColor, legend: row.legend };
      } else {
        categoryRows.push({
          status:         row.statusCode,
          fill:           row.fillColor,
          legend:         row.legend,
          appendedLegend: row.appendedLegend || '',
        });
      }
    }
  }

  // Per spec, all numeric rows for a column share one legendType
  const numericMode = numericRows.some(r => r.legendType === 'gradient') ? 'gradient'
                    : numericRows.some(r => r.legendType === 'stepped')  ? 'stepped'
                    : null;

  // O(1) lookup set for category status codes
  const categoryStatusSet = new Set(categoryRows.map(r => r.status));
  // O(1) lookup map for category rows by status
  const categoryStatusMap = new Map(categoryRows.map(r => [r.status, r]));

  return { categoryRows, categoryStatusSet, categoryStatusMap, numericRows, fallbackRow, numericMode };
}

// ─── Dataset statistics ───────────────────────────────────────────────────────

/**
 * Collect numeric values from mapData that are NOT matched by a category row.
 * Only these values participate in gradient/stepped statistics.
 */
export function collectNumericValues(mapData, legendConfig) {
  const catSet = legendConfig.categoryStatusSet;
  const result = [];
  for (const regionData of Object.values(mapData)) {
    const s = regionData?.status ?? '';
    if (catSet.has(s)) continue;
    const n = parseNumericStatus(s);
    if (n !== null) result.push(n);
  }
  return result;
}

/**
 * Compute statistics over a numeric array.
 * Returns an object with descriptive stats and a resolveAnchor closure, or null.
 */
export function computeDatasetStats(numericValues) {
  if (!numericValues.length) return null;

  const sorted = [...numericValues].sort((a, b) => a - b);
  const n      = sorted.length;
  const min    = sorted[0];
  const max    = sorted[n - 1];
  const mean   = sorted.reduce((a, b) => a + b, 0) / n;
  const sd     = Math.sqrt(sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n);

  function percentileValue(p) {
    if (n === 1) return sorted[0];
    const idx = Math.max(0, Math.min(n - 1, (p / 100) * (n - 1)));
    const lo  = Math.floor(idx);
    const hi  = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
  }

  function resolveAnchor(anchor) {
    switch (anchor.type) {
      case 'A1': return anchor.value;
      case 'A2': return min === max ? min : min + (anchor.pct / 100) * (max - min);
      case 'A3': return percentileValue(anchor.percentile);
      case 'A4': return sd === 0 ? mean : mean + anchor.sigmas * sd;
      case 'A5': {
        const { magnitude, modifier, center } = anchor;
        if (!modifier) return center + magnitude;
        if (modifier === '%') {
          const maxDist = Math.max(0, ...numericValues.map(v => Math.abs(v - center)));
          return maxDist === 0 ? center : center + (magnitude / 100) * maxDist;
        }
        // modifier === 's'
        return sd === 0 ? center : center + magnitude * sd;
      }
      default: return null;
    }
  }

  return { min, max, mean, sd, sorted, resolveAnchor };
}

// ─── Color math ───────────────────────────────────────────────────────────────

function expandHex(hex) {
  const h = hex.replace('#', '');
  return h.length === 3 ? h.split('').map(c => c + c).join('') : h;
}

/**
 * Convert sRGB [0–255] to linear light.
 */
function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  const v = Math.max(0, Math.min(1, c));
  return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
}

/**
 * sRGB hex → CIE L*a*b* (D65).
 * Routes through linear-RGB → XYZ → Lab so that interpolation travels through
 * a perceptually uniform space.  This avoids the muddy brown/grey that appears
 * when interpolating red→blue or red→white directly in sRGB.
 */
function hexToLab(hex) {
  const h = expandHex(hex);
  const r = srgbToLinear(parseInt(h.slice(0, 2), 16));
  const g = srgbToLinear(parseInt(h.slice(2, 4), 16));
  const b = srgbToLinear(parseInt(h.slice(4, 6), 16));

  // Linear sRGB → XYZ (D65, sRGB primaries)
  let X = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  let Y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  let Z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;

  // Normalise by D65 white point
  X /= 0.95047; Y /= 1.0; Z /= 1.08883;

  const f = v => v > 0.008856 ? Math.cbrt(v) : (7.787 * v + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToHex(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const cube = v => v * v * v;
  const X = (cube(fx) > 0.008856 ? cube(fx) : (fx - 16 / 116) / 7.787) * 0.95047;
  const Y = (cube(fy) > 0.008856 ? cube(fy) : (fy - 16 / 116) / 7.787) * 1.0;
  const Z = (cube(fz) > 0.008856 ? cube(fz) : (fz - 16 / 116) / 7.787) * 1.08883;

  // XYZ → linear sRGB
  const rl =  X * 3.2404542 - Y * 1.5371385 - Z * 0.4985314;
  const gl = -X * 0.9692660 + Y * 1.8760108 + Z * 0.0415560;
  const bl =  X * 0.0556434 - Y * 0.2040259 + Z * 1.0572252;

  return '#' + [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)]
    .map(c => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Interpolate between two hex colors in CIE Lab space.
 * Produces perceptually smooth gradients - red→blue goes through pale lavender
 * rather than muddy brown/grey.
 */
function interpolateColor(hex1, hex2, t) {
  const [L1, a1, b1] = hexToLab(hex1);
  const [L2, a2, b2] = hexToLab(hex2);
  return labToHex(L1 + t * (L2 - L1), a1 + t * (a2 - a1), b1 + t * (b2 - b1));
}

// ─── Sorted-anchors cache ─────────────────────────────────────────────────────

// WeakMap<datasetStats → WeakMap<legendConfig → sortedAnchors[]>>
//
// Both keys are stable object references for the lifetime of a perspective
// build, so using object identity avoids any string serialisation cost.
// WeakMap entries are collected automatically when the stats or config objects
// are no longer referenced - no manual invalidation required.
const _sortedAnchorsCache = new WeakMap();

/**
 * Return the resolved, sorted anchor list for a (legendConfig, datasetStats)
 * pair, computing it at most once per unique combination.
 *
 * Each anchor is extended with a `resolved` field - the concrete numeric
 * threshold derived from the dataset statistics - and the list is sorted
 * ascending by that value so that _resolveGradient / _resolveStepped can
 * binary-search / linear-scan without re-sorting.
 */
function getSortedAnchors(legendConfig, datasetStats) {
  if (!_sortedAnchorsCache.has(datasetStats)) {
    _sortedAnchorsCache.set(datasetStats, new WeakMap());
  }
  const byStats = _sortedAnchorsCache.get(datasetStats);
  if (!byStats.has(legendConfig)) {
    byStats.set(legendConfig,
      legendConfig.numericRows
        .map(r => ({ ...r, resolved: datasetStats.resolveAnchor(r.anchor) }))
        .sort((a, b) => a.resolved - b.resolved)
    );
  }
  return byStats.get(legendConfig);
}

// ─── Color resolution ─────────────────────────────────────────────────────────

/**
 * Main resolution function.
 * Returns { fill, legend, appendedLegend, resolvedAs } or null (region left uncolored).
 *
 * resolvedAs: 'category' | 'gradient' | 'stepped' | 'fallback'
 *
 * Evaluation order (per spec):
 *   1. Exact categorical match
 *   2. Numeric interpolation (gradient) or binning (stepped) - requires ≥2 anchors
 *   3. Fallback (empty statusCode category row)
 */
export function resolveRegionColor(statusStr, legendConfig, datasetStats) {
  const { numericRows, fallbackRow, numericMode } = legendConfig;

  // 1. Categorical - checked first even if the string looks numeric
  const cat = legendConfig.categoryStatusMap.get(statusStr);
  if (cat) {
    return { fill: cat.fill, legend: cat.legend, appendedLegend: cat.appendedLegend, resolvedAs: 'category' };
  }

  // 2. Numeric - requires ≥2 resolved anchors and valid dataset stats
  if (numericRows.length >= 2 && datasetStats) {
    const value = parseNumericStatus(statusStr);
    if (value !== null) {
      // getSortedAnchors() is memoised by (datasetStats, legendConfig) object
      // identity - the sort and resolveAnchor calls happen at most once per
      // unique pair, not once per status value.
      const sorted = getSortedAnchors(legendConfig, datasetStats);

      const result = numericMode === 'gradient'
        ? _resolveGradient(value, sorted)
        : _resolveStepped(value, sorted);

      if (result) return { ...result, resolvedAs: numericMode }; // 'gradient' | 'stepped'
      return null;
    }
  }

  // 3. Fallback
  if (fallbackRow) {
    return { fill: fallbackRow.fill, legend: fallbackRow.legend, appendedLegend: '', resolvedAs: 'fallback' };
  }
  return null;
}

function _resolveGradient(value, sortedAnchors) {
  const first = sortedAnchors[0];
  const last  = sortedAnchors[sortedAnchors.length - 1];
  // Gradient rows always have appendedLegend: '' (enforced in parseLegendConfig)
  if (value <= first.resolved) return _legendResult(first);
  if (value >= last.resolved)  return _legendResult(last);
  for (let i = 0; i < sortedAnchors.length - 1; i++) {
    const lo = sortedAnchors[i], hi = sortedAnchors[i + 1];
    if (value <= hi.resolved) {
      const t = (value - lo.resolved) / (hi.resolved - lo.resolved);
      return { fill: interpolateColor(lo.fill, hi.fill, t), legend: lo.legend, appendedLegend: '' };
    }
  }
  return null;
}

function _resolveStepped(value, sortedAnchors) {
  // Highest anchor whose resolved value ≤ the data value (histogram-bin semantics)
  let match = null;
  for (const a of sortedAnchors) {
    if (a.resolved <= value) { match = a; } else { break; }
  }
  // Below all anchors → use first bin color
  return _legendResult(match ?? sortedAnchors[0]);
}

/**
 * Wrap an anchor into a result object.
 * appendedLegend is '' for gradient anchors (set in parseLegendConfig) and
 * the configured value for stepped anchors.
 */
function _legendResult(anchor) {
  return { fill: anchor.fill, legend: anchor.legend, appendedLegend: anchor.appendedLegend ?? '' };
}

// ─── Legend display helpers ───────────────────────────────────────────────────

/**
 * Return a CSS linear-gradient string for the gradient ramp display.
 * Stop positions are proportional to resolved anchor values.
 * Uses direct anchor colors - Lab interpolation happens in the engine for
 * individual values; the CSS ramp uses the anchor hex stops directly.
 */
export function gradientCSSForConfig(numericRows, datasetStats) {
  if (!datasetStats || numericRows.length < 2) return null;
  const sorted = numericRows
    .map(r => ({ fill: r.fill, resolved: datasetStats.resolveAnchor(r.anchor) }))
    .sort((a, b) => a.resolved - b.resolved);
  const lo = sorted[0].resolved, hi = sorted[sorted.length - 1].resolved;
  const range = hi - lo || 1;
  const stops = sorted.map(a => `${a.fill} ${(((a.resolved - lo) / range) * 100).toFixed(2)}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * Return ordered bin descriptors for a stepped legend display.
 */
export function steppedBinsForConfig(numericRows, datasetStats) {
  if (!numericRows.length) return [];
  const base = numericRows.map(r => ({
    fill:     r.fill,
    legend:   r.legend,
    resolved: datasetStats ? datasetStats.resolveAnchor(r.anchor) : null,
  }));
  return base.sort((a, b) => (a.resolved ?? 0) - (b.resolved ?? 0));
}

/**
 * Return anchor stops with proportional positions [0–1] for gradient tick rendering.
 * Each entry: { fill, legend, pct } where pct is 0–100.
 */
export function gradientTicksForConfig(numericRows, datasetStats) {
  if (!datasetStats || numericRows.length < 2) return [];
  const sorted = numericRows
    .map(r => ({ fill: r.fill, legend: r.legend, resolved: datasetStats.resolveAnchor(r.anchor) }))
    .sort((a, b) => a.resolved - b.resolved);
  const lo = sorted[0].resolved, hi = sorted[sorted.length - 1].resolved;
  const range = hi - lo || 1;
  return sorted.map(a => ({
    fill:     a.fill,
    legend:   a.legend,
    resolved: a.resolved,
    pct:      ((a.resolved - lo) / range) * 100,
  }));
}

/**
 * Find the stepped bin (appended-legend capable) for a given numeric value.
 * Used by renderRegionsList to append legend text for stepped columns.
 */
export function findSteppedBin(value, numericRows, datasetStats) {
  if (!datasetStats || numericRows.length < 2) return null;
  const sorted = steppedBinsForConfig(numericRows, datasetStats);
  let match = null;
  for (const bin of sorted) {
    if (bin.resolved <= value) { match = bin; } else { break; }
  }
  return match ?? sorted[0];
}
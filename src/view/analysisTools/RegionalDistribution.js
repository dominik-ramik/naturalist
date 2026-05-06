/**
 * Regional Distribution analysis tool
 *
 * Aggregates mapregions data across the filtered record set and renders:
 *   1. A collapsible config panel (map, segment, operation, denominator, groups)
 *   2. A colored SVG choropleth map
 *   3. A sortable aggregate table with per-region drill-down
 *
 * Supports all mapregions flavours: presence/absence, named category statuses,
 * numeric gradient/stepped, and mixed category+numeric maps.
 *
 * Dynamic templates (e.g. "maps/{{ data.continent }}.svg") are handled by
 * enumerating all unique resolved paths across the full dataset. Each distinct
 * path becomes its own selectable map variant, scoped to only the rows whose
 * template resolves to that path.  Enumeration runs asynchronously (one
 * setTimeout tick) so the UI can show a spinner for the first render frame.
 */

import m from 'mithril';
import './RegionalDistribution.css';
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

import { Settings } from '../../model/Settings.js';
import { Checklist } from '../../model/Checklist.js';
import { filterTerminalLeavesForMode, relativeToUsercontent } from '../../components/Utils.js';
import { colorSVGMap } from '../../components/ColorSVGMap.js';
import { getLegendConfig } from '../../model/customTypes/CustomTypeMapregions.js';

import {
  detectSegments,
  collectRegionData,
  mergeToGroups,
  computeRegionAggregates,
  computeAllRegionCounts,
  buildEffectiveAllCounts,
  computeColorMapping,
  getRegionGroups,
  remapForWorldMap,
} from './RegionalDistribution/aggregate.js';

import { getMapState, setMapState, getGlobalState, setGlobalState } from './RegionalDistribution/state.js';
import { renderConfigPanel } from './RegionalDistribution/configPanel.js';
import { renderAggregateTable, resetDrillState } from './RegionalDistribution/aggregateTable.js';
import { ANALYTICAL_INTENT_OCCURRENCE, ANALYTICAL_INTENT_TAXA, OCCURRENCE_IDENTIFIER } from '../../model/nlDataStructureSheets.js';
import { getDataFromDataPath } from '../../model/DataPath.js';
import { FullscreenableMedia } from '../../components/FullscreenableMedia.js';
import { CacheManager } from '../../model/CacheManager.js';

registerMessages(selfKey, {
  en: {
    rd_no_data_message: "No data for the current selection. Try changing the filter, segment, or operation.",
    rd_computing_maps: "Preparing maps…",
  },
  fr: {
    rd_no_data_message: "Aucune donnée pour la sélection actuelle. Essayez de changer le filtre, le segment ou l'opération.",
    rd_computing_maps: "Préparation des cartes…",
  }
});


// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum number of unique SVG paths a single dynamic template may produce.
 * Guards against accidental per-taxon templates (e.g. "maps/{{taxon.name}}.svg")
 * turning the map selector into an unusable list.
 */
const MAX_DYNAMIC_MAP_PATHS = 20;


// ─── Tool registration config ─────────────────────────────────────────────────

export const config = {
  id: 'tool_regional_distribution',
  label: 'Regional Distribution',
  iconPath: {
    light: './img/ui/menu/view_map-light.svg',
    dark: './img/ui/menu/view_map.svg',
  },
  info: 'Aggregate regional distribution across filtered records - count presences, compare categories, or compute numeric statistics per region',
  getTaxaAlongsideOccurrences: false,

  getAvailability: (availableIntents) => {
    const supportedIntents = availableIntents.filter(intent => {
      const maps = getAvailableMaps(intent);
      // Treat COMPUTING as "potentially available" - dynamic paths are still
      // being enumerated; we'll know for sure after the async pass completes.
      return maps === COMPUTING || maps.length > 0;
    });
    return {
      supportedIntents,
      isAvailable: supportedIntents.length > 0,
      toolDisabledReason: 'No regional map data found in this dataset.',
      scopeDisabledReason: intent =>
        `${config.label} requires map data associated with ${intent === ANALYTICAL_INTENT_TAXA ? 'Taxa' : 'Occurrences'}.`,
    };
  },

  render: ({ filteredTaxa, allTaxa, dataContextRevision }) =>
    mapChart(filteredTaxa, allTaxa, dataContextRevision),
};


// ─── Sentinel ─────────────────────────────────────────────────────────────────

/**
 * Returned from getAvailableMaps while async dynamic-path enumeration is in
 * progress. Callers must check for this value before treating the result as
 * an array.
 */
const COMPUTING = Symbol('computing');


// ─── Module-level cache ───────────────────────────────────────────────────────

let _rev = '';
let _mapsCache = {};   // mode → map[] | COMPUTING
let _countsCache = {};   // cache key → allRegionCounts  (key includes source for dynamic variants)
let _svgColorsJSON = '';   // guards redundant DOM colorSVGMap calls
let _pendingColorTimer = null;
let _pendingMapsTimer = null;   // handle for the dynamic-path enumeration setTimeout

function invalidateCaches(newRev) {
  _rev = newRev;
  _mapsCache = {};
  _countsCache = {};
  _svgColorsJSON = '';
  clearTimeout(_pendingColorTimer);
  _pendingColorTimer = null;
  clearTimeout(_pendingMapsTimer);
  _pendingMapsTimer = null;
}


// ─── Template helpers (pure functions) ───────────────────────────────────────

/**
 * Returns true when a template string contains Handlebars expressions.
 * Only these templates require per-row resolution; static strings can be
 * resolved once with a blank context.
 */
function hasDynamicTemplate(templateString) {
  return templateString.includes('{{');
}

/**
 * Resolves a compiled Handlebars template against a single checklist row,
 * supplying the full row data context (value, data.*, taxon.*).
 *
 * @param {Function} compiledTemplate  - Handlebars compiled template function
 * @param {object}   row               - Checklist row ({ t, d })
 * @param {string}   dataPath          - Data path for the mapregions column
 * @returns {string} Resolved template string
 */
function resolveTemplateForRow(compiledTemplate, row, dataPath) {
  const currentValue = getDataFromDataPath(row.d, dataPath);
  const leafT = row.t[row.t.length - 1];
  const taxonName = leafT?.name ?? '';
  const taxonAuthority = leafT?.authority ?? leafT?.a ?? '';
  return compiledTemplate(
    Checklist.getDataObjectForHandlebars(currentValue, row.d, taxonName, taxonAuthority)
  );
}

/**
 * Derives a human-readable title from an SVG file path by taking the last
 * path segment, stripping the extension, and capitalising the first letter.
 *
 * Examples:
 *   "maps/africa.svg"            → "Africa"
 *   "regions/south-east-asia.svg" → "South-east-asia"
 */
function deriveTitleFromPath(source) {
  const filename = (source.split('/').pop() ?? source).replace(/\.svg$/i, '');
  return filename.charAt(0).toUpperCase() + filename.slice(1);
}

/**
 * Walks the full checklist for a dynamic mapregions template and collects
 * the set of unique resolved SVG paths.  Rows that produce an empty/blank
 * path are skipped.  Row identity is not tracked - all variants are windows
 * onto the same dataset; no per-variant data scoping is applied.
 *
 * Pure function - reads only its arguments, no module state.
 *
 * @returns {Set<string>}  unique raw source strings
 */
function collectDynamicMapPaths(dataPath, compiledTemplate, checklist, mode, occurrenceIdx) {
  const result = new Set();

  checklist.forEach(row => {
    const isOccurrence = occurrenceIdx !== -1 && row.t[occurrenceIdx] != null;
    if (mode === 'taxa' && isOccurrence) return;
    if (mode === OCCURRENCE_IDENTIFIER && !isOccurrence) return;

    const d = getDataFromDataPath(row.d, dataPath);
    if (!d || typeof d !== 'object' || !Object.keys(d).length) return;

    const resolved = resolveTemplateForRow(compiledTemplate, row, dataPath);
    if (resolved?.trim()) result.add(resolved);
  });

  return result;
}

/**
 * Converts the path map returned by collectDynamicMapPaths into an array of
 * map descriptor objects ready for use in the render pipeline.
 *
 * Caps at MAX_DYNAMIC_MAP_PATHS and logs a warning when the cap is hit.
 *
 * @param {string}           dataPath - The shared dataPath for all variants
 * @param {object}           meta     - The dataMeta entry for this dataPath
 * @param {Map<string, Set>} pathMap  - rawSource → Set<row>
 * @returns {object[]} Array of map descriptor objects
 */
function buildDynamicMapEntries(dataPath, meta, pathMap) {
  if (pathMap.size > MAX_DYNAMIC_MAP_PATHS) {
    console.warn(
      `[RegionalDistribution] Dynamic template for "${dataPath}" resolved to ` +
      `${pathMap.size} unique SVG paths (max ${MAX_DYNAMIC_MAP_PATHS}). ` +
      `Only the first ${MAX_DYNAMIC_MAP_PATHS} will be shown. ` +
      `Consider using a less granular grouping column in your template.`
    );
  }

  const entries = [];
  let count = 0;

  pathMap.forEach((matchingRowSet, rawSource) => {
    if (count++ >= MAX_DYNAMIC_MAP_PATHS) return;
    const source = rawSource.startsWith('/') ? rawSource.slice(1) : rawSource;
    const variantTitle = deriveTitleFromPath(source);
    entries.push({
      // Include the parent column title when set so map selector entries read
      // e.g. "Continent – Africa" rather than just "Africa".
      title: meta.title ? `${meta.title} – ${variantTitle}` : variantTitle,
      dataPath,
      source: relativeToUsercontent(source),
      isWorldMap: source.toLowerCase().endsWith('world.svg'),
      // null for static maps; a Set<row> for dynamic variants.
      // Used downstream to scope the data pipeline to only the relevant rows.
      matchingRowSet,
    });
  });

  return entries;
}


// ─── Available maps ───────────────────────────────────────────────────────────

/**
 * Returns the list of available map descriptors for the current (or given)
 * intent and dataset revision.
 *
 * For datasets with only static templates the result is synchronous and
 * cached on the first call. For datasets with dynamic templates the first
 * call sets the COMPUTING sentinel and schedules enumeration; subsequent
 * calls return COMPUTING until the setTimeout callback fires, at which
 * point the cache is populated and m.redraw() triggers a re-render.
 *
 * @returns {object[] | COMPUTING}
 */
function getAvailableMaps(intent, rev = CacheManager.contextRevision()) {
  if (rev !== _rev) invalidateCaches(rev);

  const mode = (intent || Settings.analyticalIntent()) === ANALYTICAL_INTENT_OCCURRENCE
    ? OCCURRENCE_IDENTIFIER : 'taxa';

  // Return cached result - may be the COMPUTING sentinel or a resolved array.
  if (_mapsCache[mode] !== undefined) return _mapsCache[mode];

  const occurrenceIdx = Checklist.getOccurrenceMetaIndex();
  const checklist = Checklist.getEntireChecklist();
  const dataMeta = Checklist.getDataMeta();

  const staticMaps = [];
  const pendingDynamic = []; // { dataPath, meta, compiledTemplate }

  Object.entries(dataMeta).forEach(([dataPath, meta]) => {
    if (meta.dataType !== 'mapregions' || !meta.template?.trim()) return;

    const templateString = String(meta.template).trim();
    const compiledTemplate = Checklist.handlebarsTemplates?.[dataPath];

    if (!hasDynamicTemplate(templateString)) {
      // ── Static template: resolve once with a blank context ─────────────────
      // A compiled template function may still exist (e.g. for helpers) even
      // when there are no {{ }} interpolation expressions; calling it with an
      // empty context is safe and correct in that case.
      const rawSource = compiledTemplate
        ? compiledTemplate(Checklist.getDataObjectForHandlebars('', {}, '', ''))
        : templateString;

      if (!rawSource?.trim()) return;
      const source = rawSource.startsWith('/') ? rawSource.slice(1) : rawSource;

      const hasData = checklist.some(row => {
        const isOccurrence = occurrenceIdx !== -1 && row.t[occurrenceIdx] != null;
        if (mode === 'taxa' && isOccurrence) return false;
        if (mode === OCCURRENCE_IDENTIFIER && !isOccurrence) return false;
        const d = getDataFromDataPath(row.d, dataPath);
        return d && typeof d === 'object' && Object.keys(d).length > 0;
      });

      if (hasData) {
        staticMaps.push({
          title: meta.title || dataPath,
          dataPath,
          source: relativeToUsercontent(source),
          isWorldMap: source.toLowerCase().endsWith('world.svg'),
          matchingRowSet: null,   // null signals "use all rows" throughout the pipeline
        });
      }

    } else if (compiledTemplate) {
      // ── Dynamic template: defer enumeration to the async pass ──────────────
      pendingDynamic.push({ dataPath, meta, compiledTemplate });
    }
  });

  if (pendingDynamic.length === 0) {
    // No dynamic templates - populate cache synchronously and return.
    _mapsCache[mode] = staticMaps;
    return staticMaps;
  }

  // At least one dynamic template: set sentinel so callers can show a spinner,
  // then schedule the enumeration pass for the next JS task (after the current
  // render frame has been committed).
  _mapsCache[mode] = COMPUTING;
  const capturedRev = _rev;

  _pendingMapsTimer = setTimeout(() => {
    _pendingMapsTimer = null;
    // Abort if the dataset was invalidated while we were waiting.
    if (_rev !== capturedRev) return;

    const dynamicMaps = pendingDynamic.flatMap(({ dataPath, meta, compiledTemplate }) => {
      const pathMap = collectDynamicMapPaths(
        dataPath, compiledTemplate, checklist, mode, occurrenceIdx
      );
      return buildDynamicMapEntries(dataPath, meta, pathMap);
    });

    _mapsCache[mode] = [...staticMaps, ...dynamicMaps];
    m.redraw();
  }, 0);

  return COMPUTING;
}


// ─── Spinner ──────────────────────────────────────────────────────────────────

let _spinnerStyleInjected = false;

/** Injects the @keyframes rule for the spinner once into the document head. */
function ensureSpinnerStyle() {
  if (_spinnerStyleInjected) return;
  _spinnerStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = '@keyframes rd-spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);
}

function renderComputingSpinner() {
  ensureSpinnerStyle();
  return m('.chart-info-box',
    m('.chart-info-item',
      m('span', { style: 'display:inline-flex;align-items:center;gap:.5em' }, [
        m('svg', {
          xmlns: 'http://www.w3.org/2000/svg',
          width: 18, height: 18,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 3,
          'stroke-linecap': 'round',
          style: 'animation:rd-spin .9s linear infinite;flex-shrink:0',
        },
          m('path', { d: 'M12 2a10 10 0 1 0 10 10' })
        ),
        t('rd_computing_maps'),
      ])
    )
  );
}


// ─── Main render ──────────────────────────────────────────────────────────────

function mapChart(filteredTaxa, allTaxa, dataContextRevision) {
  if (dataContextRevision !== _rev) invalidateCaches(dataContextRevision);

  const mode = Settings.analyticalIntent() === ANALYTICAL_INTENT_OCCURRENCE ? OCCURRENCE_IDENTIFIER : 'taxa';
  const occurrenceIdx = Checklist.getOccurrenceMetaIndex();
  const filterEmpty = Checklist.filter.isEmpty();
  const availableMaps = getAvailableMaps();

  // Show a spinner while the dynamic-path enumeration async pass is pending.
  if (availableMaps === COMPUTING) {
    return m('.map-chart', renderComputingSpinner());
  }

  // ── Resolve current map ──
  //
  // For static maps, currentMapDataPath alone is a unique identifier.
  // For dynamic variants, multiple maps share a dataPath; we additionally
  // compare source to pick the right variant. currentMapSource is written
  // to globalState by onMapChange and on first-visit auto-selection.
  let globalState = getGlobalState();
  let currentMap = availableMaps.find(map =>
    map.matchingRowSet
      ? map.dataPath === globalState.currentMapDataPath && map.source === globalState.currentMapSource
      : map.dataPath === globalState.currentMapDataPath
  ) ?? null;

  if (!currentMap && availableMaps.length) {
    currentMap = availableMaps[0];
    globalState = setGlobalState({
      currentMapDataPath: currentMap.dataPath,
      currentMapSource: currentMap.matchingRowSet ? currentMap.source : undefined,
    });
  }

  // ── Per-map state with auto-detection and guard rails ──
  //
  // State is keyed by dataPath; dynamic variants of the same template share
  // state intentionally, since they use the same legend config and data type.
  let mapState = currentMap ? getMapState(currentMap.dataPath) : {};
  let legendConfig = currentMap ? getLegendConfig(currentMap.dataPath) : null;
  let segments = legendConfig ? detectSegments(legendConfig) : null;

  if (currentMap && segments) {
    let { segmentTrack } = mapState;

    // First visit: auto-select the most meaningful track.
    if (!segmentTrack) {
      segmentTrack = (segments.hasNumeric && !segments.namedCategories.length)
        ? 'numeric'
        : 'category';
      mapState = setMapState(currentMap.dataPath, { segmentTrack });
    }

    // Guard: numeric track selected but map has no numeric data.
    if (segmentTrack === 'numeric' && !segments.hasNumeric) {
      mapState = setMapState(currentMap.dataPath, { segmentTrack: 'category', categoryStatus: null });
    }

    // Guard: invalid categoryStatus (e.g. carried over from a previous map's state).
    if (mapState.segmentTrack === 'category' && mapState.categoryStatus) {
      const stillValid = segments.namedCategories.some(c => c.status === mapState.categoryStatus);
      if (!stillValid) mapState = setMapState(currentMap.dataPath, { categoryStatus: null });
    }

    // When no filter is active, denominator 'filter' and 'total' are equivalent;
    // quietly coerce to 'total' so the verb sentence reads correctly.
    if (filterEmpty && mapState.denominator === 'filter') {
      mapState = { ...mapState, denominator: 'total' };
    }
  }

  // ── Leaf computation ──
  //
  // For dynamic map variants, further restrict the filtered leaves to only
  // the rows whose template resolves to this specific map's source path.
  // This ensures aggregates, percentages, and counts are all self-consistent
  // for the rows actually depicted by the map.
  const rawFilteredLeaves = currentMap
    ? filterTerminalLeavesForMode(filteredTaxa, mode, occurrenceIdx)
    : [];

  const filteredLeaves = currentMap?.matchingRowSet
    ? rawFilteredLeaves.filter(leaf => currentMap.matchingRowSet.has(leaf))
    : rawFilteredLeaves;

  const filteredCount = filteredLeaves.length;

  // ── Cached all-region counts ──
  //
  // Cache key includes the map source for dynamic variants so that each
  // variant maintains its own "total across all taxa" baseline.
  let allRegionCounts = {};
  if (currentMap) {
    const cKey = currentMap.matchingRowSet
      ? `${currentMap.dataPath}|${mode}|${currentMap.source}`
      : `${currentMap.dataPath}|${mode}`;

    if (!_countsCache[cKey]) {
      const allLeaves = filterTerminalLeavesForMode(allTaxa, mode, occurrenceIdx);
      const scopedAllLeaves = currentMap.matchingRowSet
        ? allLeaves.filter(leaf => currentMap.matchingRowSet.has(leaf))
        : allLeaves;
      _countsCache[cKey] = computeAllRegionCounts(scopedAllLeaves, currentMap.dataPath, mode, occurrenceIdx);
    }
    allRegionCounts = _countsCache[cKey];
  }

  // ── Data pipeline ──
  const regionGroups = currentMap ? getRegionGroups(currentMap.dataPath) : [];
  let regionData = {};
  let regionAggregates = {};
  let colors = {};
  let effectiveAllCounts = {};
  let groupIndex = {};

  if (currentMap && mapState.segmentTrack) {
    const raw = collectRegionData(filteredLeaves, currentMap.dataPath, mode, occurrenceIdx);

    if (mapState.useGroups && regionGroups.length) {
      const merged = mergeToGroups(raw, regionGroups);
      regionData = merged.groupedMap;
      groupIndex = merged.groupIndex;
    } else {
      regionData = raw;
    }

    regionAggregates = computeRegionAggregates(
      regionData,
      mapState.segmentTrack,
      mapState.categoryStatus,
      mapState.numericOperation,
      mapState.threshold,
    );

    effectiveAllCounts = buildEffectiveAllCounts(allRegionCounts, regionData);

    colors = computeColorMapping(
      regionAggregates,
      mapState.segmentTrack,
      mapState.numericOperation,
      legendConfig,
      mapState.denominator,
      filteredCount,
      effectiveAllCounts,
      mapState.categoryStatus,
    );
  }

  // ── Event handlers ──
  const onMapChange = map => {
    setGlobalState({
      currentMapDataPath: map.dataPath,
      currentMapSource: map.matchingRowSet ? map.source : undefined,
    });
    resetDrillState();
    _svgColorsJSON = '';
  };

  const onStateChange = partial => {
    setMapState(currentMap.dataPath, partial);
    if (partial.useGroups !== undefined || partial.segmentTrack !== undefined) {
      resetDrillState();
    }
    _svgColorsJSON = '';
  };

  const onToggleCollapse = () =>
    setGlobalState({ configCollapsed: !globalState.configCollapsed });

  // ── Render ──
  return m('.map-chart', [

    renderConfigPanel({
      availableMaps,
      currentMap,
      segments,
      mapState: {
        ...mapState,
        _hasGroups: regionGroups.length > 0,
        _groupTitles: regionGroups.map(g => g.title),
      },
      onMapChange,
      onStateChange,
      configCollapsed: globalState.configCollapsed,
      onToggleCollapse,
      filteredCount,
    }),

    currentMap == null ? m('.chart-info-box',
      m('.chart-info-item', t('view_map_select_map'))
    ) : m('.map-and-table-container', [
      renderSVGMap(currentMap, expandGroupColors(colors, groupIndex)),
      m('.table-responsive-wrapper',
        Object.keys(regionAggregates).length === 0
          ? m('.rd-no-data', m('.chart-info-item', t('rd_no_data_message')))
          : renderAggregateTable({
            regionAggregates,
            colors,
            regionData,
            mapState,
            filteredCount,
            effectiveAllCounts,
            legendConfig,
          })
      ),
    ]),

  ]);
}


// ─── Group → region color expansion ──────────────────────────────────────────

/**
 * When groups are active, `colors` is keyed by group title.
 * The SVG map needs colors keyed by region code.
 * Expand each group color to every member region code so the map renders
 * uniformly colored groups.  Non-group keys pass through unchanged.
 */
function expandGroupColors(colors, groupIndex) {
  if (!Object.keys(groupIndex).length) return colors;
  const expanded = {};
  Object.entries(colors).forEach(([key, color]) => {
    if (groupIndex[key]) {
      groupIndex[key].forEach(code => { expanded[code] = color; });
    } else {
      expanded[key] = color;
    }
  });
  return expanded;
}


// ─── SVG map rendering ────────────────────────────────────────────────────────

function renderSVGMap(map, colors) {
  const displayColors = map.isWorldMap ? remapForWorldMap(colors) : colors;
  const newJSON = JSON.stringify(displayColors);

  if (newJSON !== _svgColorsJSON) {
    _svgColorsJSON = newJSON;
    clearTimeout(_pendingColorTimer);
    _pendingColorTimer = setTimeout(() => {
      _pendingColorTimer = null;
      const el = document.getElementById('rd-map');
      if (el?.contentDocument) colorSVGMap(el, displayColors);
    }, 50);
  }

  return m('.map-chart-image-wrap-outer',
    m(FullscreenableMedia, {
      type:     'svg-object',
      fullSrc:  map.source,
      svgId:    'rd-map',
      svgStyle: 'pointer-events: none;',
      extraWrapClass: 'map-chart-image-wrap',
      oncreate: function (vnode) {
        // Native listener avoids a Mithril auto-redraw on SVG load.
        vnode.dom.addEventListener("load", function () {
          colorSVGMap(vnode.dom, displayColors);
        });
      },
    })
  );
}

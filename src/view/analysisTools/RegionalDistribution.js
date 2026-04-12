/**
 * Regional Distribution analysis tool
 *
 * Aggregates mapregions data across the filtered record set and renders:
 *   1. A collapsible config panel (map, segment, operation, denominator, groups)
 *   2. A coloured SVG choropleth map
 *   3. A sortable aggregate table with per-region drill-down
 *
 * Supports all mapregions flavours: presence/absence, named category statuses,
 * numeric gradient/stepped, and mixed category+numeric maps.
 */

import m from 'mithril';
import './RegionalDistribution.css';

import { Settings }  from '../../model/Settings.js';
import { Checklist } from '../../model/Checklist.js';
import { filterTerminalLeavesForMode, relativeToUsercontent } from '../../components/Utils.js';
import { colorSVGMap }    from '../../components/ColorSVGMap.js';
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

// ─── Tool registration config ─────────────────────────────────────────────────

export const config = {
  id:    'tool_regional_distribution',
  label: 'Regional Distribution',
  iconPath: {
    light: './img/ui/menu/view_map-light.svg',
    dark:  './img/ui/menu/view_map.svg',
  },
  info: 'Aggregate regional distribution across filtered records — count presences, compare categories, or compute numeric statistics per region',
  getTaxaAlongsideSpecimens: false,

  getAvailability: (availableIntents) => {
    const supportedIntents = availableIntents.filter(
      intent => getAvailableMaps(intent).length > 0
    );
    return {
      supportedIntents,
      isAvailable: supportedIntents.length > 0,
      toolDisabledReason: 'No regional map data found in this dataset.',
      scopeDisabledReason: intent =>
        `${config.label} requires map data associated with ${intent === '#T' ? 'Taxa' : 'Specimens'}.`,
    };
  },

  render: ({ filteredTaxa, allTaxa, datasetRevision }) =>
    mapChart(filteredTaxa, allTaxa, datasetRevision),
};

// ─── Module-level cache ───────────────────────────────────────────────────────

let _rev              = -1;
let _mapsCache        = {};   // mode → map[]
let _countsCache      = {};   // `${dataPath}|${mode}` → allRegionCounts
let _svgColorsJSON    = '';   // guards redundant DOM colorSVGMap calls
let _pendingColorTimer = null;

function invalidateCaches(newRev) {
  _rev              = newRev;
  _mapsCache        = {};
  _countsCache      = {};
  _svgColorsJSON    = '';
  clearTimeout(_pendingColorTimer);
  _pendingColorTimer = null;
}

// ─── Available maps ───────────────────────────────────────────────────────────

function getAvailableMaps(intent, rev = Checklist.getDataRevision()) {
  if (rev !== _rev) invalidateCaches(rev);

  const mode = (intent || Settings.analyticalIntent()) === '#S' ? 'specimen' : 'taxa';
  if (_mapsCache[mode]) return _mapsCache[mode];

  const specimenIdx = Checklist.getSpecimenMetaIndex();
  const checklist   = Checklist.getEntireChecklist();
  const dataMeta    = Checklist.getDataMeta();
  const maps        = [];

  Object.entries(dataMeta).forEach(([dataPath, meta]) => {
    if (meta.formatting !== 'mapregions' || !meta.template?.trim()) return;

    let source = meta.template;
    if (Checklist.handlebarsTemplates?.[dataPath]) {
      source = Checklist.handlebarsTemplates[dataPath](
        Checklist.getDataObjectForHandlebars('', {}, '', '')
      );
    }
    if (!source?.trim()) return;
    if (source.startsWith('/')) source = source.slice(1);

    const hasData = checklist.some(row => {
      const isSpecimen = specimenIdx !== -1 && row.t[specimenIdx] != null;
      if (mode === 'taxa'     &&  isSpecimen) return false;
      if (mode === 'specimen' && !isSpecimen) return false;
      const d = Checklist.getDataFromDataPath(row.d, dataPath);
      return d && typeof d === 'object' && Object.keys(d).length > 0;
    });

    if (hasData) maps.push({
      title:      meta.title || dataPath,
      dataPath,
      source:     relativeToUsercontent(source),
      isWorldMap: source.toLowerCase().endsWith('world.svg'),
    });
  });

  _mapsCache[mode] = maps;
  return maps;
}

// ─── Main render ──────────────────────────────────────────────────────────────

function mapChart(filteredTaxa, allTaxa, datasetRevision) {
  if (datasetRevision !== _rev) invalidateCaches(datasetRevision);

  const mode         = Settings.analyticalIntent() === '#S' ? 'specimen' : 'taxa';
  const specimenIdx  = Checklist.getSpecimenMetaIndex();
  const filterEmpty  = Checklist.filter.isEmpty();
  const availableMaps = getAvailableMaps();

  // ── Resolve current map ──
  let globalState = getGlobalState();
  let currentMap  = availableMaps.find(m => m.dataPath === globalState.currentMapDataPath) ?? null;
  if (!currentMap && availableMaps.length) {
    currentMap = availableMaps[0];
    globalState = setGlobalState({ currentMapDataPath: currentMap.dataPath });
  }

  // ── Per-map state with auto-detection and guard rails ──
  let mapState     = currentMap ? getMapState(currentMap.dataPath) : {};
  let legendConfig = currentMap ? getLegendConfig(currentMap.dataPath) : null;
  let segments     = legendConfig ? detectSegments(legendConfig) : null;

  if (currentMap && segments) {
    let { segmentTrack } = mapState;

    // First visit: auto-select the most meaningful track
    if (!segmentTrack) {
      segmentTrack = (segments.hasNumeric && !segments.namedCategories.length)
        ? 'numeric'
        : 'category';
      mapState = setMapState(currentMap.dataPath, { segmentTrack });
    }

    // Guard: numeric track selected but map has no numeric data
    if (segmentTrack === 'numeric' && !segments.hasNumeric) {
      mapState = setMapState(currentMap.dataPath, { segmentTrack: 'category', categoryStatus: null });
    }

    // Guard: invalid categoryStatus (e.g. from a previous map's state)
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
  const filteredLeaves = currentMap
    ? filterTerminalLeavesForMode(filteredTaxa, mode, specimenIdx)
    : [];
  const filteredCount = filteredLeaves.length;

  // ── Cached all-region counts ──
  let allRegionCounts = {};
  if (currentMap) {
    const cKey = currentMap.dataPath + '|' + mode;
    if (!_countsCache[cKey]) {
      const allLeaves  = filterTerminalLeavesForMode(allTaxa, mode, specimenIdx);
      _countsCache[cKey] = computeAllRegionCounts(allLeaves, currentMap.dataPath, mode, specimenIdx);
    }
    allRegionCounts = _countsCache[cKey];
  }

  // ── Data pipeline ──
  const regionGroups = currentMap ? getRegionGroups(currentMap.dataPath) : [];
  let regionData     = {};
  let regionAggregates = {};
  let colors         = {};
  let effectiveAllCounts = {};

  if (currentMap && mapState.segmentTrack) {
    const raw = collectRegionData(filteredLeaves, currentMap.dataPath, mode, specimenIdx);

    const workingData = (mapState.useGroups && regionGroups.length)
      ? mergeToGroups(raw, regionGroups).groupedMap
      : raw;
    regionData       = workingData;

    regionAggregates = computeRegionAggregates(
      workingData,
      mapState.segmentTrack,
      mapState.categoryStatus,
      mapState.numericOperation,
      mapState.threshold,
    );

    effectiveAllCounts = buildEffectiveAllCounts(allRegionCounts, workingData);

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
    setGlobalState({ currentMapDataPath: map.dataPath });
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
      mapState: { ...mapState, _hasGroups: regionGroups.length > 0 },
      onMapChange,
      onStateChange,
      configCollapsed: globalState.configCollapsed,
      onToggleCollapse,
      filteredCount,
    }),

    currentMap == null ? m('.chart-info-box',
      m('.chart-info-item', t('view_map_select_map'))
    ) : m('.map-and-table-container', [
      renderSVGMap(currentMap, colors),
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

// ─── SVG map rendering ────────────────────────────────────────────────────────

function renderSVGMap(map, colors) {
  const displayColors = map.isWorldMap ? remapForWorldMap(colors) : colors;
  const newJSON       = JSON.stringify(displayColors);

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
    m('.map-chart-image-wrap.fullscreenable-image', {
      onclick(e) {
        this.classList.toggle('fullscreen');
        e.preventDefault();
        e.stopPropagation();
      },
    },
    m('object#rd-map[type=image/svg+xml][style=pointer-events: none;][data=' + map.source + ']', {
      onload() { colorSVGMap(this, displayColors); },
    })
  ));
}
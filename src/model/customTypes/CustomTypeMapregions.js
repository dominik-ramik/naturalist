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

import { nlDataStructure } from "../DataManagerData.js";
import { Checklist } from "../Checklist.js";
import { processMarkdownWithBibliography } from "../../components/Utils.js";
import { Logger } from "../../components/Logger.js";
import { colorSVGMap } from "../../components/ColorSVGMap.js";
import {
  parseLegendConfig,
  collectNumericValues,
  computeDatasetStats,
  resolveRegionColor,
  gradientCSSForConfig,
  gradientTicksForConfig,
  steppedBinsForConfig,
} from "../../components/MapregionsColorEngine.js";

const nlData = nlDataStructure;

// ─── Legend config cache ──────────────────────────────────────────────────────
// Keyed by dataPath. Invalidate on dataset load via clearLegendConfigCache().

const _legendConfigCache = {};

// Markdown rendering cache — processMarkdownWithBibliography is expensive
// (marked + DOMPurify) and the same note strings recur across renders.
const _mdCache = new Map();

export function clearLegendConfigCache() {
  Object.keys(_legendConfigCache).forEach(k => delete _legendConfigCache[k]);
  _mdCache.clear();
  _resolvedColorCache.clear();
  clearDatasetStatsCache();
}

function cachedMarkdown(text) {
  if (!_mdCache.has(text)) {
    _mdCache.set(text, processMarkdownWithBibliography(text));
  }
  return _mdCache.get(text);
}

const _resolvedColorCache = new Map();

export function getCachedRegionColor(status, legendConfig, datasetStats, dataPath) {
  if (!_resolvedColorCache.has(dataPath)) {
    _resolvedColorCache.set(dataPath, new Map());
  }
  const sub = _resolvedColorCache.get(dataPath);
  if (!sub.has(status)) {
    sub.set(status, resolveRegionColor(status, legendConfig, datasetStats));
  }
  return sub.get(status);
}

const _datasetStatsCache = new Map();

export function clearDatasetStatsCache() {
  _datasetStatsCache.clear();
}

export function getCachedDatasetStats(data, legendConfig, dataPath) {
  const key = dataPath + ":" + Object.keys(data).sort().join(",");
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
export function getLegendConfig(dataPath) {
  if (!_legendConfigCache[dataPath]) {
    _legendConfigCache[dataPath] = parseLegendConfig(
      Checklist.getMapRegionsLegendRows(),
      dataPath
    );
  }
  return _legendConfigCache[dataPath];
}

// ─── Public plugin interface ──────────────────────────────────────────────────

export let customTypeMapregions = {
  dataType: "mapregions",

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

  getSearchableText: function (data) {
    if (!data || typeof data !== "object") return [];
    const result = [];
    Object.keys(data).forEach(regionCode => {
      const regionName = Checklist.nameForMapRegion(regionCode);
      if (regionName && !result.includes(regionName)) result.push(regionName);
    });
    return result;
  },

  render: function (data, uiContext) {
    return uiContext.placement === "details"
      ? renderDetailsMap(data, uiContext)
      : renderRegionsList(data, uiContext);
  },
};

// ─── Parsing (unchanged from original) ───────────────────────────────────────

function parseRegionString(inputString) {
  const result = { status: "", notes: [] };
  if (inputString == null) return result;
  const safeStringSource = String(inputString);
  if (safeStringSource.trim() === "") return result;

  const placeholder = "§§HASH_PLACEHOLDER§§";
  const safeString  = safeStringSource.replace(/\\#/g, placeholder);
  const parts       = safeString.split("#").map(p => p.trim());

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
    const idxHash  = regionStr.indexOf("#");
    let splitIndex = -1;
    if (idxColon !== -1 && idxHash !== -1) splitIndex = Math.min(idxColon, idxHash);
    else if (idxColon !== -1) splitIndex = idxColon;
    else if (idxHash  !== -1) splitIndex = idxHash;

    let regionCode, tail;
    if (splitIndex === -1) { regionCode = regionStr; tail = ""; }
    else { regionCode = regionStr.substring(0, splitIndex); tail = regionStr.substring(splitIndex); }
    regionCode = regionCode.trim();
    if (!regionCode) return;
    if (tail.startsWith(":")) tail = tail.substring(1);
    result[regionCode] = parseRegionString(tail);
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

// ─── Colour helpers ───────────────────────────────────────────────────────────

function buildRegionColors(data, legendConfig, datasetStats, fixForWorldMap, dataPath) {
  const regionColors  = {};

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

  const dataPath     = uiContext.dataPath;
  const legendConfig = getLegendConfig(dataPath);
  const datasetStats = getCachedDatasetStats(data, legendConfig, dataPath);

  let source = "";
  if (uiContext.meta.template && uiContext.meta.template !== "") {
    source = uiContext.meta.template;
    if (Checklist.handlebarsTemplates[dataPath]) {
      const td = Checklist.getDataObjectForHandlebars("", uiContext.originalData, uiContext.taxon.name, uiContext.taxon.authority);
      source   = Checklist.handlebarsTemplates[dataPath](td);
    }
  }
  if (!source || source.trim() === "") return null;
  if (source.startsWith("/")) source = source.substring(1);

  const mapId   = "map_" + dataPath.replace(/\./g, "_");
  const isWorld = source.toLowerCase().endsWith("world.svg");

  const regionColors = buildRegionColors(data, legendConfig, datasetStats, isWorld, dataPath);
  scheduleColorMap(mapId, regionColors);

  return m(".media-map", [
    m(".media-map-card", [
      m(".image-wrap.clickable.fullscreenable-image", {
        onclick(e) {
          this.classList.toggle("fullscreen");
          this.classList.toggle("clickable");
          e.preventDefault(); e.stopPropagation();
        }
      }, m(`object#${mapId}[style=pointer-events: none; width: 100%; height: auto;][type=image/svg+xml][data=usercontent/${source}]`, {
        onload() {
          clearTimeout(_pendingRecolorTimers[mapId]);
          delete _pendingRecolorTimers[mapId];
          colorSVGMap(this, regionColors);
        }
      })),
      renderMapLegend(legendConfig, datasetStats, data),
      renderMapDataTable(data, dataPath, legendConfig, datasetStats, mapId),
    ]),
  ]);
}

// ─── Legend ───────────────────────────────────────────────────────────────────

/**
 * Render the map legend.
 *
 * Gradient mode: a continuous colour ramp with tick marks pinned at each
 * anchor's proportional position along the ramp.  Labels hang below their
 * tick.  Only the first and last label are always shown; intermediate labels
 * are shown only when the ticks are far enough apart to avoid collision.
 *
 * Stepped mode: colour swatch + label per bin, left-to-right.
 *
 * Category rows always follow numeric rows.
 */
function renderMapLegend(legendConfig, datasetStats, data) {
  const { categoryRows, numericRows, numericMode } = legendConfig;
  const presentStatuses = new Set(Object.values(data).map(r => r?.status ?? ""));
  const presentCatRows  = categoryRows.filter(r => presentStatuses.has(r.status));
  const items = [];

  if (numericMode === "gradient") {
    const css   = gradientCSSForConfig(numericRows, datasetStats);
    const ticks = gradientTicksForConfig(numericRows, datasetStats);
    if (css && ticks.length >= 2) {
      items.push(m(".legend-item.legend-item--gradient",
        m(".map-gradient-widget", [
          // ── Ramp bar ──────────────────────────────────────────────────────
          m(".map-gradient-ramp", { style: { background: css } },
            // Tick lines sit inside the ramp, positioned absolutely
            ticks.map(tick =>
              m(".map-gradient-tick", { style: { left: tick.pct.toFixed(2) + "%" } })
            )
          ),
          // ── Labels row (one per tick, positioned absolutely) ──────────────
          m(".map-gradient-labels",
            ticks.map((tick, i) => {
              // Determine horizontal alignment so edge labels don't overflow
              const align = tick.pct < 15 ? "left" : tick.pct > 85 ? "right" : "center";
              const translateX = align === "left" ? "0%" : align === "right" ? "-100%" : "-50%";
              return m("span.map-gradient-label", {
                style: {
                  left:      tick.pct.toFixed(2) + "%",
                  transform: `translateX(${translateX})`,
                },
                // Mark extremes so CSS can always show them, hide middle ones
                // when tight (controlled via CSS .map-gradient-label--mid)
                class: (i === 0 || i === ticks.length - 1)
                  ? "map-gradient-label--edge"
                  : "map-gradient-label--mid",
              }, tick.legend);
            })
          ),
        ])
      ));
    }
  } else if (numericMode === "stepped") {
    steppedBinsForConfig(numericRows, datasetStats).forEach(bin => {
      items.push(m(".legend-item", [
        m(".map-fill", { style: { backgroundColor: bin.fill } }),
        m(".map-legend-title", bin.legend),
      ]));
    });
  }

  presentCatRows.forEach(r => {
    items.push(m(".legend-item", [
      m(".map-fill", { style: { backgroundColor: r.fill } }),
      m(".map-legend-title", r.legend),
    ]));
  });

  return items.length ? m(".legend.media-map-legend", items) : null;
}

// ─── Data table ───────────────────────────────────────────────────────────────

function renderMapDataTable(data, dataPath, legendConfig, datasetStats, mapId) {
  const isExpanded  = !!_tableExpanded[mapId];
  const regionCodes = Object.keys(data);
  const hasNotes    = regionCodes.some(rc => data[rc].notes?.length > 0);

  const toggleTable = e => {
    _tableExpanded[mapId] = !_tableExpanded[mapId];
    e.stopPropagation();
    m.redraw();
  };

  return m(".map-data-table-wrap", [
    m(".map-data-table-header", { onclick: toggleTable }, [
      m("span.map-data-table-toggle", isExpanded ? "▲" : "▼"),
      m("span.map-data-table-header-label", t("map_data_table")),
      m("span.map-data-table-count", tf("map_data_table_count{0}", [regionCodes.length], true)),
    ]),
    isExpanded ? m(".map-data-table-body",
      m("table.map-data-table", [
        m("thead", m("tr", [
          m("th.map-data-table-th", t("map_data_table_region")),
          m("th.map-data-table-th", t("map_data_table_status")),
          hasNotes ? m("th.map-data-table-th", t("map_data_table_notes")) : null,
        ])),
        m("tbody", regionCodes.map((regionCode, index) => {
          const regionData = data[regionCode];
          const resolved   = getCachedRegionColor(regionData.status ?? "", legendConfig, datasetStats, dataPath);

          // Per spec §4.6: gradient cells show the actual data value; stepped and
          // category cells show the human-readable legend label for the matched bin/row.
          const statusLabel = resolved?.resolvedAs === 'gradient'
            ? (regionData.status ?? "")
            : (resolved?.legend ?? regionData.status ?? "");

          return m("tr.map-data-table-row" + (index % 2 === 0 ? ".map-data-table-row-even" : ""), [
            m("td.map-data-table-td", Checklist.nameForMapRegion(regionCode)),
            m("td.map-data-table-td", [
              m("span.map-data-table-dot", { style: { backgroundColor: resolved?.fill ?? "#ccc" } }),
              m("span", statusLabel),
            ]),
            hasNotes ? m("td.map-data-table-td.map-data-table-td-notes", (regionData.notes || []).join("; ")) : null,
          ]);
        })),
      ])
    ) : null,
  ]);
}

// ─── Regions list ─────────────────────────────────────────────────────────────

function renderRegionsList(data, uiContext) {
  const dataPath     = uiContext.dataPath;
  const legendConfig = getLegendConfig(dataPath);
  const datasetStats = getCachedDatasetStats(data, legendConfig, dataPath);

  const uniqueNotesMap  = new Map();
  const uniqueNotesList = [];
  let   noteCounter     = 1;

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

  const renderedRegions = Object.keys(data).map(regionCode => {
    const regionInfo = data[regionCode];
    const status     = regionInfo.status ?? "";
    const resolved   = getCachedRegionColor(status, legendConfig, datasetStats, dataPath);

    // Per spec §4.6:
    //   category → show appendedLegend from the matched row
    //   stepped  → show appendedLegend from the matched bin (now populated by engine)
    //   gradient → show the actual raw data value in place of appendedLegend
    //   fallback → no appended text
    let appendedLegend = "";
    if (resolved?.resolvedAs === 'gradient') {
      const rawVal = status.trim();
      if (rawVal) {
        appendedLegend = cachedMarkdown(" _(" + rawVal + ")_");
      }
    } else if (resolved?.appendedLegend?.trim()) {
      appendedLegend = cachedMarkdown(" _(" + resolved.appendedLegend + ")_");
    }

    const regionName      = Checklist.nameForMapRegion(regionCode);
    const notesArray      = Array.isArray(regionInfo.notes) ? regionInfo.notes : (regionInfo.notes ? [regionInfo.notes] : []);
    const footnoteIndices = notesArray.map(registerNote).filter(i => i !== null);

    const regionContent = [m("strong", regionName)];
    if (footnoteIndices.length > 0) regionContent.push(m("sup", footnoteIndices.sort((a, b) => a - b).join(",")));
    if (appendedLegend) regionContent.push(m("em", m.trust(appendedLegend)));
    return m("span", regionContent);
  });

  if (!renderedRegions.length) return null;

  const footnotesElements = uniqueNotesList.map((noteHtml, index) =>
    m(".region-footnote", [
      m("sup.region-footnotes-number", (index + 1).toString()),
      "\u00A0",
      m.trust(noteHtml),
    ])
  );

  return m(".map-regions-data", [
    m("span", renderedRegions.reduce((acc, region, index) => {
      if (index > 0) acc.push(", ");
      acc.push(region);
      return acc;
    }, [])),
    footnotesElements.length ? m(".region-footnotes", footnotesElements) : null,
  ]);
}
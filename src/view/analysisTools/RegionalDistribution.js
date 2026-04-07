import m from "mithril";

import "./RegionalDistribution.css";

import { Settings } from "../../model/Settings.js";
import {
  colorFromRatio,
  filterTerminalLeavesForMode,
  relativeToUsercontent,
} from "../../components/Utils.js";
import { Checklist } from "../../model/Checklist.js";
import { colorSVGMap } from "../../components/ColorSVGMap.js";
// ButtonGroup removed in favor of native selects and segmented controls

export const config = {
  id: "tool_regional_distribution",
  label: "Regional Distribution",
  iconPath: {
    light: "./img/ui/menu/view_map-light.svg",
    dark: "./img/ui/menu/view_map.svg",
  },
  info: "Visualize the regional distribution of your data, using filters to map exactly where specific records are concentrated",
  getTaxaAlongsideSpecimens: false,

  getAvailability: (availableIntents, checklistData) => {
    // 1. Filter intents based on whether they yield at least one map
    const supportedIntents = availableIntents.filter(intent => {
      const maps = getAvailableMaps(intent);
      return maps.length > 0;
    });

    // 2. Return the availability object
    return {
      supportedIntents,
      isAvailable: supportedIntents.length > 0,
      toolDisabledReason: "No regional map data found in this dataset.",
      scopeDisabledReason: (intent) => {
        const scopeName = intent === "#T" ? "Taxa" : "Specimens";
        return `${config.label} requires map data to be present with ${scopeName}.`;
      }
    };
  },

  render: ({ filteredTaxa, allTaxa }) => mapChart(filteredTaxa, allTaxa),
};

let currentMap = Settings.mapChartCurrentMap();
let currentSumMethod = Settings.mapChartCurrentSumMethod();

let currentFilterResultsLength = 0;
let sessionCache = {}; // key: map.dataPath, value: __all__ for all mapped occurrences, key:value for region:number matching
let currentRegions = {};

let availableMapsCache = {}; // keyed by chartMode: "taxa" | "specimen"

let oldColoredRegionsJSON = "";
let colors = null;

function globalCountsCacheKey(dataPath) {
  const mapChartMode = Settings.analyticalIntent() === "#S" ? "specimen" : "taxa";
  return dataPath + "|" + mapChartMode;
}

const sumMethods = [
  { name: t("view_map_sum_by_filter"), method: "filter" },
  { name: t("view_map_sum_by_region"), method: "region" },
  { name: t("view_map_sum_by_total"), method: "total" },
];

function mapChart(filteredTaxa, allTaxa) {
  const mapChartMode = Settings.analyticalIntent() === "#S" ? "specimen" : "taxa";
  let currentMapStringified = JSON.stringify(currentMap);
  if (
    !getAvailableMaps().find(
      (map) => JSON.stringify(map) == currentMapStringified
    )
  ) {
    currentMap = null;
  }

  if (Checklist.filter.isEmpty()) {
    currentSumMethod = "total";
  } else {
    currentSumMethod = Settings.mapChartCurrentSumMethod();
  }

  if (currentMap != null) {
    colors = calculateRegionColors(
      filteredTaxa,
      allTaxa,
      currentMap.dataPath,
      currentSumMethod
    );
  }

  return m(".map-chart", [
    renderControlPanel(),
    m(".chart-info-box", [
      m(".chart-info-item", mapVerb()),
      Checklist.hasSpecimens() ? m(".chart-info-item",
        mapChartMode === "taxa" ? t("view_chart_mode_taxa_info") : t("view_chart_mode_specimen_info")
      ) : null
    ]),
    m(".map-and-table-container", [
      currentMap == null ? null : renderMap(currentMap),
      currentMap == null ? null : m(".table-responsive-wrapper", renderDataTable(currentMap.dataPath, currentSumMethod)),
    ]),
  ]);
}

function getAvailableMaps(intent) {
  // Use passed intent for availability checks, fallback to current settings for UI rendering
  const currentIntent = intent || Settings.analyticalIntent();
  const mapChartMode = currentIntent === "#S" ? "specimen" : "taxa";

  if (availableMapsCache[mapChartMode] !== undefined) {
    return availableMapsCache[mapChartMode];
  }

  const specimenMetaIndex = Checklist.getSpecimenMetaIndex();
  const checklist = Checklist.getEntireChecklist();
  const dataMeta = Checklist.getDataMeta();
  let availableMaps = [];

  Object.keys(dataMeta).forEach(function (dataPath) {
    const meta = dataMeta[dataPath];

    if (
      meta.formatting === "map regions" &&
      meta.template &&
      meta.template.trim() !== ""
    ) {
      let source = meta.template;

      if (Checklist.handlebarsTemplates[dataPath]) {
        let templateData = Checklist.getDataObjectForHandlebars("", {}, "", "");
        source = Checklist.handlebarsTemplates[dataPath](templateData);
      }

      if (source && source.trim() !== "") {
        if (source.startsWith("/")) {
          source = source.substring(1);
        }

        const mapPath = relativeToUsercontent(source);

        // Only include this map if at least one row of the current mode has
        // direct (non-inherited) data for this dataPath.
        // In specimen mode we deliberately check taxon.d only — we never
        // infer map availability from the parent taxon's data.
        const hasData = checklist.some((taxon) => {
          const isSpecimen =
            specimenMetaIndex !== -1 &&
            taxon.t[specimenMetaIndex] !== null &&
            taxon.t[specimenMetaIndex] !== undefined;

          if (mapChartMode === "taxa" && isSpecimen) return false;
          if (mapChartMode === "specimen" && !isSpecimen) return false;

          const mapData = Checklist.getDataFromDataPath(taxon.d, dataPath);
          return (
            mapData !== null &&
            mapData !== undefined &&
            typeof mapData === "object" &&
            Object.keys(mapData).length > 0
          );
        });

        if (hasData) {
          availableMaps.push({
            title: meta.title || dataPath,
            dataPath: dataPath,
            source: mapPath,
            isWorldMap: source.toLowerCase().endsWith("world.svg"),
          });
        }
      }
    }
  });

  availableMapsCache[mapChartMode] = availableMaps;
  return availableMaps;
}

function renderControlPanel() {
  return m(".chart-controls-card", [
    m(".chart-control-group.chart-control-group-full", [
      m("label", "Map"),
      m("select.chart-select", {
        value: currentMap ? JSON.stringify(currentMap) : "",
        onchange: (e) => {
          if (!e.target.value) return;
          currentMap = JSON.parse(e.target.value);
          Settings.mapChartCurrentMap(e.target.value);
        }
      }, [
        m("option", { value: "", disabled: true }, "— " + t("view_map_select_map") + " —"),
        ...getAvailableMaps().map((map) =>
          m("option", { value: JSON.stringify(map) }, map.title)
        )
      ])
    ]),

    currentMap == null ? null : m(".chart-control-group", [
      m("label", "Method"),
      Checklist.filter.isEmpty()
        ? m("div.chart-segmented-control.disabled", [m("button.selected", { disabled: true }, t("view_map_no_filter"))])
        : m(".chart-segmented-control", sumMethods.map((mt) =>
          m("button" + (mt.method === currentSumMethod ? ".selected" : ""), {
            onclick: () => {
              if (mt.method === currentSumMethod) return false;
              currentSumMethod = mt.method;
              Settings.mapChartCurrentSumMethod(currentSumMethod);
            }
          }, mt.name)
        ))
    ]),

  ]);
}

function mapVerb() {
  let verb = "";

  if (currentMap === null) {
    return t("view_map_select_map");
  }

  let filterVerb = Settings.pinnedSearches.getHumanNameForSearch(
    JSON.parse(Checklist.queryKey()),
    true
  );

  const suffix = (Settings.analyticalIntent() === "#S") ? "_specimen" : "";
  const filterEmptySuffix = Checklist.filter.isEmpty() ? "_all" : "";

  switch (currentSumMethod) {
    case "filter":
      verb = tf("view_map_verb_filter" + filterEmptySuffix + suffix, [filterVerb]);
      break;
    case "region":
      verb = tf("view_map_verb_region" + filterEmptySuffix + suffix, [filterVerb]);
      break;
    case "total":
      verb = tf("view_map_verb_total" + filterEmptySuffix + suffix, [filterVerb]);
      break;

    default:
      console.error("Unknown sumMethod", currentSumMethod);
      break;
  }

  return m.trust(verb);
}

function renderMap(map) {
  if (map == null) {
    return null;
  }

  let newJSON = JSON.stringify(colors);
  if (newJSON != oldColoredRegionsJSON) {
    oldColoredRegionsJSON = newJSON;
    window.setTimeout(function () {
      colorSVGMap(document.getElementById("map"), colors);
    }, 50);
  }

  return m(".map-chart-image-wrap-outer", [
    m(
      ".map-chart-image-wrap.fullscreenable-image", //.clickable
      {
        onclick: function (e) {
          this.classList.toggle("fullscreen");
          this.classList.toggle("clickable");
          e.preventDefault();
          e.stopPropagation();
        },
      },
      m(
        "object#map" +
        "[style=pointer-events: none;][type=image/svg+xml][data=" +
        map.source +
        "]",
        {
          onload: function () {
            colorSVGMap(this, colors);
          },
        }
      )
    ),
  ]);
}

function renderDataTable(dataPath, sumMethod) {
  const globalCounts = sessionCache[globalCountsCacheKey(dataPath)];

  const mapChartMode = Settings.analyticalIntent() === "#S" ? "specimen" : "taxa";
  const countKey = mapChartMode === "specimen" ? "view_map_count_specimen" : "view_map_count_taxa";

  let sortedRegions = [...Object.keys(currentRegions)];
  sortedRegions.sort((a, b) => {
    let rA = regionRatio(currentRegions[a], globalCounts, a, sumMethod);
    let rB = regionRatio(currentRegions[b], globalCounts, b, sumMethod);
    return rB - rA;
  });

  return m(
    "table.results-table",
    m("tr", [
      m("th.underline[colspan=2]", t("view_map_sum_by_region")),
      m("th.underline", "%"),
      m("th.underline", t(countKey)),
    ]),
    ...[
      sortedRegions.map((regionKey) => {
        let basis = 0;

        switch (sumMethod) {
          case "filter":
            basis = currentFilterResultsLength;
            break;
          case "region":
            basis = globalCounts[regionKey] || currentRegions[regionKey];
            break;
          case "total":
            basis = globalCounts.__all__;
            break;

          default:
            break;
        }

        return m("tr", [
          m("td", Checklist.nameForMapRegion(regionKey)),
          m(
            "td.region-color[style=background-color: " + colors[regionKey] + "]"
          ),
          m(
            "td",
            (
              100.0 *
              regionRatio(
                currentRegions[regionKey],
                globalCounts,
                regionKey,
                sumMethod
              )
            ).toFixed(2) + "% "
          ),
          m("td", currentRegions[regionKey] + " / " + basis),
        ]);
      }),
    ]
  );
}

function calculateRegionColors(filteredTaxa, allTaxa, dataPath, sumMethod) {
  const mapChartMode = Settings.analyticalIntent() === "#S" ? "specimen" : "taxa";
  const specimenMetaIndex = Checklist.getSpecimenMetaIndex();
  const terminalLeaves = filterTerminalLeavesForMode(
    filteredTaxa, mapChartMode, specimenMetaIndex
  );

  currentFilterResultsLength = terminalLeaves.length;
  const cacheKey = globalCountsCacheKey(dataPath);

  if (!Object.keys(sessionCache).includes(cacheKey)) {
    sessionCache[cacheKey] = cacheAllTaxa(allTaxa || Checklist.getEntireChecklist(), dataPath, mapChartMode);
  }
  const globalCounts = sessionCache[cacheKey];
  const regionCounts = {};

  const colors = {};

  terminalLeaves.forEach((taxon) => {
    const effectiveD = mapChartMode === "specimen"
      ? Checklist.getEffectiveDataForNode(taxon, Checklist.getSpecimenMetaIndex(), filteredTaxa)
      : taxon.d;
    const mapData = Checklist.getDataFromDataPath(effectiveD, dataPath);

    const presentRegions = getPresentRegions(mapData);

    if (presentRegions.length > 0) {
      presentRegions.forEach((region) => {
        if (!regionCounts[region]) {
          regionCounts[region] = 0;
        }
        regionCounts[region]++;
      });
    }
  });

  currentRegions = regionCounts;

  let unscaledRatios = {};

  Object.keys(regionCounts).forEach((regionKey) => {
    const regionCount = regionCounts[regionKey];

    unscaledRatios[regionKey] = regionRatio(
      regionCount,
      globalCounts,
      regionKey,
      sumMethod
    );
  });

  let minRatio = Math.min(...Object.values(unscaledRatios));
  let maxRatio = Math.max(...Object.values(unscaledRatios));

  Object.keys(regionCounts).forEach((regionKey) => {
    let ratio = unscaledRatios[regionKey];

    if (ratio == 0) {
      colors[regionKey] = "#fff";
    } else if (ratio == 1) {
      colors[regionKey] = "indianred";
    } else {
      let scaledRatio = scaleToZeroOne(ratio, minRatio, maxRatio);
      colors[regionKey] = colorFromRatio(scaledRatio);
    }
  });

  return colors;
}

function scaleToZeroOne(value, min, max) {
  // Handle edge case where all values are the same
  if (min === max) {
    return 0.5; // Scale all to the middle of the range
  }

  return (value - min) / (max - min);
}

function regionRatio(regionCount, globalCounts, regionKey, sumMethod) {
  let ratio = 0;
  switch (sumMethod) {
    case "region":
      // Fallback to regionCount to prevent NaN if global cache is missing the key
      let denom = globalCounts[regionKey];
      if (!denom) denom = regionCount;
      ratio = (1.0 * regionCount) / denom;
      break;
    case "filter":
      ratio = (1.0 * regionCount) / currentFilterResultsLength;
      break;
    case "total":
      ratio = (1.0 * regionCount) / globalCounts.__all__;
      break;
    default:
      break;
  }

  return ratio;
}

function getPresentRegions(mapData) {
  // Work directly with object format
  if (typeof mapData === "object" && mapData) {
    return Object.keys(mapData);
  }
  return [];
}

function cacheAllTaxa(allTaxa, dataPath, mode) {
  let cache = { __all__: 0 };
  const specimenMetaIndex = Checklist.getSpecimenMetaIndex();

  // Use the exact same leaf filter as the numerator
  const terminalLeaves = filterTerminalLeavesForMode(allTaxa, mode, specimenMetaIndex);

  terminalLeaves.forEach((taxon) => {
    // Dynamically pull data based on mode, mirroring calculateRegionColors
    const effectiveD = mode === "specimen"
      ? Checklist.getEffectiveDataForNode(taxon, specimenMetaIndex, allTaxa)
      : taxon.d;

    const mapData = Checklist.getDataFromDataPath(effectiveD, dataPath);
    const presentRegions = getPresentRegions(mapData);

    if (presentRegions.length > 0) {
      presentRegions.forEach((region) => {
        if (!cache[region]) {
          cache[region] = 0;
        }
        cache[region]++;
      });
      cache.__all__++;
    }
  });

  return cache;
}
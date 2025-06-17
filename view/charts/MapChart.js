import { Settings } from "../../model/Settings.js";
import {
  colorFromRatio,
  colorSVGMap,
  filterTerminalLeaves,
  sortByCustomOrder,
} from "../../components/Utils.js";
import { Checklist } from "../../model/Checklist.js";
import { _t, _tf } from "../../model/I18n.js";
import { ButtonGroup } from "../ChecklistView.js";

let currentMap = Settings.mapChartCurrentMap();
let currentSumMethod = Settings.mapChartCurrentSumMethod();

let currentFilterResultsLength = 0;
let sessionCache = {}; // key: map.columnName, value: __all__ for all mapped occurrences, key:value for region:number matching
let currentRegions = {};

let oldColoredRegionsJSON = "";
let colors = null;

const sumMethods = [
  { name: _t("view_map_sum_by_filter"), method: "filter" },
  { name: _t("view_map_sum_by_region"), method: "region" },
  { name: _t("view_map_sum_by_total"), method: "total" },
];

export function mapChart(filteredTaxa) {
  let currentMapStringified = JSON.stringify(currentMap);
  if (
    !getAvailableMaps().find(
      (map) => JSON.stringify(map) == currentMapStringified
    )
  ) {
    currentMap = null;
  }

  if (currentMap != null) {
    colors = calculateRegionColors(
      filteredTaxa,
      currentMap.columnName,
      currentSumMethod
    );
  }

  if (Checklist.filter.isEmpty()) {
    currentSumMethod = "total";
  } else {
    currentSumMethod = Settings.mapChartCurrentSumMethod();
  }

  return m(".map-chart", [
    renderControlPanel(),
    m(".map-verb", mapVerb()),
    m(".map-table-wrapper", [
      currentMap == null
        ? null
        : renderMap(
            currentMap,
            currentMap.columnName,
            currentSumMethod,
            filteredTaxa
          ),
      currentMap == null
        ? null
        : renderDataTable(currentMap.columnName, currentSumMethod),
    ]),
  ]);
}

export function getAvailableMaps() {
  let maps = [];

  //content
  try {
    Object.keys(Checklist.getDataMeta("maps")).forEach(function (metaKey) {
      let meta = Checklist.getDataMeta("maps")[metaKey];
      if (meta.datatype == "map" && meta.type == "regions") {
        maps.push({
          url: meta.source,
          title: meta.title,
          columnName: metaKey,
        });
      }
    });
  } catch (ex) {
    console.log("Error while loading maps", ex);
    return [];
  }

  return maps;
}

function renderControlPanel() {
  return m(".control-panel", [
    mapsSelector(),
    currentMap == null ? null : sumMethodSelector(),
  ]);

  function mapsSelector() {
    return m(ButtonGroup, {
      label: "Map",
      buttons: getAvailableMaps().map((map) =>
        m(
          "button" +
            (JSON.stringify(map) === JSON.stringify(currentMap)
              ? ".selected"
              : ""),
          {
            onclick: () => {
              if (JSON.stringify(map) === JSON.stringify(currentMap))
                return false;
              currentMap = map;
              Settings.mapChartCurrentMap(JSON.stringify(currentMap));
            },
          },
          map.title
        )
      ),
    });
  }

  function sumMethodSelector() {
    return Checklist.filter.isEmpty()
      ? m("span.hint", _t("view_map_no_filter"))
      : m(ButtonGroup, {
          label: "Method",
          buttons: sumMethods.map((mt) =>
            m(
              "button" + (mt.method === currentSumMethod ? ".selected" : ""),
              {
                onclick: () => {
                  if (mt.method === currentSumMethod) return false;
                  currentSumMethod = mt.method;
                  Settings.mapChartCurrentSumMethod(currentSumMethod);
                },
              },
              mt.name
            )
          ),
        });
  }
}

function mapVerb() {
  let verb = "";

  if (currentMap === null) {
    return _t("view_map_select_map");
  }

  let filterVerb = Settings.pinnedSearches.getHumanNameForSearch(
    JSON.parse(Checklist.queryKey()),
    true
  );

  switch (currentSumMethod) {
    case "filter":
      verb = _tf(
        "view_map_verb_filter" + (Checklist.filter.isEmpty() ? "_all" : ""),
        [filterVerb]
      );
      break;
    case "region":
      verb = _tf(
        "view_map_verb_region" + (Checklist.filter.isEmpty() ? "_all" : ""),
        [filterVerb]
      );
      break;
    case "total":
      verb = _tf(
        "view_map_verb_total" + (Checklist.filter.isEmpty() ? "_all" : ""),
        [filterVerb]
      );
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
          "[style=pointer-events: none;][type=image/svg+xml][data=usercontent/maps/" +
          map.url +
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

function renderDataTable(columnName, sumMethod) {
  const globalCounts = sessionCache[columnName];

  let sortedRegions = [...Object.keys(currentRegions)];
  sortedRegions.sort((a, b) => {
    let rA = regionRatio(currentRegions[a], globalCounts, a, sumMethod);
    let rB = regionRatio(currentRegions[b], globalCounts, b, sumMethod);
    return rB - rA;
  });

  return m(
    "table.results-table",
    m("tr", [
      m("th.underline[colspan=2]", "Region"),
      m("th.underline", "%"),
      m("th.underline", _t("view_map_count")),
    ]),
    ...[
      sortedRegions.map((regionKey) => {
        let basis = 0;

        switch (sumMethod) {
          case "filter":
            basis = currentFilterResultsLength;
            break;
          case "region":
            basis = globalCounts[regionKey];
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

function calculateRegionColors(filteredTaxa, columnName, sumMethod) {
  const terminalLeaves = filterTerminalLeaves(filteredTaxa);
  currentFilterResultsLength = terminalLeaves.length;

  if (!Object.keys(sessionCache).includes(columnName)) {
    sessionCache[columnName] = cacheAllTaxa(columnName);
  }
  const globalCounts = sessionCache[columnName];
  const regionCounts = {};

  const colors = {};

  terminalLeaves.forEach((taxon) => {
    const mapData = Checklist.getDataFromDataPath(taxon.d, columnName);
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
      ratio = (1.0 * regionCount) / globalCounts[regionKey];
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

function cacheAllTaxa(columnName) {
  let cache = { __all__: 0 };

  filterTerminalLeaves(Checklist.getEntireChecklist()).forEach((taxon) => {
    const mapData = Checklist.getDataFromDataPath(taxon.d, columnName);
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

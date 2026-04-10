/*
 * MAP REGIONS DATA FORMATS
 *
 * The reader automatically detects the format based on column headers:
 *
 * 1. INLINE FORMAT (Single Cell)
 * Target: All regions listed in one cell.
 * Header: [root] (e.g., "map")
 * Syntax: "RegionCode:Status#Note | RegionCode:Status"
 * - Pipe (|): Separates distinct regions.
 * - Colon (:): Separates Region Code from Status.
 *
 * 2. MULTICOLUMN FORMAT (Column-per-Region)
 * Target: Dedicated columns for specific regions.
 * Header: [root].[regionCode] (e.g., "map.fr", "map.de")
 * Syntax: "Status#Note" (Region code is derived from header).
 *
 * COMMON SYNTAX RULES:
 * - Notes: Start with a hash (#). Multiple notes allowed (e.g., "Status#Note1#Note2").
 * - Escaping: Use "\#" to represent a literal hash symbol in text.
 */

import m from "mithril";

import { nlDataStructure } from "../DataManagerData.js";
import { Checklist } from "../Checklist.js";
import { processMarkdownWithBibliography, relativeToUsercontent } from "../../components/Utils.js";
import { Logger } from "../../components/Logger.js";
import { colorSVGMap } from "../../components/ColorSVGMap.js";

const nlData = nlDataStructure;

export let customTypeMapRegions = {
  dataType: "mapregions",
  readData: function (context, computedPath) {
    const { headers, row, langCode } = context;
    const lowerPath = computedPath.toLowerCase();

    // Optimization: strict prefix check to avoid false positives
    const concernedColumns = headers.filter((h) =>
      h === lowerPath ||
      h.toLowerCase().startsWith(lowerPath + ".")
    );

    let resultObject = {};

    // DETECT MODE:
    // We use Multi-column mode ONLY if we detect columns that are children 
    // (longer than the root path). 
    // If we only found the root column (or nothing), we default to Inline.
    const hasChildColumns = concernedColumns.some(col => col.length > lowerPath.length);

    if (concernedColumns.length === 0 || !hasChildColumns) {
      // Inline format (single cell)
      const mapRegions = readSimpleData(context, computedPath);
      resultObject = parseInlineMapRegions(mapRegions);
    } else {
      // Column-per-region format
      // We filter out the root column itself to prevent it from being parsed 
      // as a region with an empty code in the multi-column parser.
      const childColumnsOnly = concernedColumns.filter(col => col.length > lowerPath.length);

      resultObject = parseColumnMapRegions(
        childColumnsOnly,
        context,
        computedPath
      );
    }

    // Validate region codes
    const regionNamesData = nlData.sheets.appearance.tables.mapRegionsNames.data[langCode];
    if (!regionNamesData) {
      Logger.error(
        tf("dm_mapregions_names_table_not_loaded", [computedPath, langCode])
      );
    } else {
      const knownRegionCodes = regionNamesData.map((x) => x.code);
      Object.keys(resultObject).forEach((regionCode) => {
        if (!knownRegionCodes.includes(regionCode)) {
          Logger.error(
            tf("dm_mapregions_unknown_region_code", [regionCode, computedPath, JSON.stringify(resultObject)])
          );
        }
      });
    }

    return resultObject;
  },

  /**
   * Extract searchable text from mapregions data
   * @param {any} data - The mapregions object
   * @param {Object} uiContext - UI context with langCode
   * @returns {string[]} Array of searchable strings (region names)
   */
  getSearchableText: function (data, uiContext) {
    if (!data || typeof data !== "object") return [];

    const result = [];

    // Use Checklist API to get region names (handles language internally)
    // This is safer than accessing nlDataStructure directly
    Object.keys(data).forEach(regionCode => {
      // Use the cached nameForMapRegion function from Checklist
      const regionName = Checklist.nameForMapRegion(regionCode);
      if (regionName && !result.includes(regionName)) {
        result.push(regionName);
      }
    });

    return result;
  },

  render: function (data, uiContext) {
    if (uiContext.placement === "details") {
      return renderDetailsMap(data, uiContext);
    } else {
      return renderRegionsList(data, uiContext);
    }
  },
};

function getRegionColors(regions, fixForWorldMap) {
  let regionColors = {
    //regionCode: #color
  };

  Object.keys(regions).forEach(function (regionCode) {
    let regionData = regions[regionCode];

    if (regionData === null || regionCode.trim() == "") {
      return;
    }

    let mapRegionMeta = getRegionMeta(regionData);

    if (fixForWorldMap) {
      //hotfix for countries with very wide span and overseas territories
      if (regionCode == "fr") regionCode = "frx";
      if (regionCode == "nl") regionCode = "nlx";
      if (regionCode == "cn") regionCode = "cnx";
    }

    regionColors[regionCode] = mapRegionMeta.fill;
  });

  return regionColors;
}

function getRegionMeta(region) {
  let found = Checklist.getMapRegionsMeta().find(function (mapRegionMeta) {
    if (region.status == mapRegionMeta.status) {
      return true;
    }
    return false;
  });

  if (found) {
    return found;
  } else {
    return Checklist.getMapRegionsMeta(true);
  }
}

// --- Parsing Logic  ---

/**
 * Parses the tail of a string (Status and Notes).
 * Handles escaping: \# becomes a literal #.
 * Syntax: [Status][#Note][#Note]
 */
function parseRegionString(inputString) {
  const result = {
    status: "",
    notes: [], // Always array
  };

  if (inputString === null || inputString === undefined) {
    return result;
  }

  // FORCE STRING: Handle numbers (e.g. 2024) or booleans being passed in
  const safeStringSource = String(inputString);

  if (safeStringSource.trim() === "") {
    return result;
  }

  // 1. Tokenize by '#' but respect '\#' (escaped)
  // We use a temporary placeholder for escaped hashes to allow simple splitting
  const placeholder = "§§HASH_PLACEHOLDER§§";
  const safeString = inputString.replace(/\\#/g, placeholder);

  const parts = safeString.split("#").map(part => part.trim());

  // 2. Extract Status (First segment)
  // If the original string started with '#', the first part is empty -> empty status
  if (parts.length > 0) {
    result.status = parts[0].replace(new RegExp(placeholder, "g"), "#");
  }

  // 3. Extract Notes (Subsequent segments)
  for (let i = 1; i < parts.length; i++) {
    const note = parts[i].replace(new RegExp(placeholder, "g"), "#");
    if (note !== "") {
      result.notes.push(note.replace(/\r?\n/g, " "));
    }
  }

  return result;
}

// Parse inline format: "regionA:stat#note | regionB#note"
function parseInlineMapRegions(mapRegions) {
  const result = {};

  if (!mapRegions || mapRegions.trim() === "") {
    return result;
  }

  // Split by pipe separators
  const regions = mapRegions.split("|").map((r) => r.trim());

  regions.forEach((regionStr) => {
    if (regionStr === "") return;

    // Determine where the Code ends and the Status/Notes begin.
    // Code ends at the first Colon (:) OR the first Hash (#), whichever comes first.
    // If neither exists, the whole string is the Code.

    const idxColon = regionStr.indexOf(":");
    const idxHash = regionStr.indexOf("#");

    let splitIndex = -1;

    if (idxColon !== -1 && idxHash !== -1) {
      splitIndex = Math.min(idxColon, idxHash);
    } else if (idxColon !== -1) {
      splitIndex = idxColon;
    } else if (idxHash !== -1) {
      splitIndex = idxHash;
    }

    let regionCode = "";
    let tail = "";

    if (splitIndex === -1) {
      regionCode = regionStr;
      tail = ""; // Code only, no status, no notes
    } else {
      regionCode = regionStr.substring(0, splitIndex);
      tail = regionStr.substring(splitIndex);
    }

    regionCode = regionCode.trim();
    if (regionCode === "") return;

    // Remove the leading colon if it exists (it separates code from status)
    // Note: We do NOT remove a leading #, because parseRegionString expects # to start notes
    if (tail.startsWith(":")) {
      tail = tail.substring(1);
    }

    result[regionCode] = parseRegionString(tail);
  });

  return result;
}

// Parse column-per-region format
function parseColumnMapRegions(concernedColumns, context, computedPath) {
  const result = {};

  concernedColumns.forEach((columnName) => {
    const data = readSimpleData(context, columnName);

    if (data && data.toString().trim() !== "") {
      // Extract code from header: "map.fr" -> "fr"
      // computedPath is "map", columnName is "map.fr"
      const regionCode = columnName.substring(computedPath.length + 1);

      // Parse the cell content directly as status/notes
      result[regionCode] = parseRegionString(data.toString());
    }
  });

  return result;
}


// --- UI Rendering ---

// Tracks which map data tables are expanded, keyed by mapId
const _tableExpanded = {};

// Render SVG map for details view
function renderDetailsMap(data, uiContext) {
  if (typeof data === "object" && data !== null) {
    const regionCodes = Object.keys(data);

    if (regionCodes.length === 0) {
      return null;
    }

    // Gather meta for legend
    let presentRegionsMeta = [];
    let presentRegionsMetaStatuses = [];

    const allMeta = [].concat(
      Checklist.getMapRegionsMeta(true),
      Checklist.getMapRegionsMeta()
    );

    allMeta.forEach(function (mapRegionMeta) {
      regionCodes.forEach(function (regionCode) {
        const regionData = data[regionCode];
        const status = regionData.status || "";

        if (
          status === mapRegionMeta.status &&
          !presentRegionsMetaStatuses.includes(mapRegionMeta.status)
        ) {
          presentRegionsMetaStatuses.push(mapRegionMeta.status);
          presentRegionsMeta.push(mapRegionMeta);
        }
      });
    });

    let source = "";
    if (uiContext.meta.template && uiContext.meta.template !== "") {
      source = uiContext.meta.template;
      if (Checklist.handlebarsTemplates[uiContext.dataPath]) {
        let templateData = Checklist.getDataObjectForHandlebars(
          "",
          uiContext.originalData,
          uiContext.taxon.name,
          uiContext.taxon.authority
        );
        source = Checklist.handlebarsTemplates[uiContext.dataPath](templateData);
      }
    }

    if (!source || source.trim() === "") {
      return null;
    }

    if (source.startsWith("/")) {
      source = source.substring(1);
    }

    const mapId = "map_" + uiContext.dataPath.replace(/\./g, "_");

    window.setTimeout(function () {
      let map = document.getElementById(mapId);
      if (map) {
        colorSVGMap(
          map,
          getRegionColors(data, source.toLowerCase().endsWith("world.svg"))
        );
      }
    }, 50);

    return m(".media-map", [
      // ── Single unified card ─────────────────────────────────────────────
      m(".media-map-card", [
        m(
          ".image-wrap.clickable.fullscreenable-image",
          {
            onclick: function (e) {
              this.classList.toggle("fullscreen");
              this.classList.toggle("clickable");
              e.preventDefault();
              e.stopPropagation();
            },
          },
          m(
            "object#" +
            mapId +
            "[style=pointer-events: none; width: 100%; height: auto;][type=image/svg+xml][data=usercontent/" +
            source +
            "]",
            {
              onload: function () {
                colorSVGMap(
                  this,
                  getRegionColors(
                    data,
                    source.toLowerCase().endsWith("world.svg")
                  )
                );
              },
            }
          )
        ),
        // Legend row — only when there are statuses to show
        Object.keys(presentRegionsMeta).length === 0
          ? null
          : m(
            ".legend.media-map-legend",
            Object.values(presentRegionsMeta).map(function (regionMeta) {
              return m(".legend-item", [
                m(".map-fill[style=background-color: " + regionMeta.fill + "]"),
                m(".map-legend-title", regionMeta.legend),
              ]);
            })
          ),
        // Data table toggle — flush footer of the same card
        renderMapDataTable(data, mapId),
      ]),
    ]);
  }
}

/**
 * Renders a collapsible data table as a flush footer section of the map card.
 */
function renderMapDataTable(data, mapId) {
  const isExpanded = !!_tableExpanded[mapId];
  const regionCodes = Object.keys(data);
  const hasNotes = regionCodes.some(
    (rc) => data[rc].notes && data[rc].notes.length > 0
  );

  const toggleTable = function (e) {
    _tableExpanded[mapId] = !_tableExpanded[mapId];
    e.stopPropagation();
    m.redraw();
  };

  return m(".map-data-table-wrap", [
    m(".map-data-table-header", { onclick: toggleTable }, [
      m("span.map-data-table-toggle", isExpanded ? "▲" : "▼"),
      m("span.map-data-table-header-label", t("map_data_table")),
      m(
        "span.map-data-table-count",
        tf("map_data_table_count{0}", [regionCodes.length], true)
      ),
    ]),

    isExpanded
      ? m(".map-data-table-body", [
        m("table.map-data-table", [
          m(
            "thead",
            m("tr", [
              m("th.map-data-table-th", t("map_data_table_region")),
              m("th.map-data-table-th", t("map_data_table_status")),
              hasNotes
                ? m("th.map-data-table-th", t("map_data_table_notes"))
                : null,
            ])
          ),
          m(
            "tbody",
            regionCodes.map(function (regionCode, index) {
              const regionData = data[regionCode];
              const regionMeta = getRegionMeta(regionData);
              const regionName = Checklist.nameForMapRegion(regionCode);
              const notesText = (regionData.notes || []).join("; ");

              return m(
                "tr.map-data-table-row" +
                (index % 2 === 0 ? ".map-data-table-row-even" : ""),
                [
                  m("td.map-data-table-td", regionName),
                  m("td.map-data-table-td", [
                    m(
                      "span.map-data-table-dot[style=background-color: " +
                      regionMeta.fill +
                      "]"
                    ),
                    m("span", regionMeta.legend),
                  ]),
                  hasNotes
                    ? m(
                      "td.map-data-table-td.map-data-table-td-notes",
                      notesText
                    )
                    : null,
                ]
              );
            })
          ),
        ]),
      ])
      : null,
  ]);
}

// Render regions list for default view
function renderRegionsList(data, uiContext) {
  const mapRegionsStatuses = Checklist.getMapRegionsMeta();

  // 1. Global deduplication of notes for this specific call
  // Map: "Processed Note Text" -> Footnote Number (1-based)
  const uniqueNotesMap = new Map();
  const uniqueNotesList = [];
  let noteCounter = 1;

  // Helper to process and register a note
  function registerNote(rawNote) {
    if (!rawNote || rawNote.trim() === "") return null;

    const processed = processMarkdownWithBibliography(rawNote.trim());

    if (!uniqueNotesMap.has(processed)) {
      uniqueNotesMap.set(processed, noteCounter);
      uniqueNotesList.push(processed);
      noteCounter++;
    }

    return uniqueNotesMap.get(processed);
  }

  // 2. Build render objects for regions
  const renderedRegions = Object.keys(data).map((regionCode) => {
    const regionInfo = data[regionCode];
    const status = regionInfo.status || "";

    // Get Appended Legend (Italics status)
    let appendedLegend = mapRegionsStatuses.find(
      (item) => item.status === status
    )?.appendedLegend;

    if (appendedLegend && appendedLegend.trim() !== "") {
      appendedLegend = processMarkdownWithBibliography(" _(" + appendedLegend + ")_");
    } else {
      appendedLegend = "";
    }

    const regionName = Checklist.nameForMapRegion(regionCode);

    // Process Notes for this region
    // Ensure notes is an array (fallback for legacy data if any)
    const notesArray = Array.isArray(regionInfo.notes) ? regionInfo.notes : (regionInfo.notes ? [regionInfo.notes] : []);

    const footnoteIndices = notesArray
      .map(registerNote)
      .filter(idx => idx !== null);

    // Create Region Name Element with Superscripts
    let regionContent = [m("strong", regionName)];

    if (footnoteIndices.length > 0) {
      // Add sorted indices separated by comma
      // Optimization: Sort indices for consistent display (e.g. "Region 1,3")
      const indicesStr = footnoteIndices.sort((a, b) => a - b).join(",");
      regionContent.push(m("sup", indicesStr));
    }

    if (appendedLegend) {
      regionContent.push(m("em", m.trust(appendedLegend)));
    }

    return m("span", regionContent);
  });

  if (renderedRegions.length === 0) {
    return null;
  }

  // 3. Create Footnotes Elements
  const footnotesElements = uniqueNotesList.map((noteHtml, index) =>
    m(".region-footnote", [
      m("sup.region-footnotes-number", (index + 1).toString()),
      "\u00A0", // non-breaking space
      m.trust(noteHtml),
    ])
  );

  return m(".map-regions-data", [
    m(
      "span",
      renderedRegions.reduce((acc, region, index) => {
        if (index > 0) acc.push(", ");
        acc.push(region);
        return acc;
      }, [])
    ),
    footnotesElements.length > 0
      ? m(".region-footnotes", footnotesElements)
      : null,
  ]);
}

// Helper function to read simple data from context
function readSimpleData(context, path) {
  const { headers, row, langCode } = context;

  let columnIndex = headers.indexOf(path);
  if (columnIndex < 0) {
    columnIndex = headers.indexOf(path + ":" + langCode);
  }

  if (columnIndex >= 0 && row[columnIndex] !== undefined) {
    return row[columnIndex];
  }

  return null;
}
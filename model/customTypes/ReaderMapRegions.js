import { nlDataStructure } from "../DataManagerData.js";
import { Checklist } from "../Checklist.js";
import { processMarkdownWithBibliography, relativeToUsercontent, colorSVGMap, getRegionColors } from "../../components/Utils.js";

const nlData = nlDataStructure;

export let readerMapRegions = {
  dataType: "map regions",
  readData: function (context, computedPath) {
    const { headers, row, langCode } = context;
    const concernedColumns = headers.filter((h) =>
      h.toLowerCase().startsWith(computedPath.toLowerCase() + ".")
    );

    let mapRegions = "";
    let resultObject = {};

    if (concernedColumns.length == 0) {
      // mapRegions are already inline format
      mapRegions = readSimpleData(context, computedPath);
      resultObject = parseInlineMapRegions(mapRegions, langCode);
    } else {
      // column-per-region format
      resultObject = parseColumnMapRegions(
        concernedColumns,
        context,
        computedPath
      );
    }

    // Validate region codes
    let knownRegionCodes = nlData.sheets.appearance.tables.mapRegionsNames.data[
      langCode
    ].map((x) => x.code);

    Object.keys(resultObject).forEach((regionCode) => {
      if (!knownRegionCodes.includes(regionCode)) {
        Logger.error(
          "Region code '" +
            regionCode +
            "' in column '" +
            computedPath +
            "' doesn't have any Region name set in the table 'Map regions information'. Region codes can be only composed of lowercase letters a-z"
        );
      }
    });

    return resultObject;
  },
  dataToUI: function (data, uiContext) {
    if (uiContext.placement === "details") {
      return renderDetailsMap(data, uiContext);
    } else {
      return renderRegionsList(data, uiContext);
    }
  },
};

// Render SVG map for details view
function renderDetailsMap(data, uiContext) {
  // Handle regions SVG map rendering
  if (typeof data === "object" && data !== null) {
    const regionCodes = Object.keys(data);

    if (regionCodes.length == 0) {
      return null;
    }

    let presentRegionsMeta = [];
    let presentRegionsMetaSuffixes = [];

    []
      .concat(
        Checklist.getMapRegionsMeta(true),
        Checklist.getMapRegionsMeta()
      )
      .forEach(function (mapRegionMeta) {
        regionCodes.forEach(function (regionCode) {
          const regionData = data[regionCode];
          const suffix =
            regionData.suffix || regionData.status || "";

          if (
            suffix == mapRegionMeta.suffix &&
            presentRegionsMetaSuffixes.indexOf(
              mapRegionMeta.suffix
            ) < 0
          ) {
            presentRegionsMetaSuffixes.push(mapRegionMeta.suffix);
            presentRegionsMeta.push(mapRegionMeta);
          }
        });
      });

    // Convert to legacy format for colorSVGMap compatibility
    let reformattedMediaRegions = "";
    Object.keys(data).forEach((regionCode) => {
      const regionData = data[regionCode];
      const suffix = regionData.suffix || regionData.status || "";
      reformattedMediaRegions += regionCode + ":" + suffix + " ";
    });
    const mapRegionsString = reformattedMediaRegions.trim();

    // Get source from meta template
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
    else{
      if(source.startsWith("/")) {
        source = source.substring(1); // Remove leading slash if present
      }
    }

    const mapId = "map_" + uiContext.dataPath.replace(/\./g, '_');

    window.setTimeout(function () {
      let map = document.getElementById(mapId);
      colorSVGMap(
        map,
        getRegionColors(
          mapRegionsString,
          source.toLowerCase().endsWith("world.svg")
        )
      );
    }, 50);

    return m(".media-map", [
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
                  mapRegionsString,
                  source.toLowerCase().endsWith("world.svg")
                )
              );
            },
          }
        )
      ),
      m(
        ".legend",
        Object.keys(presentRegionsMeta).length == 0
          ? null
          : Object.values(presentRegionsMeta).map(function (
              regionMeta
            ) {
              return m(".legend-item", [
                m(
                  ".map-fill[style=background-color: " +
                    regionMeta.fill +
                    "]"
                ),
                m(".map-legend-title", regionMeta.legend),
              ]);
            })
      ),
      //uiContext.meta.title ? m(".title", uiContext.meta.title) : null,
    ]);
  }
}

// Render regions list for default view
function renderRegionsList(data, uiContext) {
  let mapRegionsSuffixes = Checklist.getMapRegionsMeta();

  // Preprocess all notes once to avoid modifying original data
  const preprocessedData = {};
  Object.keys(data).forEach((regionCode) => {
    const regionInfo = data[regionCode];
    preprocessedData[regionCode] = {
      ...regionInfo,
      notes:
        regionInfo.notes && regionInfo.notes.trim() !== ""
          ? processMarkdownWithBibliography(regionInfo.notes.trim())
          : regionInfo.notes,
    };
  });

  // Collect and deduplicate notes
  const notesMap = new Map(); // note text -> footnote number
  const footnotes = []; // array of unique notes
  let footnoteCounter = 1;

  // First pass: collect unique notes (using preprocessed data)
  Object.keys(preprocessedData).forEach((regionCode) => {
    const regionInfo = preprocessedData[regionCode];
    if (regionInfo.notes && regionInfo.notes.trim() !== "") {
      const noteText = regionInfo.notes.trim();
      if (!notesMap.has(noteText)) {
        notesMap.set(noteText, footnoteCounter);
        footnotes.push(noteText);
        footnoteCounter++;
      }
    }
  });

  // Work directly with object format (using preprocessed data)
  const renderedRegions = Object.keys(preprocessedData).map(
    (regionCode) => {
      const regionInfo = preprocessedData[regionCode];

      let appendedLegend = mapRegionsSuffixes.find(
        (item) =>
          item.suffix == (regionInfo.suffix || regionInfo.status || "")
      )?.appendedLegend;

      if (
        appendedLegend === undefined ||
        appendedLegend === null ||
        appendedLegend.trim() === ""
      ) {
        appendedLegend = "";
      } else {
        appendedLegend = processMarkdownWithBibliography(
          " _(" + appendedLegend + ")_"
        );
      }

      let regionName = Checklist.nameForMapRegion(regionCode);

      // Create region name element with optional footnote
      let regionNameElement;
      if (regionInfo.notes && regionInfo.notes.trim() !== "") {
        const footnoteNumber = notesMap.get(regionInfo.notes.trim());
        regionNameElement = [
          m("strong", regionName),
          m("sup", footnoteNumber),
        ];
      } else {
        regionNameElement = m("strong", regionName);
      }

      // Create the full region element with appended legend in italics
      if (appendedLegend && appendedLegend.trim() !== "") {
        return m("span", [
          regionNameElement,
          m("em", m.trust(appendedLegend)),
        ]);
      } else {
        return m("span", regionNameElement);
      }
    }
  );

  if (renderedRegions.length == 0) {
    return null;
  }

  // Create footnotes elements
  const footnotesElements =
    footnotes.length > 0
      ? footnotes.map((note, index) =>
          m(".region-footnote", [
            m("sup.region-footnotes-number", (index + 1).toString()),
            "\u00A0", // non-breaking space
            m.trust(note),
          ])
        )
      : [];

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

// Parse inline format: "regionA:?:noteA | regionB | regionC:! | regionD:?:noteD"
function parseInlineMapRegions(mapRegions) {
  const result = {};

  if (!mapRegions || mapRegions.trim() === "") {
    return result;
  }

  // Split by pipe separators
  const regions = mapRegions.split("|").map((r) => r.trim());

  regions.forEach((regionStr) => {
    if (regionStr.trim() === "") return;

    const parts = regionStr.split(":");
    const regionCode = parts[0].trim();

    if (regionCode === "") return;

    // Initialize region object with empty status and notes
    const regionObj = {
      status: "",
      notes: "",
    };

    // If there's a status part
    if (parts.length >= 2 && parts[1].trim() !== "") {
      regionObj.status = parts[1].trim();
    }

    // If there's a notes part
    if (parts.length >= 3 && parts[2].trim() !== "") {
      regionObj.notes = parts[2].trim();
    }

    result[regionCode] = regionObj;
  });

  return result;
}

// Parse column-per-region format
function parseColumnMapRegions(concernedColumns, context, computedPath) {
  const result = {};

  concernedColumns.forEach((columnName) => {
    const data = readSimpleData(context, columnName);

    if (data && data.trim() !== "") {
      const regionCode = columnName.substring(computedPath.length + 1);

      // Check if data contains vertical bar for notes
      if (data.includes("|")) {
        const parts = data.split("|").map((p) => p.trim());
        const suffix = parts[0];
        const note = parts.length > 1 ? parts.slice(1).join("|").trim() : "";

        result[regionCode] = {
          status: suffix,
          notes: note,
        };
      } else {
        // Just the suffix
        result[regionCode] = {
          status: data.trim(),
          notes: "",
        };
      }
    }
  });

  return result;
}
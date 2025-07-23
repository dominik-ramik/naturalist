import {
  cssColorNames,
  indexOfCaseInsensitive,
  isValidHttpUrl,
  pad,
  relativeToUsercontent,
  splitN,
  parseRegionCode,
  formatList,
} from "../components/Utils.js";
import { nlDataStructure } from "./DataManagerData.js";
import { i18n, _t, _tf } from "./I18n.js";
import { TinyBibReader } from "../lib/TinyBibMD.js";
import { Checklist } from "../model/Checklist.js";
import { loadDataByType, clearDataCodesCache } from "./customTypes/index.js";
import { Logger } from "../components/Logger.js";
import { dataPath } from "./DataPath.js";

export let DataManager = function () {
  const data = nlDataStructure;

  function compileChecklist(checkAssetsSize) {
    let currentDate = new Date();

    let currentDateString =
      currentDate.getFullYear() +
      "-" +
      pad((currentDate.getMonth() + 1).toString(), 2, "0") +
      "-" +
      pad(currentDate.getDate().toString(), 2, "0") +
      " " +
      currentDate.getHours().toString() +
      ":" +
      pad(currentDate.getMinutes().toString(), 2, "0");

    let checklist = {
      general: {
        lastUpdate: currentDateString,
        defaultVersion: data.common.languages.defaultLanguageCode,
        assets: gatherPreloadableAssets(),
        bibliography: gatherReferences(),
      },
      versions: {},
    };

    data.common.languages.supportedLanguages.forEach(function (lang) {
      checklist.versions[lang.code] = compileChecklistVersion(lang);

      // process F: directives for markdown files ... only in Additional texts and markdown-enabled Custom data
      let dataPathsToConsider = [];

      Object.keys(
        checklist.versions[lang.code].dataset.meta.accompanyingText
      ).forEach(function (key) {
        dataPathsToConsider.push(key);
      });

      Object.keys(checklist.versions[lang.code].dataset.meta.data).forEach(
        function (key) {
          if (
            checklist.versions[lang.code].dataset.meta.data[key].formatting ==
            "markdown"
          ) {
            dataPathsToConsider.push(key);
          }
        }
      );

      let runSpecificCache = {};

      let rowNumber = 1;
      checklist.versions[lang.code].dataset.checklist.forEach(function (entry) {
        rowNumber++;
        let entryData = entry.d;

        for (const dataPath of dataPathsToConsider) {
          let data = Checklist.getDataFromDataPath(entryData, dataPath);

          if (data && data != "") {
            let result = processFDirective(data, runSpecificCache, log);
            if (result) {
              entryData[dataPath] = result;
            }
          }
        }
      });
    });

    console.log("New checklist", checklist);

    return checklist;
    function gatherReferences() {
      let useCitations = data.common
        .getItem(
          data.sheets.appearance.tables.customization.data,
          "Use citations",
          data.common.languages.defaultLanguageCode, //only support bibtex in default language code
          ""
        )
        .toLowerCase();

      if (useCitations.trim() == "") {
        return {};
      }

      let supportedCitationStyles = ["apa", "harvard"];
      if (!supportedCitationStyles.includes(useCitations)) {
        Logger.error(
          "Unknown citation style '" +
            useCitations +
            "'. Supported values are " +
            ["apa", "harvard"].map((x) => "'" + x + "'").join(", ")
        );
        return {};
      }

      // Get bibliography data from Excel table

      //console.log(data.sheets.content.tables);

      const bibliographyData =
        data.sheets.content.tables.bibliography.data[
          data.common.languages.defaultLanguageCode
        ];

      if (!bibliographyData || bibliographyData.length === 0) {
        Logger.warning(
          "Bibliography table is empty. Add BibTeX entries to use citations."
        );
        return {};
      }

      // Combine all BibTeX entries from individual cells
      let combinedBibtex = bibliographyData
        .map((row) => row.bibtex?.trim())
        .filter((bibtex) => bibtex && bibtex.length > 0)
        .join("\n\n");

      if (!combinedBibtex.trim()) {
        Logger.warning("No valid BibTeX entries found in Bibliography table.");
        return {};
      }

      // Parse using existing TinyBibReader
      let bibReader = null;
      try {
        bibReader = new TinyBibReader(combinedBibtex);
      } catch (e) {
        console.log(e);
        Logger.error("Error processing bibliography entries: " + e);
        return {};
      }

      return bibReader.bibliography;
    }

    function gatherPreloadableAssets() {
      let assets = [];

      data.common.languages.supportedLanguages.forEach(function (lang) {
        //all online search icons
        data.sheets.content.tables.searchOnline.data[lang.code].forEach(
          function (row) {
            let asset = relativeToUsercontent(
              "./online_search_icons/" + row.icon
            );
            if (!assets.includes(asset) && isSameOriginAsCurrent(asset)) {
              assets.push(asset);
            }
          }
        );

        //all locally hosted maps
        data.sheets.content.tables.maps.data[lang.code].forEach(function (row) {
          if (row.source.indexOf("{{") >= 0 && row.source.indexOf("}}") >= 0) {
            return; //skip sources with templates, by default we won't cache any image-based maps either
          }
          if (row.mapType == "regions") {
            let asset = relativeToUsercontent("./maps/" + row.source);
            if (!assets.includes(asset) && isSameOriginAsCurrent(asset)) {
              assets.push(asset);
            }
          }
        });

        //all "image" Custom data definition
        for (const row of data.sheets.content.tables.customDataDefinition.data[
          lang.code
        ]) {
          if (row.formatting !== "image") {
            continue;
          }

          const template = row.template;

          let compiledTemplate = null;

          try {
            compiledTemplate = Handlebars.compile(template);
          } catch (ex) {
            console.log("Handlebars error", ex);
            return;
          }

          for (const entry of data.sheets.checklist.data[lang.code]) {
            const imageData = Checklist.getDataFromDataPath(
              entry.d,
              row.columnName
            );

            for (const media of Array.isArray(imageData)
              ? imageData
              : [imageData]) {
              const mediaSource = media.source;
              if (mediaSource != "") {
                let dataObject = Checklist.getDataObjectForHandlebars(
                  mediaSource,
                  {},
                  "",
                  ""
                );

                const resolved = compiledTemplate(dataObject);

                const asset = relativeToUsercontent(resolved);
                if (!assets.includes(asset) && isSameOriginAsCurrent(asset)) {
                  assets.push(asset);
                }
              }
            }
          }
        }

        //all precache "yes" media
        for (const row of data.sheets.content.tables.media.data[lang.code]) {
          if (row.precache !== "yes") {
            continue;
          }

          const linkBase = row.linkBase;
          let mediaType = row.typeOfData;

          if (
            linkBase.toLowerCase().startsWith("http:") ||
            linkBase.toLowerCase().startsWith("https:")
          ) {
            Logger.error(
              _tf("dm_precache_absolute", [row.columnName, linkBase])
            );
          }

          if (mediaType !== "image" && mediaType !== "sound") {
            console.log("Skipped caching of", mediaType, linkBase);
            continue;
          }

          let compiledTemplate = null;

          try {
            compiledTemplate = Handlebars.compile(linkBase);
          } catch (ex) {
            console.log("Handlebars error", ex);
            return;
          }

          for (const entry of data.sheets.checklist.data[lang.code]) {
            const mediaArray = Checklist.getDataFromDataPath(
              entry.d,
              row.columnName
            );

            //media come in arrays
            for (const mediaItem of mediaArray) {
              const mediaSource = mediaItem.source.trim();

              if (mediaSource != "") {
                let dataObject = Checklist.getDataObjectForHandlebars(
                  mediaSource,
                  {},
                  "",
                  ""
                );

                const resolved = compiledTemplate(dataObject);

                const asset = relativeToUsercontent(resolved);
                if (!assets.includes(asset) && isSameOriginAsCurrent(asset)) {
                  assets.push(relativeToUsercontent(asset));
                }
              }
            }
          }
        }

        //extract images from extra texts and if local, add to assets
        data.sheets.content.tables.accompanyingText.data[lang.code].forEach(
          function (row) {
            for (const entry of data.sheets.checklist.data[lang.code]) {
              let textData = Checklist.getDataFromDataPath(
                entry.d,
                row.columnName
              );

              if (textData == null || textData.trim() == "") {
                continue;
              }

              textData = textData.replaceAll("\\n", "\n");

              textData = textData.replace(
                /!\[[^\]]*\]\(([^\)]+)\)/gi,
                (match, src) => {
                  let asset = relativeToUsercontent(src);

                  if (!assets.includes(asset) && isSameOriginAsCurrent(asset)) {
                    assets.push(asset);
                  }

                  return match.replace(src, asset);
                }
              );
            }
          }
        );
      });

      if (checkAssetsSize) {
        const assetsSizesMsg = "Checking " + assets.length + " assets sizes";
        console.time(assetsSizesMsg);
        let precachedImageMaxSizeMb = parseFloat(
          data.common.getItem(
            data.sheets.appearance.tables.customization.data,
            "Precached image max size",
            data.common.languages.defaultLanguageCode,
            0.5
          )
        );

        assets.forEach(function (asset) {
          let contentLengthInfo = getContentLengthInfo(asset);

          if (contentLengthInfo.responseStatus == 200) {
            if (
              contentLengthInfo.contentLength > 0 &&
              contentLengthInfo.contentLength / 1024 / 1024 >
                precachedImageMaxSizeMb
            ) {
              Logger.warning(
                _tf("dm_asset_too_large", [
                  asset,
                  (contentLengthInfo.contentLength / 1024 / 1024).toFixed(2),
                  precachedImageMaxSizeMb,
                ])
              );
            }
          } else {
            if (contentLengthInfo.responseStatus == 404) {
              Logger.error(_tf("dm_asset_not_found", [asset]));
            }
          }
        });

        console.timeEnd(assetsSizesMsg);
      }

      return assets;
    }

    function getContentLengthInfo(url) {
      const result = { url: "", contentLength: null, responseStatus: 0 };

      try {
        const xhr = new XMLHttpRequest();
        xhr.open("HEAD", url, false); // false makes the request synchronous
        xhr.withCredentials = true; // Include credentials for CORS
        xhr.send(null);

        result.responseStatus = xhr.status;
        result.url = url;

        if (xhr.status === 200) {
          const contentLength = xhr.getResponseHeader("Content-Length");
          result.contentLength = contentLength
            ? parseInt(contentLength, 10)
            : 0;
        } else {
          result.responseStatus = xhr.status;
          console.error(
            "Error fetching HEAD for " + url + " status: " + xhr.status
          );
        }
      } catch (error) {
        console.error("Error:", error.message);
      }

      return result;
    }

    function compileChecklistVersion(lang) {
      let hue = data.common.getItem(
        data.sheets.appearance.tables.customization.data,
        "Color theme hue",
        lang.code,
        212
      );
      let name = data.common.getItem(
        data.sheets.appearance.tables.customization.data,
        "Checklist name",
        lang.code,
        "Checklist"
      );
      let about = data.common.getItem(
        data.sheets.appearance.tables.customization.data,
        "About section",
        lang.code,
        _t("generic_about")
      );

      let aboutResult = processFDirective(about, {});
      if (aboutResult) {
        about = aboutResult;
      }

      let howToCite = data.common.getItem(
        data.sheets.appearance.tables.customization.data,
        "How to cite",
        lang.code,
        ""
      );

      let dateFormat = data.common.getItem(
        data.sheets.appearance.tables.customization.data,
        "Date format",
        lang.code,
        "YYYY-MM-DD"
      );
      let useCitations = data.common
        .getItem(
          data.sheets.appearance.tables.customization.data,
          "Use citations",
          lang.code,
          ""
        )
        ?.toLowerCase();
      let precachedImageMaxSize = data.common.getItem(
        data.sheets.appearance.tables.customization.data,
        "Precached image max size",
        lang.code,
        0.5
      );
      let stackingCirclesDepth = data.common.getItem(
        data.sheets.appearance.tables.customization.data,
        "Stacking circles depth",
        lang.code,
        3
      );

      let version = {
        languageName: lang.name,
        fallbackUiLang: lang.fallbackLanguage,
        colorThemeHue: hue,
        name: name,
        about: about,
        howToCite: howToCite,
        dateFormat: dateFormat,
        useCitations: useCitations.toLowerCase(),
        precachedImageMaxSize: parseFloat(precachedImageMaxSize),
        stackingCirclesDepth: stackingCirclesDepth,
        dataset: {
          meta: compileMeta(lang),
          checklist: data.sheets.checklist.data[lang.code],
        },
      };

      return version;
    }

    function compileMeta(lang) {
      let meta = {
        taxa: {},
        data: compileDataMeta(lang, [
          data.sheets.content.tables.customDataDefinition.name,
        ]),
        media: compileDataMeta(lang, [data.sheets.content.tables.media.name]),
        maps: compileDataMeta(lang, [data.sheets.content.tables.maps.name]),
        accompanyingText: compileDataMeta(lang, [
          data.sheets.content.tables.accompanyingText.name,
        ]),
        mapRegionsLegend: {
          default: {
            suffix: "",
            fill: "#55769b",
            legend: _t("default_legend"),
          },
          suffixes: [],
        },
        mapRegionsNames: [],
        externalSearchEngines: [],
      };

      data.sheets.content.tables.taxa.data[lang.code].forEach(function (row) {
        row.parentTaxonIndication = row.parentTaxonIndication
          .toLowerCase()
          .trim();

        if (
          row.parentTaxonIndication !== "" &&
          row.parentTaxonIndication !== "none"
        ) {
          if (!Object.keys(meta.taxa).includes(row.parentTaxonIndication)) {
            Logger.warning(
              "Wrong value in Parent taxon indication will be ignored: " +
                row.parentTaxonIndication
            );
            row.parentTaxonIndication = "";
          }
        }

        meta.taxa[row.columnName] = {
          name: row.taxonName,
          order: row.orderBy,
          searchCategoryOrder: [],
          parentTaxonIndication: row.parentTaxonIndication,
          italicize: row.italicize,
        };

        data.sheets.appearance.tables.searchOrder.data[lang.code].forEach(
          function (metaRow) {
            if (
              metaRow.columnName.toLowerCase() == row.columnName.toLowerCase()
            ) {
              meta.taxa[row.columnName].searchCategoryOrder.push({
                group: metaRow.groupTitle,
                title: metaRow.value,
              });
            }
          }
        );
      });

      data.sheets.content.tables.searchOnline.data[lang.code].forEach(function (
        row
      ) {
        meta.externalSearchEngines.push({
          title: row.title,
          icon: row.icon,
          url: row.searchUrlTemplate,
          restrictToTaxon: row.restrictToTaxon,
        });
      });

      data.sheets.appearance.tables.mapRegionsLegend.data[lang.code].forEach(
        function (row) {
          if (row.suffix.trim() == "") {
            meta.mapRegionsLegend.default.suffix = row.suffix;
            meta.mapRegionsLegend.default.fill = row.fillColor;
            meta.mapRegionsLegend.default.legend = row.legend;
          } else {
            meta.mapRegionsLegend.suffixes.push({
              suffix: row.suffix,
              fill: row.fillColor,
              legend: row.legend,
              appendedLegend: row.appendedLegend,
            });
          }
        }
      );

      data.sheets.appearance.tables.mapRegionsNames.data[lang.code].forEach(
        function (row) {
          meta.mapRegionsNames.push({
            code: row.code,
            name: row.name,
          });
        }
      );

      return meta;
    }

    function compileDataMeta(lang, expectedDataTypes) {
      let allDataPaths = data.common.allUsedDataPaths[lang.code].sort();

      let meta = {};

      /*
      if (
        expectedDataTypes.includes(
          data.sheets.content.tables.customDataDefinition.name
        )
      ) {
        meta["$$default-custom$$"] = {
          datatype: "custom",
          title: "",
          searchCategory: "",
          separator: "bullet list",
          formatting: "text",
          template: "",
          placement: "bottom",
        };
      }
        */

      data.common.getAllColumnInfos(lang.code).forEach(function (info) {
        // for each of allPaths which matches info.name
        let matchingComputedDataPaths = allDataPaths.filter(function (path) {
          return (
            dataPath.modify.itemNumbersToHash(path).toLowerCase() ==
            dataPath.modify.itemNumbersToHash(info.name).toLowerCase()
          );
        });

        if (!expectedDataTypes.includes(info.table)) {
          return;
        }

        matchingComputedDataPaths.forEach(function (computedDataPath) {
          let dataType = "custom";

          if (info.formatting == "taxon") {
            if (info.table == data.sheets.content.tables.taxa.name) {
              return;
            } else {
              dataType = "taxon";
            }
          }

          if (
            info.table == data.sheets.content.tables.customDataDefinition.name
          ) {
            dataType = "custom";
          }

          if (info.table == data.sheets.content.tables.media.name)
            dataType = "media";
          if (info.table == data.sheets.content.tables.maps.name)
            dataType = "map";
          if (info.table == data.sheets.content.tables.accompanyingText.name)
            dataType = "text";

          meta[computedDataPath] = {
            datatype: dataType,
          };

          let placement = info.fullRow.placement;
          if (
            placement === undefined ||
            placement === null ||
            placement.trim() == ""
          ) {
            placement =
              data.sheets.content.tables.customDataDefinition.columns.placement
                .integrity.defaultValue;
          }

          if (dataType == "custom") {
            meta[computedDataPath].title = info.fullRow.title;
            meta[computedDataPath].searchCategory =
              info.fullRow.searchCategoryTitle;
            meta[computedDataPath].searchCategoryOrder = [];

            if (info.fullRow.searchCategoryTitle.trim() !== "") {
              data.sheets.appearance.tables.searchOrder.data[lang.code].forEach(
                function (row) {
                  if (
                    row.columnName.toLowerCase() ==
                    computedDataPath.toLowerCase()
                  ) {
                    meta[computedDataPath].searchCategoryOrder.push({
                      group: row.groupTitle,
                      title: row.value,
                    });
                  }
                }
              );
            }

            //verify syntax of .hidden
            if (
              info.fullRow.hidden !== "yes" &&
              info.fullRow.hidden !== "no" &&
              info.fullRow.hidden !== "data"
            ) {
              let expr = info.fullRow.hidden;

              let split = splitN(expr, " ", 3);
              if (split.length < 3 || split.length > 4) {
                Logger.error(
                  _tf("dm_hidden_syntax_wrong_length", [
                    info.fullRow.columnName,
                    expr,
                  ])
                );
              }

              if (!["if", "unless"].includes(split[0])) {
                Logger.error(
                  _tf("dm_hidden_syntax", [info.fullRow.columnName, expr])
                );
              }

              let filter = split[1];
              if (!dataPath.validate.isDataPath(filter)) {
                Logger.error(
                  _tf("dm_hidden_syntax_wrong_filter", [
                    info.fullRow.columnName,
                    filter,
                  ])
                );
              }

              if (!["is", "isset", "notset", "notsetor"].includes(split[2])) {
                Logger.error(
                  _tf("dm_hidden_syntax_wrong_operator", [
                    info.fullRow.columnName,
                    expr,
                  ])
                );
              }

              if (split.length == 4 && split[3].length > 0) {
                try {
                  let parsed = JSON.parse("[" + split[3] + "]");
                  if (!Array.isArray(parsed)) {
                    throw new Error("Not an array");
                  }
                } catch (e) {
                  Logger.error(
                    _tf("dm_hidden_syntax_wrong_value", [
                      info.fullRow.columnName,
                      expr,
                    ])
                  );
                }
              }
            }

            meta[computedDataPath].separator = info.fullRow.subitemsSeparator;
            meta[computedDataPath].formatting = info.fullRow.formatting;
            meta[computedDataPath].template = info.fullRow.template;
            meta[computedDataPath].placement = placement;
            meta[computedDataPath].hidden = info.fullRow.hidden;

            if (info.fullRow.formatting.toLowerCase() == "badge") {
              meta[computedDataPath].badges = [];
              data.sheets.appearance.tables.badges.data[lang.code].forEach(
                function (badge) {
                  if (
                    dataPath.modify
                      .itemNumbersToHash(badge.columnName)
                      .toLowerCase() ==
                    dataPath.modify
                      .itemNumbersToHash(computedDataPath)
                      .toLowerCase()
                  ) {
                    meta[computedDataPath].badges.push({
                      contains: badge.containsText.toLowerCase(),
                      background: badge.backgroundColor,
                      text: badge.textColor,
                      border: badge.borderColor,
                    });
                  }
                }
              );
            }
          }
          if (dataType == "media") {
            meta[computedDataPath].type = info.fullRow.typeOfData;
            meta[computedDataPath].title = info.fullRow.title;
            meta[computedDataPath].link = info.fullRow.linkBase;
            meta[computedDataPath].precache = info.fullRow.precache;
          }
          if (dataType == "map") {
            meta[computedDataPath].type = info.fullRow.mapType;
            meta[computedDataPath].source = info.fullRow.source;
            meta[computedDataPath].title = info.fullRow.mapTitle;
          }
          if (dataType == "text") {
            meta[computedDataPath].title = info.fullRow.title;
          }
        });
      });

      return meta;
    }
  }

  function loadData(table) {
    if (table == null) {
      Logger.error(_t("problem_loading_data"));
      return null;
    }

    //check if all map colums are present
    data.common.languages.supportedLanguages.forEach(function (lang) {
      data.sheets.content.tables.maps.data[lang.code].forEach(function (
        mapRow
      ) {
        let dataRow = table[0];

        if (
          indexOfCaseInsensitive(dataRow, mapRow.columnName) < 0 &&
          dataRow.findIndex((item) =>
            item.toLowerCase().startsWith(mapRow.columnName.toLowerCase() + ".")
          ) < 0 &&
          indexOfCaseInsensitive(dataRow, mapRow.columnName + ":" + lang.code) <
            0
        ) {
          Logger.error(
            _tf("dm_column_defined_but_missing", [
              mapRow.columnName,
              data.sheets.content.tables.maps.name,
              data.sheets.content.tables.maps.name,
            ])
          );
        }
      });
    });

    //continue

    let allColumnInfos = data.common.getAllColumnInfos(
      data.common.languages.defaultLanguageCode
    );
    let allColumnNames = allColumnInfos.map(function (item) {
      return item.name;
    });

    data.sheets.checklist.data = {};
    data.common.allUsedDataPaths = {};
    data.common.languages.supportedLanguages.forEach(function (lang) {
      data.sheets.checklist.data[lang.code] = [];
      data.common.allUsedDataPaths[lang.code] = [];

      let headers = table[0].map(function (item) {
        return item.toLowerCase();
      });

      //check duplicates in headers
      let headersCache = [];
      headers.forEach(function (header) {
        if (header.trim() == "") {
          return;
        }
        if (headersCache.indexOf(header) < 0) {
          headersCache.push(header);
        } else {
          Logger.error(_tf("dm_column_names_duplicate", [header]));
        }
      });
      // Create context object once per row
      const context = { headers, row: null, langCode: lang.code };

      for (let rowIndex = 1; rowIndex < table.length; rowIndex++) {
        const row = table[rowIndex];
        context.row = row; // Update context with the current row

        let rowObj = { t: [], d: {} };
        let doneWithTaxa = false;

        allColumnInfos.forEach(function (info) {
          let position = dataPath.analyse.position(allColumnNames, info.name);
          if (!position.isLeaf) {
            return;
          }

          //console.log("INFO", info.name, info);

          if (info.formatting == "checklist-taxon") {
            let taxon = loadDataByType(context, info.name, {
              ...info,
              formatting: "taxon",
            });

            let taxonIsEmpty =
              taxon == null ||
              (taxon?.n?.trim() == "" && taxon?.a?.trim() == "");

            if (taxonIsEmpty) {
              doneWithTaxa = true;
            } else {
              if (!doneWithTaxa) {
                rowObj.t.push(taxon);
              } else {
                Logger.error(
                  _tf("dm_incomplete_taxa_info_row", [
                    rowIndex + data.common.checklistHeadersStartRow,
                    info.name,
                  ])
                );
              }
            }
          } else {
            includeTreefiedData(
              rowObj.d,
              context,
              dataPath.modify.pathToSegments(info.name),
              0,
              info,
              ""
            );
          }
        });

        data.sheets.checklist.data[lang.code].push(rowObj);
      }
    });

    function includeTreefiedData(
      rowObjData,
      context,
      pathSegments,
      pathPosition,
      info,
      computedPath
    ) {
      const { headers, row, langCode } = context;
      const currentSegment = pathSegments[pathPosition];

      if (currentSegment == "#") {
        let count = 0;
        let possible = [];
        let lastSuccesfullCount = 0; //retains the index of last valid (non empty) value entered into array, serves for skipping adding empty values so that we don't create nulls in malformed arrays such with empty strings as ['a', 'b', '', 'c']

        let emptyCellsInArrayReported = false;

        do {
          count++;
          let countedComputedPath = computedPath + count;

          possible = headers.filter(function (header) {
            if (
              header == countedComputedPath ||
              header.startsWith(countedComputedPath + ".")
            ) {
              return true;
            }
          });

          if (possible.length > 0) {
            if (
              data.common.allUsedDataPaths[langCode].indexOf(
                countedComputedPath
              ) < 0
            ) {              
              data.common.allUsedDataPaths[langCode].push(countedComputedPath);
            }

            if (pathPosition == pathSegments.length - 1) {
              //terminal node
              if (rowObjData.hasOwnProperty(currentSegment)) {
                throw _tf("dm_duplicate_segment", [currentSegment]);
              }
              let genericData = loadDataByType(context, countedComputedPath, info);
              if (genericData !== "" && genericData !== null) {
                //rowObjData[count - 1] = genericData;
                rowObjData[lastSuccesfullCount] = genericData;
                lastSuccesfullCount++;

                if (
                  !emptyCellsInArrayReported &&
                  count != lastSuccesfullCount
                ) {
                  // lastSuccesfullCount must be as is and not with -1 to give the user a 1 based index and not a 0 based one
                  Logger.error(
                    _tf("dm_array_with_empty_cells_in_the_middle", [
                      computedPath,
                      lastSuccesfullCount,
                      row.join(", "),
                    ])
                  );
                  emptyCellsInArrayReported = true;
                }
              }
            } else {
              if (rowObjData.length < count) {
                rowObjData.push({});
              }

              includeTreefiedData(
                rowObjData[lastSuccesfullCount],
                context,
                pathSegments,
                pathPosition + 1,
                info,
                countedComputedPath
              );
              lastSuccesfullCount++;
            }
          } else if (count == 1 && pathSegments.length > 1) {
            //we may have a candidate for simplified array (aka | pipe separated values)
            let rawValue =
              row[
                headers.indexOf(pathSegments[pathSegments.length - 2])
              ].trim();

            if (rawValue != "") {
              let values = rawValue?.split("|").map((v, index) => {
                // Create a virtual context that simulates the numbered column structure
                const virtualColumnName = (
                  computedPath + (index + 1).toString()
                ).toLowerCase();
                const virtualContext = {
                  headers: [...context.headers, virtualColumnName],
                  row: [...context.row, v.trim()],
                  langCode: context.langCode,
                };

                // Track the virtual data path
                let localCountedDataPath =
                  computedPath + (index + 1).toString();
                if (
                  data.common.allUsedDataPaths[langCode].indexOf(
                    localCountedDataPath
                  ) < 0
                ) {
                  data.common.allUsedDataPaths[langCode].push(
                    localCountedDataPath
                  );
                }

                // Now call loadDataByType with the virtual context - this follows the standard pattern
                return loadDataByType(
                  virtualContext,
                  localCountedDataPath,
                  info
                );
              });

              // Assign the processed values to the array
              for (let i = 0; i < values.length; i++) {
                const processedValue = values[i];
                if (
                  processedValue !== null &&
                  processedValue !== "" &&
                  processedValue !== undefined
                ) {
                  rowObjData[i] = processedValue;
                }
              }

              return;
            }
          }
        } while (possible.length > 0);
      } else {
        computedPath =
          computedPath + (computedPath == "" ? "" : ".") + currentSegment;

        if (data.common.allUsedDataPaths[langCode].indexOf(computedPath) < 0) {
          data.common.allUsedDataPaths[langCode].push(computedPath);
        }

        if (pathPosition == pathSegments.length - 1) {
          //terminal node

          /* this seems to raise false alarms
          if (rowObjData.hasOwnProperty(currentSegment)) {
            console.log("ERROR duplicity for: " + currentSegment);
          }
          */

          let genericData = loadDataByType(context, computedPath, info);

          if (genericData) {
            rowObjData[currentSegment] = genericData;
          }
          return;
        } else if (!rowObjData.hasOwnProperty(currentSegment)) {
          if (pathSegments[pathPosition + 1] == "#") {
            rowObjData[currentSegment] = [];
          } else {
            rowObjData[currentSegment] = {};
          }
        }
        includeTreefiedData(
          rowObjData[currentSegment],
          context,
          pathSegments,
          pathPosition + 1,
          info,
          computedPath
        );
      }
    }

    clearDataCodesCache();
  }

  function checkMetaValidity() {
    // automatic check based on integrity data
    Object.keys(data.sheets).forEach(function (sheetKey) {
      let sheet = data.sheets[sheetKey];
      if (sheet.type == "meta") {
        Object.keys(sheet.tables).forEach(function (tableKey) {
          let table = sheet.tables[tableKey];
          data.common.languages.supportedLanguages.forEach(function (lang) {
            let tableData = table.data[lang.code];
            if (tableData == null) {
              Logger.critical("Missing table " + table.name);
              return;
            }

            //verify presence of all required columns
            for (const row of tableData) {
              for (const key in row) {
                let value = row[key];
                if (value === undefined) {
                  //value was not read, this means the column is missing
                  Logger.critical(
                    "Missing required column " +
                      table.columns[key].name +
                      " in table " +
                      table.name +
                      ". " +
                      _t("dm_verify_doc")
                  );
                  return;
                }
              }
            }

            tableData.forEach(function (dataRow) {
              Object.keys(table.columns).forEach(function (columnKey) {
                let entireColumn = tableData.map(function (row) {
                  return row[columnKey];
                });
                let column = table.columns[columnKey];
                let integrity = column.integrity;
                let value = dataRow[columnKey];

                if (value === undefined) {
                  Logger.critical(
                    "Missing column name " +
                      column.name +
                      " in table " +
                      table.name +
                      " " +
                      _t("dm_verify_doc")
                  );
                  return;
                }

                let isEmpty =
                  value === undefined ||
                  value === null ||
                  value.toString().trim() == "";

                if (!integrity.allowEmpty && isEmpty) {
                  Logger.error(
                    _tf("dm_value_cannot_be_empty", [column.name, table.name])
                  );
                }

                if (integrity.allowEmpty && isEmpty) {
                  //no check to do
                } else {
                  switch (integrity.allowedContent) {
                    case "any":
                      // no check to do
                      break;
                    case "list":
                      let found = false;
                      integrity.listItems.forEach(function (allowed) {
                        if (
                          !found &&
                          allowed.toLowerCase() == value.toLowerCase()
                        ) {
                          found = true;
                        }
                      });
                      if (!found) {
                        Logger.error(
                          _tf("dm_incorrect_list", [
                            value,
                            column.name,
                            table.name,
                            integrity.listItems
                              .map(function (item) {
                                return item == ""
                                  ? "(space)"
                                  : "'" + item + "'";
                              })
                              .join(", "),
                          ])
                        );
                      }
                      break;
                    case "columnName":
                      if (!dataPath.validate.isSimpleColumnName(value)) {
                        Logger.error(
                          _tf("dm_incorrect_simple_column_name", [
                            value,
                            column.name,
                            table.name,
                          ])
                        );
                      }
                      break;
                    case "cssColor":
                      let hexHslaRgbaColor = new RegExp(
                        "(#([0-9a-f]{3}){1,2}|(rgba|hsla)(d{1,3}%?(,s?d{1,3}%?){2},s?(1|0|0?.d+))|(rgb|hsl)(d{1,3}%?(,s?d{1,3}%?){2}))",
                        "i"
                      );
                      if (
                        hexHslaRgbaColor.test(value) == false &&
                        cssColorNames.indexOf(value.toLowerCase()) < 0
                      ) {
                        Logger.error(
                          _tf("dm_incorrect_hlsa", [
                            value,
                            column.name,
                            table.name,
                          ])
                        );
                      }
                      break;
                    case "filename":
                      let ext = "";
                      if (value.indexOf(".") > 0) {
                        ext = value.substring(value.indexOf("."));
                      }
                      if (
                        integrity.allowedExtensions.indexOf(ext.toLowerCase()) <
                        0
                      ) {
                        Logger.error(
                          _tf("dm_incorrect_filename", [
                            value,
                            column.name,
                            table.name,
                            integrity.allowedExtensions.join(", ") + ")",
                          ])
                        );
                      }
                      break;
                    case "url":
                      if (!isValidHttpUrl(value)) {
                        Logger.error(
                          _tf("dm_incorrect_http", [
                            value,
                            column.name,
                            table.name,
                          ])
                        );
                      }
                      break;
                    case "dataPath":
                      if (!dataPath.validate.isDataPath(value)) {
                        Logger.error(
                          _tf("dm_incorrect_datapath", [
                            value,
                            column.name,
                            table.name,
                          ])
                        );
                      }
                      break;
                    case "regex":
                      let regexPattern = integrity.regex;
                      if (!regexPattern.startsWith("^")) {
                        regexPattern = "^" + regexPattern;
                      }
                      if (!regexPattern.endsWith("$")) {
                        regexPattern = regexPattern + "$";
                      }

                      let regex = new RegExp(integrity.regex);
                      if (regex.test(value) == false) {
                        Logger.error(
                          _tf("dm_regex_failed", [
                            value,
                            column.name,
                            table.name,
                            integrity.regexExplanation,
                            integrity.regex,
                          ])
                        );
                      }
                      break;
                    default:
                      console.log(
                        "Unknown integrity allowed content: " +
                          integrity.allowedContent
                      );
                      break;
                  }
                }

                if (integrity.allowDuplicates !== "yes") {
                  let count = 0;
                  entireColumn.forEach(function (item) {
                    if (item.toLowerCase() == value.toLowerCase()) {
                      if (value == "") {
                        if (integrity.allowDuplicates != "empty-only") {
                          count++;
                        }
                      } else {
                        count++;
                      }
                    }
                  });
                  if (count > 1) {
                    Logger.error(
                      _tf("dm_incorrect_must_be_unique", [
                        value,
                        column.name,
                        table.name,
                      ])
                    );
                  }
                }
              });
            });
          });
        });
      }
    });

    //
    // Manual checks of logic
    //

    // Ensure all languages are displayable and proper fallback language is provided if translation is missing
    data.common.languages.supportedLanguages.forEach(function (lang) {
      if (
        i18n.getSupportedLanguageCodes().indexOf(lang.code) < 0 &&
        i18n.getSupportedLanguageCodes().indexOf(lang.fallbackLanguage) < 0
      ) {
        Logger.warning(
          _tf("dm_specify_fallback_language", [
            lang.name,
            "Supported languages",
            data.sheets.appearance.name,
            i18n.getSupportedLanguageCodes().join(", "),
          ])
        );
      }
    });

    /*
    // All column names through all tables should be unique
    //!!! this can be relaxed, no real reason to enforce this
    */
    let uniqueColumnNames = {};
    data.common
      .getAllColumnInfos(data.common.languages.defaultLanguageCode)
      .forEach(function (item) {
        if (
          Object.keys(uniqueColumnNames).indexOf(item.name.toLowerCase()) < 0 ||
          item.table == uniqueColumnNames[item.name.toLowerCase()].table
        ) {
          uniqueColumnNames[item.name.toLowerCase()] = item;
        } else {
          if (
            item.table == "Maps" ||
            uniqueColumnNames[item.name].table == "Maps"
          ) {
            return;
          }

          Logger.error(
            _tf("dm_column_name_duplicate", [
              item.name,
              item.table,
              uniqueColumnNames[item.name].table,
            ])
          );
        }
      });

    //*/

    // Hue has to be 0-360
    data.common.languages.supportedLanguages.forEach(function (lang) {
      let hueRow = data.sheets.appearance.tables.customization.data[
        lang.code
      ].find(function (row) {
        if (row.item == "Color theme hue") {
          return true;
        }
      });
      let hueString = hueRow ? hueRow.value : NaN;

      let hue = parseInt(hueString);
      if (isNaN(hue) || hue < 0 || hue > 360) {
        Logger.error(
          _tf("dm_hue_value", [
            data.sheets.appearance.tables.customization.name,
          ])
        );
      }
    });

    data.common.languages.supportedLanguages.forEach(function (lang) {
      let table =
        data.sheets.content.tables.customDataDefinition.data[lang.code];
      if (table === null) {
        Logger.critical("Cannot find custom data def");
        return;
      }

      let allColumnNames = table
        .map(function (row) {
          return row.columnName?.toLowerCase();
        })
        .filter((value) => value !== undefined);

      for (const row of table) {
        let columnName = row.columnName;

        if (columnName === undefined) {
          Logger.critical("Not found column " + columnName);
          return null;
        }

        let colPosition = dataPath.analyse.position(
          allColumnNames,
          columnName.toLowerCase()
        );

        // Only root column can have "placement"
        if (
          row.placement != "" &&
          !(colPosition.isSimpleItem || colPosition.isRoot)
        ) {
          Logger.error(
            _tf("dm_wrong_placement", [
              columnName,
              row.placement,
              columnName.substring(0, columnName.indexOf(".")),
            ])
          );
        }

        // Only leaf column can have "template"
        if (row.template != "" && !colPosition.isLeaf) {
          Logger.error(_tf("dm_wrong_template", [columnName]));
        }

        // Only leaf column can have badge "formatting"
        if (row.formatting.toLowerCase() == "badge" && !colPosition.isLeaf) {
          Logger.error(
            _tf("dm_wrong_badge", [
              columnName,
              data.sheets.content.tables.customDataDefinition.columns.formatting
                .name,
            ])
          );
        }

        // Only columns with children or # can have subitems separator
        if (row.subitemsSeparator != "" && !colPosition.hasChildren) {
          Logger.error(
            _tf("dm_wrong_separator", [
              columnName,
              data.sheets.content.tables.customDataDefinition.columns
                .subitemsSeparator.name,
            ])
          );
        }

        /*
                // Setting "allow empty values" on non-leaf means all leaves can be empty
                if (row.allowEmptyValues == "yes" && colPosition.hasChildren) {
                    let children = dataPath.analyse.getChildrenOf(allColumnNames, columnName);
                    table.forEach(function(row) {
                        if (children.indexOf(row.columnName.toLowerCase()) >= 0) {
                            row.allowEmptyValues = "yes";
                            //console.log("Added allowEmptyValues to "  + row.columnName);
                        }
                    });
                }
                */

        // Hidden cannot have any props (like title, template, ...)
        if (row.hidden == "yes") {
          Object.keys(row).forEach(function (columnKey) {
            if (
              columnKey != "columnName" &&
              columnKey != "hidden" &&
              row[columnKey].toString().trim() != ""
            ) {
              if (columnKey == "searchCategoryTitle") {
                //skip search title, as this is allowed
                return;
              }
              console.log(columnKey);
              console.log(row[columnKey]);
              Logger.warning(
                _tf("dm_hidden_column_name", [
                  columnName,
                  data.sheets.content.tables.customDataDefinition.columns[
                    columnKey
                  ].name,
                ])
              );
              row[columnKey] = "";
            }
          });
        }
      }
    });
  }

  function postprocessMetadata() {
    // Change checklist sheet name if needed
    let customChecklistName = "";
    data.sheets.appearance.tables.customization.data[
      data.common.languages.defaultLanguageCode
    ].forEach(function (row) {
      if (row.item == "Name of checklist data sheet") {
        customChecklistName = row.value;
      }
      return false;
    });
    let customChecklistDataStartRow = "";
    data.sheets.appearance.tables.customization.data[
      data.common.languages.defaultLanguageCode
    ].forEach(function (row) {
      if (row.item == "Checklist data headers row") {
        customChecklistDataStartRow = row.value;
      }
      return false;
    });
    if (customChecklistName && customChecklistName.length > 0) {
      data.sheets.checklist.name = customChecklistName;
    }
    if (
      customChecklistDataStartRow &&
      !isNaN(parseInt(customChecklistDataStartRow))
    ) {
      data.common.checklistHeadersStartRow = parseInt(
        customChecklistDataStartRow
      );
    }

    // set default values if needed
    //*
    Object.keys(data.sheets).forEach(function (sheetKey) {
      let sheet = data.sheets[sheetKey];
      if (sheet.type == "meta") {
        Object.keys(sheet.tables).forEach(function (tableKey) {
          let table = sheet.tables[tableKey];
          data.common.languages.supportedLanguages.forEach(function (lang) {
            let tableData = table.data[lang.code];
            tableData.forEach(function (dataRow) {
              Object.keys(table.columns).forEach(function (columnKey) {
                let column = table.columns[columnKey];
                let integrity = column.integrity;

                let value = dataRow[columnKey];

                if (
                  tableKey == "customDataDefinition" &&
                  dataRow["hidden"] === true
                ) {
                  //skip hidden
                  return;
                }

                if (
                  typeof value === "string" &&
                  value.trim() === "" &&
                  integrity.allowEmpty &&
                  integrity.defaultValue
                ) {
                  dataRow[columnKey] = integrity.defaultValue;
                }
              });
            });
          });
        });
      }
    });
    //*/

    // make all column names and expressions inside {{ }} handlebars lowercase
    Object.keys(data.sheets).forEach(function (sheetKey) {
      let sheet = data.sheets[sheetKey];
      if (sheet.type == "meta") {
        Object.keys(sheet.tables).forEach(function (tableKey) {
          let table = sheet.tables[tableKey];
          data.common.languages.supportedLanguages.forEach(function (lang) {
            let tableData = table.data[lang.code];
            tableData.forEach(function (dataRow) {
              Object.keys(table.columns).forEach(function (columnKey) {
                let column = table.columns[columnKey];
                let integrity = column.integrity;
                let value = dataRow[columnKey];

                if (columnKey == "columnName") {
                  dataRow[columnKey] = dataRow[columnKey].toLowerCase();
                }

                if (typeof value === "string" && value.trim() != "") {
                  dataRow[columnKey] = dataRow[columnKey].replace(
                    /({{[^}}]*}})/g,
                    function (m, p1) {
                      return p1 ? p1.toLowerCase() : m.toLowerCase();
                    }
                  );
                }
              });
            });
          });
        });
      }
    });

    data.common.languages.supportedLanguages.forEach(function (lang) {
      // verify that customDataDefinition column names present all data paths eg. without info.redlist missing between info and info.redlist.code
      let allDataPaths = data.sheets.content.tables.customDataDefinition.data[
        lang.code
      ].map(function (row) {
        return dataPath.modify.itemNumbersToHash(row.columnName).toLowerCase();
      });
      data.sheets.content.tables.customDataDefinition.data[lang.code].forEach(
        function (row) {
          let current = dataPath.modify
            .itemNumbersToHash(row.columnName)
            .toLowerCase();

          if (!dataPath.validate.isDataPath(current)) {
            // Skip invalid data paths not to introduce false suggestions on "you are missing ..."
            return;
          }

          let split = dataPath.modify.pathToSegments(current);

          for (let index = 0; index < split.length; index++) {
            let cumulative = split
              .slice(0, index + 1)
              .join(".")
              .replaceAll(".#", "#");

            if (allDataPaths.indexOf(cumulative) < 0) {
              Logger.error(
                _tf("dm_hidden_missing_index", [
                  cumulative,
                  data.sheets.content.tables.customDataDefinition.name,
                  data.sheets.content.tables.customDataDefinition.columns
                    .columnName.name,
                ])
              );
            }
          }
        }
      );
    });
  }

  function log(level, message) {
    let hasCritical = false;

    let index = dataManager.loggedMessages.findIndex(function (msg) {
      if (msg.level == "critical") {
        hasCritical = true;
      }

      if (
        msg.level + "-" + msg.message.toLowerCase() ==
        level + "-" + message.toLowerCase()
      ) {
        return true;
      }
    });

    //only log critical errors if there is no other critical error yet
    if (
      level != "critical" ||
      (level == "critical" && !hasCritical && index < 0)
    ) {
      dataManager.loggedMessages.push({ level: level, message: message });
    }
  }

  // Object to return

  let dataManager = {
    loggedMessages: [],
    hasErrors: function () {
      return this.loggedMessages.find(
        (msg) => msg.level === "error" || msg.level === "critical"
      );
    },
    checkAssetsSize: false,

    loadData: function (extractor, checkAssetsSize) {
      this.checkAssetsSize = checkAssetsSize;
      Logger.clear();

      extractor.loadMeta(data);
      checkMetaValidity();
      if (!Logger.hasErrors()) {
        postprocessMetadata();
      }

      if (!Logger.hasErrors()) {
        loadData(extractor.getRawChecklistData());
      }
    },

    getCompiledChecklist() {
      return compileChecklist(this.checkAssetsSize);
    },
  };

  return dataManager;
};

function isSameOriginAsCurrent(url) {
  try {
    const parsedCurrentUrl = new URL(window.location.origin);
    const parsedOtherUrl = new URL(url, window.location.origin);

    return parsedCurrentUrl.origin === parsedOtherUrl.origin;
  } catch (error) {
    console.error("Error parsing URLs:", error);
    return false;
  }
}

function getMarkdownContent(url, runSpecificCache) {
  let result = { content: "", responseStatus: 0 };

  if (runSpecificCache[url]) {
    return runSpecificCache[url];
  }

  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, false); // false makes the request synchronous
    xhr.withCredentials = true; // Include credentials for CORS
    xhr.send(null);

    result.responseStatus = xhr.status;

    if (xhr.status === 200) {
      result.content = xhr.responseText;
    }
  } catch (error) {
    console.error("Error fetching remote markdown:", error.message);
  }

  runSpecificCache[url] = result;

  return result;
}

function processFDirective(data, runSpecificCache) {
  if (data.match(/^F:[a-zA-Z0-9-_.~]+/)) {
    let fileUrl = relativeToUsercontent(data.substring(2).trim());

    if (!fileUrl.toLowerCase().endsWith(".md")) {
      fileUrl = fileUrl + ".md";
    }

    if (isValidHttpUrl(fileUrl) && isSameOriginAsCurrent(fileUrl)) {
      let markdownContent = getMarkdownContent(fileUrl, runSpecificCache);
      if (markdownContent.responseStatus == 200) {
        return markdownContent.content;
      } else {
        Logger.error(
          _tf("dm_markdown_file_not_found", [fileUrl, dataPath, rowNumber])
        );
        return null;
      }
    } else {
      console.log("F: is not valid URL", data, fileUrl);
      return null;
    }
    return null;
  } else {
    return data;
  }
}

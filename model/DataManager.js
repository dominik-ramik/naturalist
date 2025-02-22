import {
  cssColorNames,
  indexOfCaseInsensitive,
  isValidHttpUrl,
  pad,
} from "../components/Utils.js";
import { nlDataStructure } from "./DataManagerData.js";
import { i18n, _t, _tf } from "./I18n.js";
import { TinyBibReader } from "../lib/TinyBibMD.js";

export let DataManager = function () {
  const data = nlDataStructure;

  function compileChecklist() {
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
    });

    console.log(checklist);

    return checklist;

    function gatherReferences() {
      const bibtexUrl = data.common.getItem(
        log,
        data.sheets.appearance.tables.customization.data,
        "References BibTeX file URL",
        data.common.languages.defaultLanguageCode, //only support bibtex in default language code
        ""
      );

      if (bibtexUrl == "") {
        return {};
      }

      let bibtexfile = "";

      try {
        //not using fetch here to keep this simple and synchronous
        const xhr = new XMLHttpRequest();
        xhr.open("GET", bibtexUrl, false);
        xhr.send(null);
        if (xhr.status === 200) {
          bibtexfile = xhr.responseText;
        } else {
          throw new Error("Request failed: " + xhr.statusText);
        }
      } catch (error) {
        console.error("Error:", error.message);
      }

      let bibReader = null;
      try {
        bibReader = new TinyBibReader(bibtexfile);
      } catch (e) {
        console.log(e);
        log("error", "Error processing references: " + e);
        return {};
      }

      return bibReader.bibliography;
    }

    function gatherPreloadableAssets() {
      let assets = [];

      data.common.languages.supportedLanguages.forEach(function (lang) {
        //all online search icons
        data.sheets.appearance.tables.searchOnline.data[lang.code].forEach(
          function (row) {
            let asset = "./usercontent/online_search_icons/" + row.icon;
            if (assets.indexOf(asset) < 0) {
              assets.push(asset);
            }
          }
        );

        //all locally hosted maps
        data.sheets.content.tables.maps.data[lang.code].forEach(function (row) {
          if (row.source.indexOf("{{") >= 0 && row.source.indexOf("}}") >= 0) {
            return; //skip sources with templates
          }
          if (row.mapType == "regions") {
            let asset =
              "." + window.location.pathname + "usercontent/maps/" + row.source;
            if (assets.indexOf(asset) < 0) {
              assets.push(asset);
            }
          }
        });
      });

      return assets;
    }

    function compileChecklistVersion(lang) {
      let hue = data.common.getItem(
        log,
        data.sheets.appearance.tables.customization.data,
        "Color theme hue",
        lang.code,
        212
      );
      let name = data.common.getItem(
        log,
        data.sheets.appearance.tables.customization.data,
        "Checklist name",
        lang.code,
        "Checklist"
      );
      let about = data.common.getItem(
        log,
        data.sheets.appearance.tables.customization.data,
        "About section",
        lang.code,
        _t("generic_about")
      );
      let dateFormat = data.common.getItem(
        log,
        data.sheets.appearance.tables.customization.data,
        "Date format",
        lang.code,
        "YYYY-MM-DD"
      );
      let citationStyle = data.common
        .getItem(
          log,
          data.sheets.appearance.tables.customization.data,
          "Citation style",
          lang.code,
          "apa"
        )
        ?.toLowerCase();

      let version = {
        languageName: lang.name,
        fallbackUiLang: lang.fallbackLanguage,
        colorThemeHue: hue,
        name: name,
        about: about,
        dateFormat: dateFormat,
        citationStyle: citationStyle.toLowerCase(),
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
        mapRegions: {
          default: {
            suffix: "",
            fill: "#55769b",
            legend: _t("default_legend"),
          },
          suffixes: [],
        },
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
            log(
              "warning",
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
              meta.taxa[row.columnName].searchCategoryOrder.push(
                metaRow.values.toLowerCase()
              );
            }
          }
        );
      });

      data.sheets.appearance.tables.searchOnline.data[lang.code].forEach(
        function (row) {
          meta.externalSearchEngines.push({
            title: row.title,
            icon: row.icon,
            url: row.searchUrlTemplate,
          });
        }
      );

      data.sheets.appearance.tables.mapRegions.data[lang.code].forEach(
        function (row) {
          if (row.suffix.trim() == "") {
            meta.mapRegions.default.suffix = row.suffix;
            meta.mapRegions.default.fill = row.fillColor;
            meta.mapRegions.default.legend = row.legend;
          } else {
            meta.mapRegions.suffixes.push({
              suffix: row.suffix,
              fill: row.fillColor,
              legend: row.legend,
              appendedLegend: row.appendedLegend
            });
          }
        }
      );

      return meta;
    }

    function compileDataMeta(lang, expectedDataTypes) {
      let allDataPaths = data.common.allUsedDataPaths[lang.code].sort();

      let meta = {};

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
          contentType: "text",
          template: "",
          placement: "bottom",
        };
      }

      data.common.getAllColumnInfos(lang.code).forEach(function (info) {
        // for each of allPaths which matches info.name
        let matchingComputedDataPaths = allDataPaths.filter(function (path) {
          return (
            dataPath.modify.itemNumbersToHash(path).toLowerCase() ==
            dataPath.modify.itemNumbersToHash(info.name)
          );
        });

        if (!expectedDataTypes.includes(info.table)) {
          return;
        }

        matchingComputedDataPaths.forEach(function (computedDataPath) {
          if (info.role == "taxon") {
            return;
          }
          let dataType = "custom";

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
                    meta[computedDataPath].searchCategoryOrder.push(
                      row.values.toLowerCase()
                    );
                  }
                }
              );
            }

            meta[computedDataPath].separator = info.fullRow.subitemsSeparator;
            meta[computedDataPath].contentType = info.fullRow.contentType;
            meta[computedDataPath].template = info.fullRow.template;
            meta[computedDataPath].placement = placement;
            meta[computedDataPath].hidden = info.fullRow.hidden == "yes";
            meta[computedDataPath].format = info.fullRow.formatting;

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
      log("error", _tf("Problem loading data"));
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
          log(
            "error",
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
          log("error", _tf("dm_column_names_duplicate", [header]));
        }
      });

      for (let rowIndex = 1; rowIndex < table.length; rowIndex++) {
        const row = table[rowIndex];

        let rowObj = { t: [], d: {} };
        let doneWithTaxa = false;

        allColumnInfos.forEach(function (info) {
          let position = dataPath.analyse.position(allColumnNames, info.name);
          if (!position.isLeaf) {
            return;
          }

          if (info.role == "taxon") {
            let taxon = readTaxon(headers, row, info.name, lang.code);

            let taxonIsEmpty = taxon?.n?.trim() == "" && taxon?.a?.trim() == "";

            if (taxonIsEmpty) {
              doneWithTaxa = true;
            } else {
              if (!doneWithTaxa) {
                rowObj.t.push(taxon);
              } else {
                log(
                  "error",
                  _tf("dm_incomplete_taxa_info_row", [
                    rowIndex + data.common.checklistHeadersStartRow,
                    info.name,
                  ])
                );
              }
            }
          } else if (info.role == "data") {
            includeTreefiedData(
              rowObj.d,
              headers,
              row,
              dataPath.modify.pathToSegments(info.name),
              0,
              info,
              "",
              lang.code
            );
          } else {
            console.log("Unknown role: " + info.role);
          }
        });

        data.sheets.checklist.data[lang.code].push(rowObj);
      }
    });

    function includeTreefiedData(
      rowObjData,
      headers,
      row,
      pathSegments,
      pathPosition,
      info,
      computedPath,
      langCode
    ) {
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
              let genericData = getGenericData(
                headers,
                row,
                countedComputedPath,
                info,
                langCode
              );
              if (genericData !== "") {
                //rowObjData[count - 1] = genericData;
                rowObjData[lastSuccesfullCount] = genericData;
                lastSuccesfullCount++;

                if (
                  !emptyCellsInArrayReported &&
                  count != lastSuccesfullCount
                ) {
                  // lastSuccesfullCount must be as is and not with -1 to give the user a 1 based index and not a 0 based one
                  log(
                    "error",
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
                headers,
                row,
                pathSegments,
                pathPosition + 1,
                info,
                countedComputedPath,
                langCode
              );
              lastSuccesfullCount++;
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
          if (rowObjData.hasOwnProperty(currentSegment)) {
            console.log("ERROR duplicity for: " + currentSegment);
          }
          let genericData = getGenericData(
            headers,
            row,
            computedPath,
            info,
            langCode
          );
          //if (genericData) {
          rowObjData[currentSegment] = genericData;
          //}
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
          headers,
          row,
          pathSegments,
          pathPosition + 1,
          info,
          computedPath,
          langCode
        );
      }
    }

    function getGenericData(headers, row, computedPath, info, langCode) {
      switch (info.type) {
        case "general":
          let stringValue = readSimpleData(
            headers,
            row,
            computedPath,
            langCode
          );
          if (stringValue == null) {
            let template = "";
            if (
              info.table == data.sheets.content.tables.customDataDefinition.name
            ) {
              let columnMeta =
                data.sheets.content.tables.customDataDefinition.data[
                  langCode
                ].find(function (row) {
                  if (
                    dataPath.modify.itemNumbersToHash(row.columnName) ==
                    dataPath.modify.itemNumbersToHash(computedPath)
                  ) {
                    return true;
                  }
                });
              template = columnMeta ? columnMeta.template : "";
            } else if (info.table == data.sheets.content.tables.maps.name) {
              let columnMeta = data.sheets.content.tables.maps.data[
                langCode
              ].find(function (row) {
                if (
                  dataPath.modify.itemNumbersToHash(row.columnName) ==
                  dataPath.modify.itemNumbersToHash(computedPath)
                ) {
                  return true;
                }
              });
              template = columnMeta ? columnMeta.source : "";
            } else if (info.table == data.sheets.content.tables.media.name) {
              let columnMeta = data.sheets.content.tables.media.data[
                langCode
              ].find(function (row) {
                if (
                  dataPath.modify.itemNumbersToHash(row.columnName) ==
                  dataPath.modify.itemNumbersToHash(computedPath)
                ) {
                  return true;
                }
              });
              template = columnMeta ? columnMeta.linkBase : "";
            }

            let valueRegex = new RegExp("{{\\s*value\\s*}}", "i");

            if (valueRegex.test(template)) {
              log(
                "warning",
                _tf("dm_defined_column_not_present", [
                  computedPath,
                  info.table,
                  data.sheets.content.name,
                ])
              );
            }

            return "";
          }
          if (stringValue.toString().length > 0) {
            let matchingMetaRow =
              data.sheets.content.tables.customDataDefinition.data[
                langCode
              ].find(function (row) {
                return (
                  row.columnName.toLowerCase() ==
                  dataPath.modify.itemNumbersToHash(computedPath).toLowerCase()
                );
              });

            let expectedType = "text";
            if (matchingMetaRow != null) {
              expectedType = matchingMetaRow.contentType;
            }

            switch (expectedType) {
              case "text":
                stringValue = DOMPurify.sanitize(stringValue);

                stringValue = stringValue.toString().trim();
                stringValue = stringValue.replace(/\r\n/, "\\n");
                stringValue = stringValue.replace(/[\r\n]/, "\\n");
                return stringValue;
                break;
              case "number":
                let number = 0;
                if (Number.isInteger(stringValue)) {
                  number = parseInt(stringValue);
                } else {
                  number = parseFloat(stringValue);
                }
                if (Number.isNaN(number)) {
                  log(
                    "error",
                    _tf("dm_value_not_number", [stringValue, computedPath])
                  );
                }
                return number;
                break;
              case "date":
                let date = stringValue;

                let dateFormat = data.common.getItem(
                  log,
                  data.sheets.appearance.tables.customization.data,
                  "Date format",
                  lang.code,
                  "YYYY-MM-DD"
                );

                date = dayjs(stringValue).format(dateFormat);

                return date;
                break;
              default:
                break;
            }
          }
          break;
        case "taxon":
          return readTaxon(headers, row, computedPath, langCode);
          break;
        case "media":
          return readMedia(headers, row, computedPath, langCode);
          break;
        default:
          console.log("Unknown data type: " + type);
          break;
      }
      return "";
    }

    function readMedia(headers, row, path, langCode) {
      let mediaArray = [];

      //first a case without numbers
      let singleMedia = readSingleMedia(headers, row, path, langCode);
      if (singleMedia !== null) {
        mediaArray.push(singleMedia);
      }
      for (let index = 1; index <= 50; index++) {
        singleMedia = readSingleMedia(
          headers,
          row,
          path + index.toString(),
          langCode
        );

        if (singleMedia !== null) {
          mediaArray.push(singleMedia);
        }
      }

      return mediaArray;
    }

    function readSingleMedia(headers, row, path, langCode) {
      if (
        headers.indexOf(path) < 0 &&
        headers.indexOf(path + ":" + langCode) < 0 &&
        headers.indexOf(path + ".source") < 0 &&
        headers.indexOf(path + ".source:" + langCode) < 0
      ) {
        return null;
      }

      let _plain = readSimpleData(headers, row, path, langCode);
      let source = readSimpleData(headers, row, path + ".source", langCode);
      let title = readSimpleData(headers, row, path + ".title", langCode);

      if (source === null && title === null) {
        source = _plain;
        title = "";
      }

      if (source === null || (source !== null && title === null)) {
        log(
          "error",
          _tf("dm_media_column_names", [
            path,
            path,
            path + ".source",
            path + ".title",
          ])
        );
      }

      return { source: source, title: title };
    }

    function readTaxon(headers, row, path, langCode) {
      let _plain = readSimpleData(headers, row, path, langCode);
      let name = readSimpleData(headers, row, path + ".name", langCode);
      let authority = readSimpleData(
        headers,
        row,
        path + ".authority",
        langCode
      );

      if (name === null && authority === null) {
        name = _plain;
        authority = "";
      }

      if (name === null || (name !== null && authority === null)) {
        log(
          "error",
          _tf("dm_taxon_column_names", [
            path,
            path,
            path + ".name",
            path + ".authority",
          ])
        );
      }

      return { n: name, a: authority };
    }

    function readSimpleData(headers, row, columnName, language) {
      //try with given language
      let colIndex = indexOfCaseInsensitive(
        headers,
        columnName + ":" + language
      );
      //try with default language code
      if (colIndex < 0) {
        colIndex = indexOfCaseInsensitive(
          headers,
          columnName + ":" + data.common.languages.defaultLanguageCode
        );
      }
      //try without default language code
      if (colIndex < 0) {
        colIndex = indexOfCaseInsensitive(headers, columnName);
      }
      if (colIndex < 0) {
        return null;
      }
      return row[colIndex];
    }
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
              log("critical", "Missing table " + table.name);
              return;
            }

            //verify presence of all required columns
            for (const row of tableData) {
              for (const key in row) {
                let value = row[key];
                if (value === undefined) {
                  //value was not read, this means the column is missing
                  log(
                    "critical",
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
                  log(
                    "critical",
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
                  log(
                    "error",
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
                        log(
                          "error",
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
                        log(
                          "error",
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
                        log(
                          "error",
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
                        log(
                          "error",
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
                        log(
                          "error",
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
                        log(
                          "error",
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

                      let regex = new RegExp(integrity.regex, "i");
                      console.log(regex, integrity.regex);
                      if (regex.test(value) == false) {
                        log(
                          "error",
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
                    log(
                      "error",
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
        log(
          "warning",
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
          log(
            "error",
            _tf("dm_column_name_duplicate", [
              item.name,
              item.table,
              uniqueColumnNames[item.name].table,
            ])
          );
        }
      });

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
        log(
          "error",
          _tf("dm_hue_value", [
            data.sheets.appearance.tables.customization.name,
          ])
        );
      }
    });
    */

    data.common.languages.supportedLanguages.forEach(function (lang) {
      let table =
        data.sheets.content.tables.customDataDefinition.data[lang.code];
      if (table === null) {
        log("critical", "Cannot find custom data def");
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
          log("critical", "Not found column " + columnName);
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
          log(
            "error",
            _tf("dm_wrong_placement", [
              columnName,
              row.placement,
              columnName.substring(0, columnName.indexOf(".")),
            ])
          );
        }

        // Only leaf column can have "template"
        if (row.template != "" && !colPosition.isLeaf) {
          log("error", _tf("dm_wrong_template", [columnName]));
        }

        // Only leaf column can have badge "formatting"
        if (row.formatting.toLowerCase() == "badge" && !colPosition.isLeaf) {
          log(
            "error",
            _tf("dm_wrong_badge", [
              columnName,
              data.sheets.content.tables.customDataDefinition.columns.formatting
                .name,
            ])
          );
        }

        // Only columns with children or # can have subitems separator
        if (row.subitemsSeparator != "" && !colPosition.hasChildren) {
          log(
            "error",
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
              log(
                "warning",
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
              log(
                "error",
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
      if (msg.level == "critical" || msg.level == "error") {
        dataManager.hasErrors = true;
      }
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
    hasErrors: false,

    loadData: function (extractor) {
      this.loggedMessages = [];
      this.hasErrors = false;

      extractor.loadMeta(data, log);
      checkMetaValidity();
      if (!this.hasErrors) {
        postprocessMetadata();
      }

      if (!this.hasErrors) {
        loadData(extractor.getRawChecklistData());
      }
    },

    getCompiledChecklist() {
      return compileChecklist();
    },
  };

  return dataManager;
};

export let dataPath = {
  validate: {
    isSimpleColumnName: function (value) {
      let simpleColumnName = new RegExp("^[a-zA-Z]+$", "gi");
      return simpleColumnName.test(value);
    },
    isDataPath(value) {
      let valueSplit = value.split(".");
      let correct = true;
      valueSplit.forEach(function (columnSegment) {
        if (!correct) {
          return;
        }
        let extendedColumnName = new RegExp(
          "^[a-zA-Z]+(([1-9]+[0-9]*)|#)?$",
          "gi"
        );
        if (extendedColumnName.test(columnSegment) == false) {
          correct = false;
        }
      });

      return correct;
    },
  },
  analyse: {
    position: function (allDataPaths, thisDataPath) {
      let result = {
        isLeaf: false,
        isRoot: false,
        hasChildren: false,
        isSimpleItem: false,
      };

      allDataPaths = allDataPaths.map(function (item) {
        return dataPath.modify.itemNumbersToHash(item).toLowerCase();
      });
      thisDataPath = dataPath.modify
        .itemNumbersToHash(thisDataPath)
        .toLowerCase();

      if (thisDataPath.indexOf(".") < 0 && thisDataPath.indexOf("#") < 0) {
        if (dataPath.analyse.hasChildren(allDataPaths, thisDataPath)) {
          //root item
          result.isLeaf = false;
          result.isRoot = true;
          result.hasChildren = true;
        } else {
          //simple item
          result.isLeaf = true;
          result.isRoot = true;
          result.hasChildren = false;
        }
      } else {
        if (dataPath.analyse.hasChildren(allDataPaths, thisDataPath)) {
          //middle item
          result.isLeaf = false;
          result.isRoot = false;
          result.hasChildren = true;
        } else {
          //leaf item
          result.isLeaf = true;
          result.isRoot = false;
          result.hasChildren = false;
        }
      }

      result.isSimpleItem =
        result.isLeaf && result.isRoot && !result.hasChildren;
      return result;
    },
    getChildrenOf(allDataPaths, parent) {
      parent = parent.toLowerCase();
      let children = [];

      allDataPaths.forEach(function (othertDataPath) {
        let other = othertDataPath.toLowerCase();
        if (other.startsWith(parent + ".") || other.startsWith(parent + "#")) {
          return children.push(other);
        }
      });

      return children;
    },
    hasChildren: function (allDataPaths, possibleParent) {
      return (
        dataPath.analyse.getChildrenOf(allDataPaths, possibleParent).length > 0
      );
    },
  },
  modify: {
    itemNumbersToHash: function (value) {
      return value.replace(/(\d+)/g, "#");
    },
    pathToSegments: function (path) {
      let split = path.split(/\.|#/);
      split = split.map(function (item) {
        if (item == "") {
          return "#";
        } else {
          return item;
        }
      });
      return split;
    },
    segmentsToPath: function (segments) {
      let path = "";

      for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];

        if (segment == "#") {
          path = path + segment;
        } else {
          path = path + "." + segment;
        }
      }

      if (path.startsWith(".")) {
        path = path.substring(1);
      }

      return path;
    },
  },
};

import Handlebars from "handlebars";
import { TinyBibReader } from 'bibtex-json-toolbox';
import { t, tf } from 'virtual:i18n-self';

import { absoluteUsercontent, isValidHttpUrl, pad, relativeToUsercontent, splitN } from "../components/Utils.js";
import { getAllColumnInfos, nlDataStructure } from "./DataManagerData.js";
import { loadDataByType, allowedDataTypesIncludingList, dataCustomTypes, isColumnPresentInHeaders, clearHelpersCache } from "./customTypes/index.js";
// Register the dataCustomTypes map with the DwC compiler so it can call
// each type's toDwC() method without a circular import.
registerDataCustomTypes(dataCustomTypes);

import { Logger } from "../components/Logger.js";
import { dataPath, getDataFromDataPath } from "./DataPath.js";
import { i18nMetadata } from "../i18n/index.js";
import { cssColorNames } from "../components/CssColorNames.js";
import { validateConfiguredMonthNames } from "./MonthNames.js";
import { compileDwcArchive, registerDataCustomTypes } from "./dwc/DwcArchiveCompiler.js";
import { helpers as customTypeHelpers } from "./customTypes/helpers.js";
import { CUSTOMIZATION_ITEMS, OCCURRENCE_IDENTIFIER } from "./DataStructure.js";

// Global array to collect assets from F: directives

// --- Pure helpers for "Belongs to" column attribution ------------------------

/**
 * Returns the root segment of a CDD data path - the portion before the first
 * '.' or '#'.  This is the column on which `belongsTo` is declared; all child
 * paths inherit from it.
 *
 * Examples:
 *   "redlist"        → "redlist"
 *   "origPub.author" → "origPub"
 *   "habitat#"       → "habitat"
 */
function getRootDataPath(colName) {
  const dotIdx = colName.indexOf(".");
  const hashIdx = colName.indexOf("#");
  const sepIdx = Math.min(
    dotIdx === -1 ? Infinity : dotIdx,
    hashIdx === -1 ? Infinity : hashIdx
  );
  return sepIdx === Infinity ? colName : colName.slice(0, sepIdx);
}

/**
 * Builds a Map<rootColName(lowercase) → "taxon"|"occurrence"> from a CDD
 * table's row array.  Processes all rows; the effective value for any path
 * is resolved by looking up its root.  Blank value is normalised to "taxon" -
 * the backward-compatible default for columns that pre-date this feature.
 *
 * Only the root row's value is authoritative for downstream resolution;
 * child rows may also declare the value (and are validated for consistency
 * in the integrity-check pass), but this map is keyed on the root segment.
 *
 * @param {Object[]} cddRows  Rows from customDataDefinition.data[langCode]
 * @returns {Map<string, "taxon"|"occurrence">}
 */
function buildRootBelongsToMap(cddRows) {
  const map = new Map();
  if (!cddRows) return map;
  cddRows.forEach(function (row) {
    const colName = (row.columnName || "").toLowerCase().trim();
    if (!colName) return;
    // Only index root-level entries into the authoritative map so that
    // resolveBelongsTo can always find the canonical value via the root key.
    // Child rows are free to repeat the value, but are not indexed here.
    if (colName.includes(".")) return;
    const rootKey = getRootDataPath(colName); // "habitat#" → "habitat"
    const raw = (row.belongsTo || "").toLowerCase().trim();
    if (!raw) return;
    map.set(rootKey, raw === OCCURRENCE_IDENTIFIER ? OCCURRENCE_IDENTIFIER : "taxon");
  });
  return map;
}

/**
 * Resolves the effective `belongsTo` value for any data path by looking up
 * its root in the pre-built map.
 *
 * @param {string}             colName          Data path (any depth)
 * @param {Map<string,string>} rootBelongsToMap From buildRootBelongsToMap()
 * @returns {"taxon"|"occurrence"}
 */
function resolveBelongsTo(colName, rootBelongsToMap) {
  const rootPath = getRootDataPath(colName.toLowerCase());
  if (rootBelongsToMap.has(rootPath)) return rootBelongsToMap.get(rootPath);
  const stripped = rootPath.replace(/\d+$/, ""); // handle habitat1 → habitat
  return rootBelongsToMap.get(stripped) ?? null; // null = not declared, skip check
}

// ---------------------------------------------------------------------------
// Wildcard expansion helpers for categoryDisplay and searchOrder tables
// ---------------------------------------------------------------------------

/**
 * Returns true when a columnName is a trailing "prefix.*" wildcard - the only
 * supported wildcard form for categoryDisplay and searchOrder column names.
 *
 * Valid:   "status.*", "info.redList.*"
 * Invalid: "*.status", "status.*.sub", "status*"  (caught separately)
 *
 * @param {string} columnName
 * @returns {boolean}
 */
function isTrailingDotStarWildcard(columnName) {
  return typeof columnName === "string" && columnName.endsWith(".*");
}

/**
 * Returns all direct-child CDD column names for a given parent prefix.
 *
 * "Direct child" means a CDD columnName matching exactly `prefix.<segment>`
 * where `<segment>` contains no further "." or "#" characters.
 *
 * Examples (prefix = "status"):
 *   CDD has: status.nc, status.vu, status.fj, status.nc.detail
 *   Returns: ["status.nc", "status.vu", "status.fj"]
 *            (status.nc.detail is excluded - it is a grandchild)
 *
 * @param {string}   prefix   Parent path prefix, e.g. "status" (case-insensitive)
 * @param {Object[]} cddRows  Rows from customDataDefinition.data[langCode]
 * @returns {string[]}        Column names using the original casing from CDD rows
 */
function getDirectCddChildren(prefix, cddRows) {
  const childPrefix = prefix.toLowerCase() + ".";
  const seen = new Set();
  const result = [];
  (cddRows || []).forEach(function (row) {
    const colName = (row.columnName || "").toString().trim();
    if (!colName) return;
    const colLower = colName.toLowerCase();
    if (!colLower.startsWith(childPrefix)) return;
    const rest = colLower.slice(childPrefix.length);
    // Direct child only: rest must be non-empty and contain no "." or "#"
    if (!rest || rest.includes(".") || rest.includes("#")) return;
    if (!seen.has(colLower)) {
      seen.add(colLower);
      result.push(colName);
    }
  });
  return result;
}

/**
 * Expands trailing ".*" wildcard rows in a table rows array into one concrete
 * row per matching direct CDD child column, following these rules:
 *
 *  1. Only trailing "prefix.*" wildcards are supported.  Any other use of "*"
 *     in a columnName is logged as an error and the row is dropped.
 *  2. Expansion resolves direct children from CDD declared columns (depth +1).
 *  3. If a child column already has at least one explicit (non-wildcard) row
 *     anywhere in the table, the wildcard does NOT generate a row for that
 *     child (explicit rows always win).  An info message is logged.
 *  4. A wildcard that matches zero CDD children triggers a warning.
 *
 * The original rows array is never mutated; a new array is returned.
 *
 * @param {Object[]} rows       Source rows for one language (not modified)
 * @param {Object[]} cddRows    CDD rows for the same language
 * @param {string}   tableLabel Human-readable table name for log messages
 * @returns {Object[]}          New rows array with wildcards expanded in place
 */
function expandWildcardRows(rows, cddRows, tableLabel) {
  if (!rows || rows.length === 0) return rows;

  // First pass: collect every explicit (non-wildcard) columnName (lowercased)
  // so wildcard expansion can skip children that are already explicitly covered.
  const explicitColumnNames = new Set();
  rows.forEach(function (row) {
    const colName = (row.columnName || "").toString().trim();
    if (!isTrailingDotStarWildcard(colName)) {
      explicitColumnNames.add(colName.toLowerCase());
    }
  });

  // Second pass: build the output array, expanding wildcards in-place.
  const result = [];
  rows.forEach(function (row) {
    const colName = (row.columnName || "").toString().trim();

    if (!isTrailingDotStarWildcard(colName)) {
      // Reject any other use of "*" in the column name.
      if (colName.includes("*")) {
        Logger.error(
          'In table "' + tableLabel + '": column name "' + colName +
          '" uses "*" in an unsupported position. Only a trailing ".*" is' +
          ' allowed (e.g. "status.*"). This row will be ignored.'
        );
        return; // drop the invalid row
      }
      result.push(row);
      return;
    }

    // Strip the trailing ".*" to obtain the parent prefix.
    const prefix = colName.slice(0, -2);
    if (!prefix) {
      Logger.error(
        'In table "' + tableLabel + '": column name "' + colName +
        '" is not a valid wildcard - the prefix before ".*" must not be empty.' +
        ' This row will be ignored.'
      );
      return;
    }

    const children = getDirectCddChildren(prefix, cddRows);
    if (children.length === 0) {
      Logger.warning(
        'In table "' + tableLabel + '": wildcard "' + colName +
        '" did not match any direct children of "' + prefix + '" in the' +
        ' Custom data definition table. Check the column name spelling.'
      );
      return;
    }

    children.forEach(function (childColName) {
      if (explicitColumnNames.has(childColName.toLowerCase())) {
        Logger.info(
          'In table "' + tableLabel + '": wildcard "' + colName +
          '" skipped for "' + childColName +
          '" - an explicit row for that column already exists and takes precedence.'
        );
        return;
      }
      result.push(Object.assign({}, row, { columnName: childColName }));
    });
  });

  return result;
}

/**
 * Returns true if any spreadsheet cell belonging to the given root column
 * (or its children) contains a non-empty value in the current row.
 * Used to suppress false-positive cross-entity errors on rows where the
 * column simply has no data.
 *
 * Matches:
 *   • exact header  ("redlist")
 *   • dotted child  ("origpub.author")
 *   • numbered array child ("habitat1", "habitat2", …)
 *
 * @param {string[]} headers  Lowercased spreadsheet column headers
 * @param {any[]}    row      Raw row values
 * @param {string}   rootColName  Root column name (lowercase)
 * @returns {boolean}
 */
function hasAnyDataForRootColumn(headers, row, rootColName) {
  const base = rootColName.toLowerCase();
  return headers.some(function (h, i) {
    if (h !== base) {
      if (!h.startsWith(base)) return false;
      const rest = h.slice(base.length);
      // Accept dotted children ("origpub.author") and numbered array children
      // ("habitat1").  Reject accidental prefix matches ("origpublisher").
      if (rest[0] !== "." && !/^\d/.test(rest)) return false;
    }
    const val = row[i];
    return val != null && val.toString().trim() !== "";
  });
}

// DataManagerData.js
export function getItem(tableData, itemNameOrDescriptor, langCode, callerDefault) {
  const isDescriptor = itemNameOrDescriptor !== null
    && typeof itemNameOrDescriptor === "object";

  const itemName = isDescriptor ? itemNameOrDescriptor.key : itemNameOrDescriptor;
  const defaultValue = ((isDescriptor && arguments.length < 4) || (arguments.length >= 4 && (callerDefault === undefined || callerDefault === null)))
    ? itemNameOrDescriptor.defaultValue
    : callerDefault;

  if (!tableData || !tableData[langCode]) {
    return defaultValue;
  }

  const item = tableData[langCode].find(row => row.item == itemName);
  if (item === undefined) {
    Logger.info(tf("dm_item_fallback_to_default", [itemName, langCode, defaultValue]), "Customization item using default value");
    return defaultValue;
  }

  const value = item.value;
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value;
}

export let DataManager = function () {
  const data = nlDataStructure;

  let compiledChecklistCache = null; // Cache for the compiled checklist

  function compileChecklist(checkAssetsSize) {
    if (compiledChecklistCache) {
      return compiledChecklistCache;
    }

    let currentDate = new Date();

    let additionalAssets = [];

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
        compiledForVersion: import.meta.env.VITE_APP_VERSION,
        lastUpdate: currentDateString,
        defaultVersion: data.common.languages.defaultLanguageCode,
        bibliography: {}, // to be filled from content of bibliography table
      },
      versions: {},
    };

    data.common.languages.supportedLanguages.forEach(function (lang) {
      checklist.versions[lang.code] = compileChecklistVersion(lang);

      // process F: directives for markdown and text files
      let dataPathsToConsider = [];

      Object.keys(checklist.versions[lang.code].dataset.meta.data).forEach(
        function (key) {
          const keyDataType = checklist.versions[lang.code].dataset.meta.data[key].dataType;
          if (
            keyDataType == "markdown" || keyDataType == "text"
          ) {
            dataPathsToConsider.push(key);
          }
        }
      );

      let runSpecificCache = {};

      let rowNumber = 1;
      (checklist.versions[lang.code].dataset.checklist || []).forEach(function (entry) {
        rowNumber++;
        let entryData = entry.d;

        for (const dataPath of dataPathsToConsider) {
          let data = getDataFromDataPath(entryData, dataPath);

          if (data && data != "") {
            // Pass assetsFromFDirectives as an argument to processFDirective
            let result = processFDirective(data, runSpecificCache, dataPath, rowNumber, additionalAssets, ["md", "markdown", "txt"]);
            if (result) {
              setDataAtDataPath(entryData, dataPath, result);
            }
          }
        }
      });
    });

    // -- F-directive processing for content-sheet tables ----------------------
    // Walks every table in sheets.content that declares fDirectiveColumns and
    // resolves any "F:" references in the nominated columns.  This runs once
    // per language so each language's data rows are processed independently.
    // Adding fDirectiveColumns to a new table is sufficient to opt it in here.
    data.common.languages.supportedLanguages.forEach(function (lang) {

      const fDirectiveSheetKeys = ["content", "appearance"];

      fDirectiveSheetKeys.forEach(function (sheetKey) {
        const sheetTables = data.sheets[sheetKey]?.tables;
        if (!sheetTables) return;

        Object.keys(sheetTables).forEach(function (tableKey) {
          const tableDef = sheetTables[tableKey];
          const fDirectiveColumns = tableDef.fDirectiveColumns;

          // Skip tables that have not opted in
          if (!fDirectiveColumns || fDirectiveColumns.length === 0) return;

          const rows = tableDef.data?.[lang.code];
          if (!rows || rows.length === 0) return;

          rows.forEach(function (row, rowIndex) {
            fDirectiveColumns.forEach(function (colSpec) {
              const { columnKey, shouldProcess, allowedExtensions } = colSpec;
              const rawValue = row[columnKey];

              // Nothing to process if cell is empty or not a string
              if (typeof rawValue !== "string" || rawValue.trim() === "") return;

              // Apply the optional per-row predicate
              if (typeof shouldProcess === "function" && !shouldProcess(row)) return;

              const result = processFDirective(
                rawValue,
                {},          // fresh cache per cell - these are not bulk-batch like checklist rows
                columnKey,   // passed as dataPath for error messages
                rowIndex + 1,
                additionalAssets,
                allowedExtensions
              );

              if (result !== null && result !== rawValue) {
                row[columnKey] = result;
              }
            });
          });
        });
      });
    });

    // All F: directives in content/appearance tables are now resolved.
    // gatherReferences() can now read the already-substituted bibtex values.
    checklist.general.bibliography = gatherReferences();

    // Now that all F: directives are processed, gather assets
    checklist.general.assets = gatherPreloadableAssets();

    //We can output this here as the user has the source data anyways
    // Only log in development to avoid leaking data or noisy logs in production builds
    if (import.meta.env && import.meta.env.DEV) {
      console.log("New checklist", checklist);
    }

    compiledChecklistCache = checklist; // Cache the compiled checklist

    return checklist;

    function setDataAtDataPath(data, path, value) {
      const segments = dataPath.modify.pathToSegments(path);
      let current = data;

      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i];

        if (segment === '#') {
          // Handle array notation
          const nextSegment = segments[i + 1];
          if (!Array.isArray(current)) {
            current = [];
          }
          const index = parseInt(nextSegment) - 1; // Convert to 0-based
          if (!current[index]) {
            current[index] = {};
          }
          current = current[index];
          i++; // Skip the number segment
        } else {
          if (!current[segment]) {
            current[segment] = {};
          }
          current = current[segment];
        }
      }

      const lastSegment = segments[segments.length - 1];
      current[lastSegment] = value;
    }

    function gatherReferences() {
      // Get bibliography data from Excel table

      //console.log(data.sheets.content.tables);

      const bibliographyData =
        data.sheets.content.tables.bibliography.data[
        data.common.languages.defaultLanguageCode
        ];

      if (!bibliographyData || bibliographyData.length === 0) {
        return {};
      }

      // Combine all BibTeX entries from individual cells
      const bibCache = {};
      const combinedBibtex = bibliographyData
        .map((row) => {
          const raw = row.bibtex?.trim();
          if (!raw) return null;
          return raw;   // already resolved - no F: check needed
        })
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

      function addAsset(rawSource) {
        if (!rawSource || rawSource.trim() === "") return;
        let source = rawSource.trim();
        if (source.startsWith("/")) {
          source = source.substring(1);
        }
        const asset = relativeToUsercontent(source);
        if (!assets.includes(asset) && isSameOriginAsCurrent(asset)) {
          assets.push(asset);
        }
      }

      data.common.languages.supportedLanguages.forEach(function (lang) {
        // All online search icons
        data.sheets.content.tables.searchOnline?.data?.[lang.code]?.forEach(
          function (row) {
            addAsset("./online_search_icons/" + row.icon);
          }
        );

        // Gather assets from customDataDefinition table via each type's own plugin
        data.sheets.content.tables.customDataDefinition.data[lang.code].forEach(
          function (row) {
            if (!row.template || row.template.trim() === "") return;

            const reader = dataCustomTypes[row.dataType];
            if (!reader || typeof reader.getPreloadableAssetPaths !== "function") return;

            (data.sheets.checklist.data[lang.code] || []).forEach(function (entry) {
              const mediaData = getDataFromDataPath(entry.d, row.columnName);
              if (!mediaData) return;

              const mediaItems = Array.isArray(mediaData) ? mediaData : [mediaData];
              mediaItems.forEach(function (mediaItem) {
                const paths = reader.getPreloadableAssetPaths(mediaItem, row.template, entry);
                paths.forEach(addAsset);
              });
            });
          }
        );
      });

      // Add assets from F: directives, avoiding duplicates
      additionalAssets.forEach(function (asset) {
        if (!assets.includes(asset)) {
          assets.push(asset);
        }
      });

      if (checkAssetsSize) {
        const assetsSizesMsg = "Checking " + assets.length + " assets sizes";

        if(import.meta.env.DEV) {
          console.time(assets);
          //console.log("Assets", assets)
        }
        //console.time(assetsSizesMsg);

        let totalPrecacheSize = 0;
        let precacheMaxTotalSizeMb = parseFloat(
          getItem(
            data.sheets.appearance.tables.customization.data,
            CUSTOMIZATION_ITEMS.PRECACHE_MAX_TOTAL_SIZE,
            data.common.languages.defaultLanguageCode
          )
        );

        let precacheMaxFileSizeMb = parseFloat(
          getItem(
            data.sheets.appearance.tables.customization.data,
            CUSTOMIZATION_ITEMS.PRECACHE_MAX_FILE_SIZE,
            data.common.languages.defaultLanguageCode
          )
        );

        (new Set(assets)).forEach(function (asset) {
          let contentLengthInfo = getContentLengthInfo(asset);

          if (contentLengthInfo && contentLengthInfo.responseStatus == 200) {

            totalPrecacheSize += contentLengthInfo.contentLength / 1024 / 1024; // in MB

            if (
              contentLengthInfo.contentLength > 0 &&
              contentLengthInfo.contentLength / 1024 / 1024 >
              precacheMaxFileSizeMb
            ) {
              Logger.warning(
                tf("dm_asset_too_large", [
                  asset,
                  (contentLengthInfo.contentLength / 1024 / 1024).toFixed(2),
                  precacheMaxFileSizeMb,
                ]),
                t("dm_asset_too_large_title")
              );
            }
          } else {
            if (contentLengthInfo && contentLengthInfo.responseStatus == 404) {
              Logger.error(tf("dm_asset_not_found", [asset]), "Asset not found");
            }
          }
        });

        if (totalPrecacheSize > precacheMaxTotalSizeMb) {
          Logger.error(
            tf("dm_total_precache_size_too_large", [
              totalPrecacheSize.toFixed(2),
              precacheMaxTotalSizeMb,
            ]),
            "Total precache size too large"
          );
        }

        //console.timeEnd(assetsSizesMsg);
      }

      //console.log("Assets", assets.length, "gathered:", assets);

      return assets;
    }

    function getContentLengthInfo(url) {
      const result = { url: "", contentLength: null, responseStatus: 0 };
      
      const absoluteUrl = new URL(url, window.location.href).href;

      try {
        const xhr = new XMLHttpRequest();
        xhr.open("HEAD", absoluteUrl, false); // false makes the request synchronous
        xhr.withCredentials = true; // Include credentials for CORS
        xhr.send(null);

        result.responseStatus = xhr.status;
        result.url = absoluteUrl;

        if (xhr.status === 200) {
          let contentType = xhr.getResponseHeader("Content-Type");
          
          if (!contentType || !(contentType.startsWith("image/") || contentType.startsWith("audio/"))) {
            Logger.warning(tf("dm_asset_head_error", [absoluteUrl]), "File not found");
            return null;
          } else {
            const contentLength = xhr.getResponseHeader("Content-Length");
            result.contentLength = contentLength
              ? parseInt(contentLength, 10)
              : 0;
          }
        } else {
          result.responseStatus = xhr.status;
          Logger.error("Error fetching HEAD for " + absoluteUrl + " status: " + xhr.status, "Error fetching asset");
        }
      } catch (error) {
        Logger.error("Error fetching HEAD for " + absoluteUrl + ": " + error.message, "Error fetching asset");
      }

      return result;
    }

    function compileChecklistVersion(lang) {
      let hue = getItem(
        data.sheets.appearance.tables.customization.data,
        CUSTOMIZATION_ITEMS.COLOR_THEME_HUE,
        lang.code
      );
      let name = getItem(
        data.sheets.appearance.tables.customization.data,
        CUSTOMIZATION_ITEMS.PROJECT_NAME,
        lang.code
      );

      // The generic fDirectiveColumns loop has already resolved any F: reference
      // in this row, so getItem now returns the processed content directly.
      let about = getItem(
        data.sheets.appearance.tables.customization.data,
        CUSTOMIZATION_ITEMS.ABOUT_SECTION,
        lang.code,
        t("generic_about")
      );;

      let howToCite = getItem(
        data.sheets.appearance.tables.customization.data,
        CUSTOMIZATION_ITEMS.HOW_TO_CITE,
        lang.code
      );

      let dateFormat = getItem(
        data.sheets.appearance.tables.customization.data,
        CUSTOMIZATION_ITEMS.DATE_FORMAT,
        lang.code
      );
      const configuredMonthNames = getItem(
        data.sheets.appearance.tables.customization.data,
        CUSTOMIZATION_ITEMS.MONTH_NAMES,
        lang.code
      );
      const monthNamesValidation = validateConfiguredMonthNames(configuredMonthNames);
      const monthNames = monthNamesValidation.hasValue && monthNamesValidation.names
        ? monthNamesValidation.names
        : null;
      /*
      let useCitations = getItem(
        data.sheets.appearance.tables.customization.data,
        CUSTOMIZATION_ITEMS.USE_CITATIONS,
        lang.code
      )
        ?.toLowerCase();
      */
      let useCitations = "apa"; // Hardcode for now

      let precachedImageMaxSize = getItem(data.sheets.appearance.tables.customization.data, CUSTOMIZATION_ITEMS.PRECACHE_MAX_FILE_SIZE,
        lang.code
      );

      let version = {
        languageName: lang.name,
        fallbackUiLang: lang.fallbackLanguage,
        colorThemeHue: hue,
        name: name,
        about: about,
        howToCite: howToCite,
        dateFormat: dateFormat,
        monthNames: monthNames,
        useCitations: useCitations,
        precachedImageMaxSize: parseFloat(precachedImageMaxSize),
        dataset: {
          meta: compileMeta(lang),
          checklist: data.sheets.checklist.data[lang.code],
          singleAccessKeys: data.sheets.checklist.data && data.sheets.checklist.data[lang.code] ? compileSingleAccessKeys(lang, data.sheets.checklist.data[lang.code], additionalAssets) : [],
        },
      };

      return version;
    }

    function compileSingleAccessKeys(lang, checklistData, additionalKeysAssets) {
      if (!data.sheets.content.tables.singleAccessKeys ||
        !data.sheets.content.tables.singleAccessKeys.data ||
        !data.sheets.content.tables.singleAccessKeys.data[lang.code]) {
        return [];
      }

      const rows = data.sheets.content.tables.singleAccessKeys.data[lang.code];
      const keys = [];
      let currentKey = null;
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

      // Helper: Parse a single pipe-separated token into { src, caption }.
      // Format: "filename.jpg" or "filename.jpg #Caption text"
      // Returns null and logs if the token has no valid filename.
      function parseImageToken(token, rowIndex) {
        const hashIdx = token.indexOf('#');
        const filename = (hashIdx === -1 ? token : token.slice(0, hashIdx)).trim();
        const caption = (hashIdx === -1 || hashIdx === token.length - 1)
          ? null
          : token.slice(hashIdx + 1).trim() || null;

        if (!filename) {
          Logger.error("Taxonomic key row " + (rowIndex + 1) + ": Image entry '#" + (caption || '') + "' has no filename - skipped");
          return null;
        }

        const hasValidExtension = allowedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
        if (!hasValidExtension) {
          Logger.error("Taxonomic key row " + (rowIndex + 1) + ": Image '" + filename + "' has invalid extension (allowed: .jpg, .jpeg, .png, .webp)");
          return null;
        }

        let normalizedPath = filename.startsWith('/') ? filename.slice(1) : filename;
        normalizedPath = ('./usercontent/keys/' + normalizedPath).replace(/\/+/g, '/');

        if (!additionalKeysAssets.includes(normalizedPath)) {
          additionalKeysAssets.push(normalizedPath);
        }

        return { src: normalizedPath, caption };
      }

      // Helper: Normalize and track image paths.
      // Returns array of { src, caption } objects; caption is null when absent.
      function processImageCell(imageCell, rowIndex) {
        if (!imageCell || typeof imageCell !== 'string' || imageCell.trim() === '') {
          return [];
        }

        return imageCell
          .split('|')
          .map(token => token.trim())
          .filter(token => token)
          .reduce((acc, token) => {
            try {
              const parsed = parseImageToken(token, rowIndex);
              if (parsed) acc.push(parsed);
            } catch (e) {
              Logger.error("Error processing image token '" + token + "' at row " + (rowIndex + 1) + ": " + e);
            }
            return acc;
          }, []);
      }

      // Process rows
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        try {
          const rawStep = row.step;
          // If rawStep is a string that represents an integer, cast to number.
          let step;
          if (typeof rawStep === 'string') {
            const _trim = rawStep.trim();
            if (/^-?\d+$/.test(_trim)) {
              step = parseInt(_trim, 10);
            } else {
              step = _trim;
            }
          } else {
            step = rawStep;
          }
          const text = row.text;

          let rawTarget = row.target;
          let target;
          if (typeof rawTarget === 'string') {
            const _trim = rawTarget.trim();
            if (/^-?\d+$/.test(_trim)) {
              target = parseInt(_trim, 10);
            } else {
              target = _trim;
            }
          } else {
            target = rawTarget;
          }

          const images = row.images || "";

          // Validate row completeness
          if (!step || !text || target === undefined || target === null || target === '') {
            Logger.error("Taxonomic key row " + (i + 1) + ": Missing required field (Step, Text, or Target)");
            continue;
          }

          const stepType = typeof step;
          const isKeyDefinition = stepType === 'string';
          const isStepDefinition = stepType === 'number';

          if (!isKeyDefinition && !isStepDefinition) {
            Logger.error("Taxonomic key row " + (i + 1) + ": Step must be string (Key ID) or number (Step ID)");
            continue;
          }

          // KEY DEFINITION
          if (isKeyDefinition) {
            // Check for numeric key IDs
            if (!isNaN(step)) {
              Logger.error("Taxonomic key row " + (i + 1) + ": Key ID '" + step + "' appears numeric - use text IDs only");
              continue;
            }

            // Check uniqueness
            if (keys.find(k => k.id === step)) {
              Logger.error("Taxonomic key row " + (i + 1) + ": Duplicate Key ID '" + step + "'");
              continue;
            }

            // --- VALIDATION: Ensure NO images on Key Definition ---
            if (images && typeof images === 'string' && images.trim() !== "") {
              Logger.error("Taxonomic key row " + (i + 1) + ": Key definition '" + step + "' cannot contain images. Images are only allowed on numeric steps.");
            }
            // -----------------------------------------------------

            // Finalize previous key if exists
            if (currentKey) {
              validateKey(currentKey, checklistData);
            }

            // Parse title | description
            const textParts = text.split('|').map(p => p.trim());
            const title = textParts[0] || '';
            const description = textParts[1] || '';

            currentKey = {
              id: step,
              title: title,
              description: description,
              // 'images' property is deliberately omitted here
              steps: []
            };

            keys.push(currentKey);
            continue;
          }

          // STEP DEFINITION
          if (isStepDefinition) {
            // Check if orphaned
            if (!currentKey) {
              Logger.error("Taxonomic key row " + (i + 1) + ": Step " + step + " appears before any Key definition");
              continue;
            }

            // Determine target type
            const targetType = typeof target;
            let targetValue = target;
            let stepTypeValue = 'external';

            if (targetType === 'number') {
              stepTypeValue = 'internal';

              // Validate no targeting step 1
              if (target === 1) {
                Logger.error("Taxonomic key '" + currentKey.id + "' row " + (i + 1) + ": Step " + step + " targets 1 (forbidden)");
                continue;
              }

              // Validate strict progression
              if (target <= step) {
                Logger.error("Taxonomic key '" + currentKey.id + "' row " + (i + 1) + ": Step " + step + " targets " + target + " (must be > " + step + ")");
                continue;
              }
            } else if (targetType === 'string') {
              targetValue = target.trim();
            } else {
              Logger.error("Taxonomic key '" + currentKey.id + "' row " + (i + 1) + ": Target must be number or string");
              continue;
            }

            // Process step images (allowed here)
            const stepImagePaths = processImageCell(images, i);

            currentKey.steps.push({
              step_id: step,
              text: text,
              target: targetValue,
              type: stepTypeValue,
              images: stepImagePaths // 'images' property exists here
            });
          }
        } catch (e) {
          Logger.error("Error processing taxonomic key row " + (i + 1) + ": " + e);
        }
      }

      // Validate final key
      if (currentKey) {
        validateKey(currentKey, checklistData);
      }

      //console.log("###### keys", keys);

      return keys;

      // VALIDATION HELPER
      function validateKey(key, checklistData) {
        try {
          const steps = key.steps;
          const keyId = key.id;

          // Check entry point
          const hasStartStep = steps.some(s => s.step_id === 1);
          if (!hasStartStep) {
            Logger.error("Taxonomic key '" + keyId + "': Missing Step 1 (entry point required)");
            return;
          }

          // Get unique step IDs
          const stepIds = [...new Set(steps.map(s => s.step_id))].sort((a, b) => a - b);

          if (stepIds.length === 0) return;

          const maxStep = Math.max(...stepIds);

          // Check continuity
          for (let i = 1; i <= maxStep; i++) {
            if (!stepIds.includes(i)) {
              Logger.error("Taxonomic key '" + keyId + "': Missing Step " + i + " (steps must be continuous from 1 to " + maxStep + ")");
            }
          }

          // Check internal integrity
          const internalTargets = steps
            .filter(s => s.type === 'internal')
            .map(s => s.target);

          for (const target of internalTargets) {
            if (!stepIds.includes(target)) {
              Logger.error("Taxonomic key '" + keyId + "': Target Step " + target + " does not exist");
            }
          }

          // Check external integrity with exit taxa
          const externalTargets = new Set(steps
            .filter(s => s.type === 'external')
            .map(s => s.target));

          for (const taxon of checklistData) {
            if (externalTargets.size === 0) {
              break;
            }
            for (const taxonLevel of taxon.t) {
              if (!taxonLevel) continue; // skip null gaps

              if (externalTargets.has(taxonLevel.name)) {
                externalTargets.delete(taxonLevel.name);
              }
            }
          }

          if (externalTargets.size > 0) {
            for (const target of externalTargets) {
              Logger.warning("Taxonomic key '" + keyId + "': Taxon '" + target + "' does not exist in the checklist. This is alright if your key is expected to point to taxa outside of this checklist, but it will prevent the automatic display of the taxon details when reaching the taxon via the key.", "Taxon not found in checklist");
            }
          }

          // Check reachability (all steps except 1 must be targeted)
          const targetedSteps = new Set(internalTargets);
          for (const stepId of stepIds) {
            if (stepId !== 1 && !targetedSteps.has(stepId)) {
              Logger.error("Taxonomic key '" + keyId + "': Step " + stepId + " is never reached (dead code)");
            }
          }
        } catch (e) {
          Logger.error("Error validating taxonomic key '" + key.id + "': " + e);
        }
      }
    }

    function compileMeta(lang) {
      let meta = {
        taxa: {},
        data: compileDataMeta(lang, [
          data.sheets.content.tables.customDataDefinition.name,
        ]),
        mapRegionsLegend: {
          default: {
            columnName: "",
            status: "",
            fill: "#55769b",
            legend: t("default_legend"),
            appendedLegend: "",
            legendType: "category",
          },
          statuses: [],
        },
        mapRegionsNames: [],
        externalSearchEngines: [],
        databaseShortcodes: compileDatabaseShortcodes(lang),
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
            , "Wrong parent taxon indication");
            row.parentTaxonIndication = "";
          }
        }

        meta.taxa[row.columnName] = {
          name: row.taxonName,
          order: row.orderBy,
          searchCategoryOrder: [],
          parentTaxonIndication: row.parentTaxonIndication,
          italicize: row.italicize?.toLowerCase().trim() === "yes" ? "yes" : "no",
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

      data.sheets.content.tables.searchOnline.data[lang.code]?.forEach(function (
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
          const colName = (row.columnName || "").toString().trim();
          const status = (row.status || "").toString().trim();
          const legendType = (row.legendType || "category").toString().trim().toLowerCase();

          // The global fallback: empty columnName AND empty status AND category type.
          // Handled separately; does not go into statuses[].
          if (colName === "" && status === "" && (legendType === "" || legendType === "category")) {
            meta.mapRegionsLegend.default.fill = row.fillColor;
            meta.mapRegionsLegend.default.legend = (row.legend || "").toString();
            meta.mapRegionsLegend.default.appendedLegend = (row.appendedLegend || "").toString();
          } else {
            meta.mapRegionsLegend.statuses.push({
              columnName: colName,
              status: status,
              fill: row.fillColor,
              legend: (row.legend || "").toString(),
              appendedLegend: (row.appendedLegend || "").toString(),
              legendType: legendType,
            });
          }
        }
      );

      // Error when a declared mapregions column has no applicable legend rows at all
      // (neither column-specific rows nor any global rows with empty columnName).
      // Such columns will silently render every status value with the built-in
      // default color, which is almost always unintentional.
      const hasAnyGlobalRow = meta.mapRegionsLegend.statuses.some(s => !s.columnName);
      if (!hasAnyGlobalRow) {
        Object.entries(meta.data)
          .filter(([, v]) => v.dataType === "mapregions")
          .forEach(function ([colKey]) {
            const hasCoverage = meta.mapRegionsLegend.statuses.some(s => s.columnName === colKey);
            if (!hasCoverage) {
              Logger.error(
                'Map regions legend: no legend rows found for mapregions column "' + colKey +
                '". All status values for this column will render with the built-in default color.',
                "Map regions legend"
              );
            }
          });
      }

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
      //console.log("Compiling meta", lang, expectedDataTypes, data.common)
      //console.log("CDD", data.sheets.content.tables.customDataDefinition.data)
      //console.log("Full data", data.sheets)

      let allDataPaths = (data.common.allUsedDataPaths[lang.code] || []).sort();

      const cddRows = data.sheets.content.tables.customDataDefinition.data[lang.code] || [];

      // Pre-build the root→belongsTo map once for this language pass so that
      // every computedDataPath can resolve its effective value in O(1).
      const rootBelongsToMap = buildRootBelongsToMap(cddRows);

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
          dataType: "text",
          template: "",
          placement: "bottom",
        };
      }
        */

      getAllColumnInfos(nlDataStructure, lang.code).forEach(function (info) {
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

          if (info.dataType == "taxon") {
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

          meta[computedDataPath] = {
            datatype: dataType,
          };

          let placement = [];

          info.fullRow.placement
            .trim()
            .toLowerCase()
            .split("|")
            .forEach((x) => placement.push(x.trim()));


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
              info.fullRow.hidden != null &&
              info.fullRow.hidden !== "" &&
              info.fullRow.hidden !== "yes" &&
              info.fullRow.hidden !== "no" &&
              info.fullRow.hidden !== "data"
            ) {
              let expr = info.fullRow.hidden;

              let split = splitN(expr, " ", 3);
              if (split.length < 3 || split.length > 4) {
                Logger.error(
                  tf("dm_hidden_syntax_wrong_length", [
                    info.fullRow.columnName,
                    expr,
                  ])
                );
                return;
              }

              if (!["if", "unless"].includes(split[0])) {
                Logger.error(
                  tf("dm_hidden_syntax", [info.fullRow.columnName, expr])
                );
              }

              let filter = split[1];
              if (!dataPath.validate.isDataPath(filter)) {
                Logger.error(
                  tf("dm_hidden_syntax_wrong_filter", [
                    info.fullRow.columnName,
                    filter,
                  ])
                );
              }

              if (!["is", "isset", "notset", "notsetor"].includes(split[2])) {
                Logger.error(
                  tf("dm_hidden_syntax_wrong_operator", [
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
                    tf("dm_hidden_syntax_wrong_value", [
                      info.fullRow.columnName,
                      expr,
                    ])
                  );
                }
              }
            }

            // Parse "list <separator>" syntax: e.g. "list comma" → dataType="list", separator="comma"
            let parseddataType = info.fullRow.dataType;
            let parsedSeparator = "";
            if (parseddataType.toLowerCase().startsWith("list")) {
              const parts = parseddataType.trim().split(/\s+/);
              parseddataType = "list";
              parsedSeparator = parts.length > 1 ? parts.slice(1).join(" ") : "";
            }

            meta[computedDataPath].separator = parsedSeparator;
            meta[computedDataPath].dataType = parseddataType;
            meta[computedDataPath].template = info.fullRow.template;
            meta[computedDataPath].placement = placement;
            meta[computedDataPath].hidden = info.fullRow.hidden;
            // Resolve belongsTo for this computed data path via the root→belongsTo map.
            meta[computedDataPath].belongsTo = resolveBelongsTo(computedDataPath, rootBelongsToMap);

            if (parseddataType.toLowerCase() == "category") {
              meta[computedDataPath].categories = [];
              const normalizedComputedPath = dataPath.modify
                .itemNumbersToHash(computedDataPath)
                .toLowerCase();

              (data.sheets.appearance.tables.categoryDisplay.data[lang.code] || []).forEach(
                function (entry) {
                  if (
                    dataPath.modify
                      .itemNumbersToHash(entry.columnName)
                      .toLowerCase() !== normalizedComputedPath
                  ) {
                    return;
                  }

                  // When a label is provided, the value at render time is the
                  // translated label, so badge matching targets the label.
                  // When there is no label, the raw value passes through
                  // unchanged, so rawValue (which may contain wildcards) is
                  // used as the badge match pattern directly.
                  const badgeLabel = (entry.label || "").toString().trim();
                  const badgePattern = badgeLabel !== ""
                    ? badgeLabel
                    : (entry.rawValue || "").toString();
                  meta[computedDataPath].categories.push({
                    contains: badgePattern.toLowerCase(),
                    background: entry.backgroundColor,
                    text: entry.textColor,
                    border: entry.borderColor,
                  });
                }
              );
            }
          }

          if (dataType == "image" || dataType == "sound") {
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

    function compileDatabaseShortcodes(lang) {
      const BUILTIN_SHORTCODES = [
        { code: "gbif", name: "GBIF ({{author}}{{id}})", url: "https://www.gbif.org/occurrence/{{id}}" },
        { code: "gbif.s", name: "GBIF (Taxon {{author}}{{id}})", url: "https://www.gbif.org/species/{{id}}" },
        { code: "inat", name: "{{author}} (iNat {{id}})", url: "https://www.inaturalist.org/observations/{{id}}" },
        { code: "ebird", name: "eBird ({{author}}{{id}})", url: "https://ebird.org/checklist/{{id}}" },
        { code: "clml", name: "ML ({{author}}{{id}})", url: "https://macaulaylibrary.org/asset/{{id}}" },
        { code: "obse", name: "Observation.org ({{author}}{{id}})", url: "https://observation.org/observation/{{id}}" },
      ];

      const result = new Map(BUILTIN_SHORTCODES.map(s => [s.code, s]));
      const builtinCodes = new Set(BUILTIN_SHORTCODES.map(s => s.code));
      const codeRegex = /^[a-z]+(\.[a-z]+)?$/;
      const seenCodes = new Set(builtinCodes);

      const rows = data.sheets.content.tables.databaseShortcodes?.data?.[lang.code] ?? [];

      rows.forEach(function (row, idx) {
        const code = (row.code ?? "").trim();
        const label = (row.labelTemplate ?? "").trim();
        const url = (row.urlTemplate ?? "").trim();

        if (!codeRegex.test(code)) {
          Logger.error(tf("dm_shortcode_invalid_code", [idx + 1, code]));
          return;
        }
        if (!url.includes("{{id}}")) {
          Logger.error(tf("dm_shortcode_missing_id_in_url", [code]));
          return;
        }
        if (!label.includes("{{id}}")) {
          Logger.error(tf("dm_shortcode_missing_id_in_label", [code]));
          return;
        }
        if (seenCodes.has(code) && !builtinCodes.has(code)) {
          Logger.error(tf("dm_shortcode_duplicate", [code]));
          return;
        }
        if (builtinCodes.has(code)) {
          Logger.info(tf("dm_shortcode_overrides_builtin", [code]));
        }
        result.set(code, { code, name: label, url });
        seenCodes.add(code);
      });

      return [...result.values()];
    }
  }

  function loadData(table) {
    compiledChecklistCache = null; // Invalidate compiled checklist cache

    if (table == null) {
      Logger.error(t("problem_loading_data"));
      return null;
    }

    let allColumnInfos = getAllColumnInfos(
      nlDataStructure,
      data.common.languages.defaultLanguageCode
    );
    let allColumnNames = allColumnInfos.map(function (item) {
      return item.name;
    });

    // Backstop: ExcelBridge already catches and names empty individual sheets with a warning
    // This gives a hard critical error if none of the sheets has data
    if (table.length <= 1) {
      Logger.critical("The data sheet(s) contain no data rows.");
      return null;
    }

    const taxonColumnInfos = allColumnInfos.filter(i => i.dataType === "checklist-taxon");
    const occurrenceColIndex = taxonColumnInfos.findIndex(
      i => i.fullRow.taxonName.trim().toLowerCase() === OCCURRENCE_IDENTIFIER
    );
    if (occurrenceColIndex !== -1 && occurrenceColIndex !== taxonColumnInfos.length - 1) {
      Logger.error(
        tf("dm_occurrence_must_be_last_taxon", [
          taxonColumnInfos[occurrenceColIndex].name,
          taxonColumnInfos[taxonColumnInfos.length - 1].name,
        ])
      );
    }

    // The lowercase header name of the occurrence column (null when no occurrences).
    // Used per-row to decide whether the current row is a occurrence row.
    const occurrenceColumnName = occurrenceColIndex !== -1
      ? taxonColumnInfos[occurrenceColIndex].name  // already lowercased by getAllColumnInfos
      : null;

    // Root→belongsTo map built once from the default language CDD data.
    // belongsTo is structural (not translatable), so the default language suffices.
    const rootBelongsToMap = buildRootBelongsToMap(
      data.sheets.content.tables.customDataDefinition.data[data.common.languages.defaultLanguageCode]
    );

    // Check there are any taxa defined at all
    const taxaTableRows = data.sheets.content.tables.taxa.data[data.common.languages.defaultLanguageCode];
    if (!taxaTableRows || taxaTableRows.length === 0) { Logger.error(t("dm_no_taxa_defined")); return null; }

    // Sort raw checklist rows by taxa columns so the spreadsheet does not need
    // to be manually ordered. Uses a stable sort so rows sharing the same full
    // taxon path keep their original relative position.
    table = sortRawChecklistByTaxa(
      table,
      taxonColumnInfos,
      data.common.languages.defaultLanguageCode,
      data.sheets.content.tables.taxa.data[data.common.languages.defaultLanguageCode] || []
    );

    data.sheets.checklist.rawHeaders = table[0].map(h => (h || "").toString().toLowerCase());
    data.sheets.checklist.rawRows = table.slice(1);

    validateCDDColumnsAgainstHeaders(data);
    validateTaxaAgainstHeaders(data);  // -- every declared taxon column must appear in the data sheet

    data.sheets.checklist.data = {};
    data.common.allUsedDataPaths = {};

    //console.log("All used dataPaths created");

    data.common.languages.supportedLanguages.forEach(function (lang) {
      data.sheets.checklist.data[lang.code] = [];
      data.common.allUsedDataPaths[lang.code] = [];

      //console.log("All used dataPaths initialized for", lang.code)

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
          Logger.error(tf("dm_column_names_duplicate", [header]));
        }
      });
      // Create context object once per row
      const context = { headers, row: null, langCode: lang.code };

      for (let rowIndex = 1; rowIndex < table.length; rowIndex++) {
        const row = table[rowIndex];
        context.row = row; // Update context with the current row

        // Determine whether this row is a occurrence row by inspecting the raw
        // occurrence column cell.  Computed once per row so the forEach below
        // can use it without re-scanning.
        const isOccurrenceRow = occurrenceColumnName !== null && (function () {
          const idx = headers.indexOf(occurrenceColumnName);
          return idx !== -1 && row[idx] != null && row[idx].toString().trim() !== "";
        })();

        let rowObj = { t: [], d: {} };
        let doneWithTaxa = false;

        allColumnInfos.forEach(function (info) {
          let position = dataPath.analyse.position(allColumnNames, info.name);

          // For checklist-taxon, we need to process even if not a leaf
          // because taxon columns have .authority children but should still be read
          if (info.dataType === "checklist-taxon") {
            let taxon = loadDataByType(context, info.name, {
              ...info,
              dataType: "taxon",
            });

            let taxonIsEmpty =
              taxon == null ||
              (taxon?.name?.trim() == "" && taxon?.authority?.trim() == "");

            if (taxonIsEmpty) {
              doneWithTaxa = true;
            } else {
              if (!doneWithTaxa) {
                rowObj.t.push(taxon);
              } else {
                // Skip the check for taxon name "occurrence"
                if (info.fullRow.taxonName.trim().toLowerCase() == OCCURRENCE_IDENTIFIER) {
                  // Pad t with nulls so the occurrence lands at its correct positional index,
                  // preserving the positional contract that the rest of the codebase relies on.
                  const taxonColumnInfos = allColumnInfos.filter(
                    i => i.dataType === "checklist-taxon"
                  );
                  const occurrenceMetaIndex = taxonColumnInfos.indexOf(info);
                  while (rowObj.t.length < occurrenceMetaIndex) {
                    rowObj.t.push(null);
                  }
                  rowObj.t.push(taxon);
                }
                else {
                  Logger.error(
                    tf("dm_incomplete_taxa_info_row", [
                      (row._sourceSheet ? row._sourceSheet + " " : ""),
                      (row._sourceRow ?? rowIndex + 1),
                      info.name,
                    ]), "Unexpected taxon data"
                  );
                }
              }
            }
            return; // Skip the rest of the loop for taxon columns
          }

          // -- Cross-entity attribution check ----------------------------------
          // Only relevant when a occurrence column is declared; pure-taxon
          // datasets (occurrenceColumnName === null) are never checked.
          if (occurrenceColumnName !== null) {
            const resolvedBelongsTo = resolveBelongsTo(info.name, rootBelongsToMap);
            const actualEntity = isOccurrenceRow ? OCCURRENCE_IDENTIFIER : "taxon";

            if (resolvedBelongsTo === null) {
              // belongsTo not declared for this column - skip cross-entity check entirely
            } else if (resolvedBelongsTo !== actualEntity) {
              // Report once per root/simple column to avoid flooding the log
              // with one error per child path (origPub.author, origPub.year…).
              if ((position.isRoot || position.isSimpleItem) &&
                hasAnyDataForRootColumn(headers, row, info.name)) {

                console.log("Cross-entity check failed for row", rowIndex + 1, "column", info.name, "resolved belongsTo:", resolvedBelongsTo, "actual entity:", actualEntity);

                Logger.error(
                  tf("dm_wrong_belongs_to", [
                    (row._sourceSheet ? row._sourceSheet + " " : ""),
                    (row._sourceRow ?? rowIndex + 1),
                    info.name,
                    resolvedBelongsTo,
                    actualEntity,
                  ])
                  , "Wrong 'Belongs to' attribution");
              }
              // Skip loading - error already reported at root level above.
              if (position.isLeaf) return;
            }
          }
          // -- End cross-entity check ------------------------------------------

          if (!position.isLeaf) {
            return;
          }

          // ...existing code for non-taxon columns...
          includeTreefiedData(
            rowObj.d,
            context,
            dataPath.modify.pathToSegments(info.name),
            0,
            info,
            ""
          );
        });

        // Report rows that have neither taxon data nor an occurrence ID.
        // A completely blank spreadsheet row (all cells empty) is silently
        // ignored because such rows are commonly used as visual spacers.
        if (rowObj.t.length === 0 &&
            row.some(cell => cell != null && cell.toString().trim() !== "")) {
          Logger.error(
            tf("dm_row_no_taxa_no_occurrence", [(row._sourceRow ?? rowIndex + 1)])
          );
        }

        data.sheets.checklist.data[lang.code].push(rowObj);
      }
      const seenPaths = new Map(); // path string -> first row number

      // ensure all taxon tree paths are unique
      data.sheets.checklist.data[lang.code].forEach(function (rowObj, arrayIndex) {
        const pathKey = rowObj.t
          .filter(t => t !== null)
          .map(t => t.name)
          .join(" > ");

        if (pathKey === "") return; // skip empty rows

        const rowNumber = arrayIndex + 2; // +1 for 1-based index, +1 for the header row

        if (seenPaths.has(pathKey)) {
          Logger.error(
            tf("dm_duplicate_taxon_path", [
              pathKey,
              seenPaths.get(pathKey),
              rowNumber,
            ])
          );
        } else {
          seenPaths.set(pathKey, rowNumber);
        }
      });

      const localTaxaMeta = {};
      const taxaTableData = data.sheets.content.tables.taxa.data[lang.code] || [];

      let occurrenceMetaIndex = -1;

      taxaTableData.forEach(function (row) {
        if (row.columnName) {
          localTaxaMeta[row.columnName] = { name: row.taxonName };
          if (row.taxonName.trim().toLowerCase() === OCCURRENCE_IDENTIFIER) {
            occurrenceMetaIndex = Object.keys(localTaxaMeta).indexOf(row.columnName);
          }
        }
      });

      if (occurrenceMetaIndex !== -1) {
        const seenOccurrenceIds = new Map(); // occurrence name -> first row number

        data.sheets.checklist.data[lang.code].forEach(function (rowObj, arrayIndex) {
          const occurrenceEntry = rowObj.t[occurrenceMetaIndex];
          if (!occurrenceEntry || occurrenceEntry.name.trim() === "") return;

          const occurrenceName = occurrenceEntry.name.trim();
          const rowNumber = arrayIndex + 2; // +1 for 1-based index, +1 for the header row

          if (seenOccurrenceIds.has(occurrenceName)) {
            Logger.error(
              tf("dm_duplicate_occurrence_id", [
                occurrenceName,
                seenOccurrenceIds.get(occurrenceName),
                rowNumber,
              ])
            );
          } else {
            seenOccurrenceIds.set(occurrenceName, rowNumber);
          }
        });
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
                throw tf("dm_duplicate_segment", [currentSegment]);
              }
              let genericData = loadDataByType(
                context,
                countedComputedPath,
                info
              );
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
                    tf("dm_array_with_empty_cells_in_the_middle", [
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

    clearHelpersCache();
  }

  function checkMetaValidity() {
    // automatic check based on integrity data
    Object.keys(data.sheets).forEach(function (sheetKey) {
      let sheet = data.sheets[sheetKey];
      if (sheet.type == "meta") {
        Object.keys(sheet.tables).forEach(function (tableKey) {
          let table = sheet.tables[tableKey];
          const tableRequired = table.required !== false;

          data.common.languages.supportedLanguages.forEach(function (lang) {
            let tableData = table.data[lang.code];

            // null means the table could not be loaded at all
            if (tableData == null) {
              if (tableRequired) {
                Logger.critical(tf("dm_required_table_missing", [table.name]));
              }
              // optional missing table → already handled (empty []) by ExcelBridge; null is defensive
              return;
            }

            // Empty optional table → nothing to validate
            if (tableData.length === 0) return;

            tableData.forEach(function (dataRow) {
              Object.keys(table.columns).forEach(function (columnKey) {
                let entireColumn = tableData.map(function (row) {
                  return row[columnKey];
                });
                let column = table.columns[columnKey];
                let integrity = column.integrity;
                let value = dataRow[columnKey];

                // undefined means the column was not found in the sheet at all.
                // the downright missing column (no header) is already reported by ExcelBridge, this here checks only the content
                if (value === undefined) {
                  if (tableRequired) {
                    Logger.critical(
                      tf("dm_required_table_columns_missing", [table.name, column.name]) + (integrity.migration ? " " + integrity.migration : "") +
                      " " + t("dm_verify_doc")
                    );
                  }
                  // optional table with present-but-incomplete columns: already reported as error
                  return;
                }

                let isEmpty =
                  value === null ||
                  value.toString().trim() === "";

                if (!integrity.allowEmpty && isEmpty) {
                  Logger.error(
                    tf("dm_value_cannot_be_empty", [column.name, table.name]) + (integrity.migration ? " " + integrity.migration : "")
                  );
                  return;
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
                          tf("dm_incorrect_list", [
                            value, column.name, table.name,
                            integrity.listItems.map(item => item == "" ? "(space)" : "'" + item + "'").join(", "),
                          ]) + (integrity.migration ? " " + integrity.migration : "")
                        );
                      }
                      break;
                    case "tokenSet": {
                      const vocabulary = (integrity.tokenSetVocabulary || []).map(x => x.toLowerCase());
                      const rules = integrity.tokenSetRules || {};
                      const tokens = value.trim().toLowerCase().split(/\s*\|\s*/).filter(t => t !== "");

                      let tokenSetError = null;

                      if (tokens.length === 0) {
                        // handled by allowEmpty check above - should not reach here
                      } else if (rules.maxTokens && tokens.length > rules.maxTokens) {
                        tokenSetError = "Value '" + value + "' in column " + column.name + " (table " + table.name + ") has too many tokens (max " + rules.maxTokens + ").";
                      } else {
                        const unknownTokens = tokens.filter(t => !vocabulary.includes(t));
                        if (unknownTokens.length > 0) {
                          tokenSetError = "Value '" + value + "' in column " + column.name + " (table " + table.name + ") contains unknown token(s): " + unknownTokens.map(t => "'" + t + "'").join(", ") + ". Allowed: " + vocabulary.map(t => "'" + t + "'").join(", ") + ".";
                        } else if (tokens.length > 1 && rules.requiredIfMultiple) {
                          if (!tokens.includes(rules.requiredIfMultiple.toLowerCase())) {
                            tokenSetError = "Value '" + value + "' in column " + column.name + " (table " + table.name + "): when combining tokens, '" + rules.requiredIfMultiple + "' is required as one of them.";
                          }
                        }
                      }

                      if (tokenSetError) {
                        Logger.error(tokenSetError + (integrity.migration ? " " + integrity.migration : ""));
                      }
                      break;
                    }
                    case "dataTypeDef":
                      const dataTypeDefParts = value.split(" ").map(p => p.trim());
                      const dataTypeProvided = dataTypeDefParts[0];

                      if (allowedDataTypesIncludingList.indexOf(dataTypeProvided) < 0) {
                        Logger.error(
                          tf("dm_incorrect_datatype", [
                            dataTypeProvided, column.name, table.name, allowedDataTypesIncludingList.join(", ")
                          ]) + (integrity.migration ? " " + integrity.migration : "")
                        );
                      }

                      break;
                    case "columnName":
                      if (!dataPath.validate.isSimpleColumnName(value)) {
                        Logger.error(
                          tf("dm_incorrect_simple_column_name", [value, column.name, table.name])
                          + (integrity.migration ? " " + integrity.migration : "")
                        );
                      }
                      break;
                    case "cssColor":
                      let hexHslaRgbaColor = new RegExp(
                        "(#([0-9a-f]{3}){1,2}|(rgba|hsla)(d{1,3}%?(,s?d{1,3}%?){2},s?(1|0|0?.d+))|(rgb|hsl)(d{1,3}%?(,s?d{1,3}%?){2}))",
                        "i"
                      );
                      if (hexHslaRgbaColor.test(value) == false && cssColorNames.indexOf(value.toLowerCase()) < 0) {
                        Logger.error(
                          tf("dm_incorrect_hlsa", [value, column.name, table.name])
                          + (integrity.migration ? " " + integrity.migration : "")
                        );
                      }
                      break;
                    case "filename":
                      let ext = "";
                      if (value.indexOf(".") > 0) {
                        ext = value.substring(value.indexOf("."));
                      }
                      if (integrity.allowedExtensions.indexOf(ext.toLowerCase()) < 0) {
                        Logger.error(
                          tf("dm_incorrect_filename", [value, column.name, table.name, integrity.allowedExtensions.join(", ") + ")"])
                          + (integrity.migration ? " " + integrity.migration : "")
                        );
                      }
                      break;
                    case "url":
                      if (!isValidHttpUrl(value)) {
                        Logger.error(
                          tf("dm_incorrect_http", [value, column.name, table.name])
                          + (integrity.migration ? " " + integrity.migration : "")
                        );
                      }
                      break;
                    case "dataPath":
                      if (!dataPath.validate.isDataPath(value)) {
                        Logger.error(
                          tf("dm_incorrect_datapath", [value, column.name, table.name])
                          + (integrity.migration ? " " + integrity.migration : "")
                        );
                      }
                      break;
                    case "dataPathWithWildcard": {
                      const wildcardStripped = value.endsWith(".*") ? value.slice(0, -2) : value;
                      if (wildcardStripped.includes("*") || !dataPath.validate.isDataPath(wildcardStripped)) {
                        Logger.error(
                          tf("dm_incorrect_datapath", [value, column.name, table.name])
                          + (integrity.migration ? " " + integrity.migration : "")
                        );
                      }
                      break;
                    }
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
                          tf("dm_regex_failed", [value, column.name, table.name, integrity.regexExplanation, integrity.regex])
                          + (integrity.migration ? " " + integrity.migration : "")
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
                  const valueStr = value != null ? value.toString().toLowerCase() : "";

                  entireColumn.forEach(function (item) {
                    if (item == null) return; // guard: empty Excel cells arrive as null
                    if (item.toString().toLowerCase() == valueStr) {
                      if (value == null || value === "") {
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
                      tf("dm_incorrect_must_be_unique", [
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
    // Manual checks of logic - delegated to a standalone pure function.
    // Skip if a critical error was already logged: the data may be incomplete
    // enough to cause misleading secondary errors.
    //
    if (Logger.hasCritical()) return;
    runManualIntegrityChecks(data);
  }

  function postprocessMetadata() {
    // Change data sheets names if needed
    let dataSheetsNames = [];
    data.sheets.appearance.tables.customization.data[
      data.common.languages.defaultLanguageCode
    ].forEach(function (row) {
      if (row.item.toLowerCase().trim() == "data sheets names") {
        dataSheetsNames = row.value.split(",").map((s) => s.trim()).filter((s) => s !== "");
      }
      return false;
    });
    if (dataSheetsNames.length == 0) {
      dataSheetsNames = ["checklist"]; // default value
    }
    data.sheets.checklist.sheetsNames = dataSheetsNames;

    // set default values if needed
    //*
    Object.keys(data.sheets).forEach(function (sheetKey) {
      let sheet = data.sheets[sheetKey];
      if (sheet.type == "meta") {
        Object.keys(sheet.tables).forEach(function (tableKey) {
          let table = sheet.tables[tableKey];
          data.common.languages.supportedLanguages.forEach(function (lang) {
            const tableData = table.data[lang.code];
            if (!tableData || tableData.length === 0) return;
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
            const tableData = table.data[lang.code];
            if (!tableData || tableData.length === 0) return;
            tableData.forEach(function (dataRow) {
              Object.keys(table.columns).forEach(function (columnKey) {
                let column = table.columns[columnKey];
                let integrity = column.integrity;
                let value = dataRow[columnKey];

                if (columnKey == "columnName") {
                  dataRow[columnKey] = dataRow[columnKey].toLowerCase();
                }
                if (tableKey == "customDataDefinition" && columnKey == "template") {
                  dataRow[columnKey] = normalizeTemplateDataPaths(dataRow[columnKey]);
                }
              });
            });
          });
        });
      }
    });

    data.common.languages.supportedLanguages.forEach(function (lang) {
      checkCustomDataDefinitionDataPaths(data, lang.code, dataPath);
    });

    // Expand trailing ".*" wildcard rows in categoryDisplay and searchOrder into
    // concrete child column entries, writing results back into the live data
    // tables.  After this point no wildcard column names remain anywhere in the
    // data structures, so all downstream code (compileDataMeta, helpers.js,
    // render code) is completely unaware of the feature.
    data.common.languages.supportedLanguages.forEach(function (lang) {
      const cddRows =
        data.sheets.content.tables.customDataDefinition.data[lang.code] || [];

      data.sheets.appearance.tables.categoryDisplay.data[lang.code] =
        expandWildcardRows(
          data.sheets.appearance.tables.categoryDisplay.data[lang.code] || [],
          cddRows,
          data.sheets.appearance.tables.categoryDisplay.name
        );

      data.sheets.appearance.tables.searchOrder.data[lang.code] =
        expandWildcardRows(
          data.sheets.appearance.tables.searchOrder.data[lang.code] || [],
          cddRows,
          data.sheets.appearance.tables.searchOrder.name
        );
    });
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

      if (Logger.hasErrors()) {
        return;
      }

      const rawChecklist = typeof extractor.getRawChecklistData === "function" ? extractor.getRawChecklistData() : null;

      if (rawChecklist == null) {
        Logger.critical(
          "Could not load data sheet. Make sure the data sheet exists and its name matches the 'Data sheets names' setting."
        );
        console.error("DataManager.loadData: extractor.getRawChecklistData() returned null or undefined.");
        return;
      }

      if (!Logger.hasErrors()) {
        loadData(rawChecklist);
      }
    },

    getCompiledChecklist() {
      let jsonData = compileChecklist(this.checkAssetsSize);

      const defaultVersion = jsonData.general?.defaultVersion;
      const firstVersion = defaultVersion && jsonData.versions[defaultVersion]
        ? jsonData.versions[defaultVersion]
        : jsonData.versions[Object.keys(jsonData.versions)[0]];

      return jsonData;
    },

    getDwcArchive() {
      return compiledChecklistCache?._dwcArchive ?? null;
    },

    /**
     * Returns true if the spreadsheet contains a non-empty DwC archive table.
     * Safe to call immediately after loadData() - does NOT require
     * getCompiledChecklist() to have been called first.
     * Used by ManageView for early DwC UI detection.
     */
    hasDwcTable() {
      const defaultLangCode = data.common.languages.defaultLanguageCode;
      const rows = data.sheets.content.tables.dwcArchive?.data?.[defaultLangCode];
      return Array.isArray(rows) && rows.length > 0;
    },

    /**
     * Returns true if compileDwcArchiveAsync() has already been called and
     * produced a result (possibly null blobs if there were errors).
     */
    isDwcCompiled() {
      return compiledChecklistCache != null &&
        Object.prototype.hasOwnProperty.call(compiledChecklistCache, "_dwcArchive");
    },

    async compileDwcArchiveAsync() {
      const defaultLangCode = data.common.languages.defaultLanguageCode;
      const dwcTableRows = data.sheets.content.tables.dwcArchive?.data?.[defaultLangCode];
      if (!dwcTableRows || dwcTableRows.length === 0) {
        return; // DwC table absent or empty - nothing to compile
      }

      // Build a per-CDD Handlebars template cache so templates are compiled once.
      const templateCache = new Map();
      const cddRows = data.sheets.content.tables.customDataDefinition.data[defaultLangCode];

      /**
       * Resolve the CDD row for a column name, with "#" array-item pattern fallback.
       * Mirrors the lookup strategy used by the old compiler.
       */
      function resolveCddDef(colName) {
        const lo = colName.toLowerCase();
        const exact = cddRows?.find(r => (r.columnName || "").toLowerCase() === lo);
        if (exact) return exact;
        const hashLo = lo.replace(/\d+$/, "#");
        if (hashLo !== lo) {
          const hashMatch = cddRows?.find(r => (r.columnName || "").toLowerCase() === hashLo);
          if (hashMatch) return hashMatch;
        }
        const dotHashLo = lo.replace(/(\.[^.]+?)\d+$/, "$1#");
        if (dotHashLo !== lo && dotHashLo !== hashLo) {
          const dotHashMatch = cddRows?.find(r => (r.columnName || "").toLowerCase() === dotHashLo);
          if (dotHashMatch) return dotHashMatch;
        }
        return undefined;
      }

      function getCompiledTemplate(cddDef) {
        if (!cddDef) return null;
        const cacheKey = (cddDef.columnName || "").toLowerCase();
        if (templateCache.has(cacheKey)) return templateCache.get(cacheKey);
        const templateStr = cddDef.template?.trim();
        let compiled = null;
        if (templateStr) {
          try { compiled = Handlebars.compile(normalizeTemplateDataPaths(templateStr)); }
          catch (ex) {
            Logger.warning(
              `DwC Archive: Failed to compile template for "${cddDef.columnName}": ${ex.message}`,
              "DwC Archive"
            );
          }
        }
        templateCache.set(cacheKey, compiled);
        return compiled;
      }

      /**
       * mediaUrlResolver - resolves a raw media source string to a fully qualified URL.
       * Lives here in the DataManager closure because it requires window.location context
       * and access to the Handlebars template defined in the CDD for each column.
       *
       * @param {string} rawSource  - Raw .source property from the compiled data object
       * @param {string} columnName - Actual column name (e.g. "fieldPhotos1")
       * @returns {string}
       */
      const mediaUrlResolver = (rawSource, columnName) => {
        const cddDef = resolveCddDef(columnName);
        const compiledTemplate = getCompiledTemplate(cddDef);
        const uiContext = {
          compiledTemplate,
          dataPath: columnName,
          meta: { template: cddDef?.template?.trim() || "" },
          originalData: {},    // not needed for source resolution
          taxon: { name: "", authority: "" },
        };

        const relativeUrl = customTypeHelpers.processSourceBothVariants(rawSource, uiContext).fullSource;

        return absoluteUsercontent(relativeUrl);
      };

      const result = await compileDwcArchive({
        dwcTableRows,
        compiledChecklist: compiledChecklistCache,
        taxaColumnDefs: data.sheets.content.tables.taxa.data[defaultLangCode],
        customizationData: data.sheets.appearance.tables.customization.data[defaultLangCode],
        cddRows,
        defaultLangCode,
        mediaUrlResolver,
      });

      compiledChecklistCache._dwcArchive = result;
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

function getTextContentFromFile(url, runSpecificCache) {
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

      if (result.content.startsWith("<!DOCTYPE html")) {
        // Soft 404: server returned an HTML error page instead of the requested file
        Logger.error(`The file at ${url} returned an HTML page instead of the expected content (possible soft 404).`);
        result.content = "";
        result.responseStatus = 0;
      }
    }
  } catch (error) {
    // Network-level failure; responseStatus remains 0 and the caller will log a contextual error
  }

  runSpecificCache[url] = result;

  return result;
}

function fetchFDirectiveContent(directive, allowedExtensions, runSpecificCache, dataPathCtx, rowCtx) {
  let filePath = directive.substring(2).trim();

  if (filePath.includes("\\")) {
    Logger.error(t("dm_fdirective_backslash", [filePath]));
    return null;
  }
  if (filePath.startsWith("/") || filePath.startsWith("./")) {
    Logger.error(t("dm_fdirective_absolute_or_dot_slash", [filePath]));
    return null;
  }
  if (filePath.includes("..")) {
    Logger.error(t("dm_fdirective_directory_traversals", [filePath]));
    return null;
  }

  const extPattern = allowedExtensions.map(e => `\\.${e}`).join("|");
  if (!new RegExp(`^([a-zA-Z0-9_\\-~.]+\\/)*[a-zA-Z0-9_\\-~]+(${extPattern})?$`).test(filePath)) {
    Logger.error(t("dm_fdirective_invalid_path", [filePath]));
    return null;
  }

  let fileUrl = absoluteUsercontent(relativeToUsercontent(filePath));
  if (!allowedExtensions.some(e => fileUrl.toLowerCase().endsWith(`.${e}`))) fileUrl += "." + allowedExtensions[0];

  if (!isValidHttpUrl(fileUrl) || !isSameOriginAsCurrent(fileUrl)) {
    Logger.error(t("dm_fdirective_invalid_url", [directive, fileUrl]));
    return null;
  }

  const fetched = getTextContentFromFile(fileUrl, runSpecificCache);
  if (fetched.responseStatus !== 200) {
    Logger.error(tf("dm_markdown_file_not_found", [fileUrl, dataPathCtx ?? "-", rowCtx ?? "-"]));
    return null;
  }
  return fetched.content;
}

function processFDirective(data, runSpecificCache, dataPath, rowNumber, assetsCollector, allowedExtensions) {
  if (typeof data !== "string" || !data.startsWith("F:")) return data;

  const unsafeExts = allowedExtensions || [];

  //cleanup exts to allow only safe ones: ["md", "markdown", "txt", "bib", "xml"]
  const exts = unsafeExts.filter(e => ["md", "markdown", "txt", "bib", "xml"].includes(e.toLowerCase()));
  const content = fetchFDirectiveContent(data, exts, runSpecificCache, dataPath, rowNumber);

  if (content === null) return null;

  const filePath = data.substring(2).trim();
  const lastSlashIndex = filePath.lastIndexOf('/');
  const mdFileDirectory = lastSlashIndex >= 0 ? filePath.substring(0, lastSlashIndex + 1) : '';

  const rewrittenImagePaths = [];
  const processedContent = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, altText, imageUrl) => {
    if (/^https?:\/\//i.test(imageUrl) || imageUrl.startsWith('/') || imageUrl.startsWith('./')) return match;
    const rewrittenPath = mdFileDirectory + imageUrl;
    rewrittenImagePaths.push(rewrittenPath);
    return `![${altText}](${rewrittenPath})`;
  });

  if (rewrittenImagePaths.length > 0) {
    const targetAssets = assetsCollector || assetsFromFDirectives;
    rewrittenImagePaths.forEach(function (asset) {
      const resolvedAsset = relativeToUsercontent(asset);
      if (!targetAssets.includes(resolvedAsset)) targetAssets.push(resolvedAsset);
    });
  }
  return processedContent;
}

/**
 * Stably sorts raw checklist rows by their taxon columns (in declaration order),
 * so the display layer receives rows grouped by shared ancestry regardless of
 * how the source spreadsheet was ordered.
 *
 * Rules per level:
 *  - "alphabet" (default/empty): sort alphabetically by taxon name (case-insensitive).
 *  - "as is": sort by first-occurrence position in the *original* row order,
 *    so whatever sequence the user laid out in the spreadsheet is respected while
 *    still guaranteeing that all rows with the same value at this level are
 *    contiguous (required by the view layer).
 *  - An empty taxon cell sorts BEFORE a filled one (empty = "taxon ends here").
 *  - Rows whose entire compared taxon path is equal retain their original order
 *    (JavaScript's Array.sort is stable since ES2019 / all modern engines).
 *
 * @param {any[][]}  table            - Full raw table including header row at index 0.
 * @param {Object[]} taxonColumnInfos - Taxon column infos in declaration order,
 *                                     each with a `.name` property.
 * @param {string}   defaultLangCode  - Used for language-suffixed column fallback.
 * @param {Object[]} taxaTableData    - Rows from data.sheets.content.tables.taxa.data[langCode],
 *                                     each with `.columnName` and `.orderBy`.
 * @returns {any[][]} New table array with the same header row and sorted data rows.
 */
function sortRawChecklistByTaxa(table, taxonColumnInfos, defaultLangCode, taxaTableData) {
  if (table.length <= 2 || taxonColumnInfos.length === 0) {
    return table; // Nothing meaningful to sort
  }

  const headers = table[0].map(h => h.toString().toLowerCase());

  /**
   * Resolve the header index that holds the taxon *name* for a given column.
   * Mirrors the lookup strategy in ReaderTaxon.readData:
   *   1. explicit "<base>.name" column (optionally language-suffixed)
   *   2. base column itself (optionally language-suffixed)
   * Returns -1 when no matching column is found.
   */
  function resolveTaxonNameIndex(baseName) {
    const base = baseName.toLowerCase();

    // 1. Explicit .name sub-column
    let idx = headers.indexOf(base + ".name");
    if (idx >= 0) return idx;
    idx = headers.indexOf(base + ".name:" + defaultLangCode);
    if (idx >= 0) return idx;

    // 2. Base column (pipe-separated "Name|Authority" or name-only)
    idx = headers.indexOf(base);
    if (idx >= 0) return idx;
    idx = headers.indexOf(base + ":" + defaultLangCode);
    if (idx >= 0) return idx;

    return -1;
  }

  /**
   * Extract the taxon name string from a raw cell value.
   * Handles the pipe-separated "Name|Authority" single-cell format.
   */
  function extractTaxonName(cellValue) {
    if (cellValue === null || cellValue === undefined) return "";
    const s = cellValue.toString().trim();
    const pipeIdx = s.indexOf("|");
    return pipeIdx >= 0 ? s.substring(0, pipeIdx).trim() : s;
  }

  // Build a lookup: columnName (lowercase) → orderBy value
  const orderByMap = {};
  (taxaTableData || []).forEach(function (row) {
    if (row.columnName) {
      orderByMap[row.columnName.toLowerCase()] = (row.orderBy || "").trim().toLowerCase();
    }
  });

  // Pre-compute header indices for all taxon columns once
  const taxonHeaderIndices = taxonColumnInfos.map(info =>
    resolveTaxonNameIndex(info.name)
  );

  const dataRows = table.slice(1);

  // For each "as is" level, build a Map<normalised-name → first-occurrence-rank>
  // by scanning the *original* row order.
  const asIsRankMaps = taxonColumnInfos.map(function (info, i) {
    const orderBy = orderByMap[info.name.toLowerCase()] || "alphabet";
    if (orderBy !== "as is") return null; // not needed for alphabet levels

    const colIdx = taxonHeaderIndices[i];
    if (colIdx < 0) return null;

    const rankMap = new Map(); // name (lowercased) → first-occurrence index
    dataRows.forEach(function (row) {
      const name = extractTaxonName(row[colIdx]).toLowerCase();
      if (name !== "" && !rankMap.has(name)) {
        rankMap.set(name, rankMap.size);
      }
    });
    return rankMap;
  });

  dataRows.sort((a, b) => {
    for (let i = 0; i < taxonHeaderIndices.length; i++) {
      const colIdx = taxonHeaderIndices[i];
      if (colIdx < 0) continue; // column not found in this sheet – skip

      const aName = extractTaxonName(a[colIdx]);
      const bName = extractTaxonName(b[colIdx]);

      // Empty values sort before non-empty
      if (aName === "" && bName !== "") return -1;
      if (aName !== "" && bName === "") return 1;
      if (aName === "" && bName === "") continue; // both empty – check next column

      const orderBy = orderByMap[taxonColumnInfos[i].name.toLowerCase()] || "alphabet";

      if (orderBy === "as is") {
        const rankMap = asIsRankMaps[i];
        const aRank = rankMap ? (rankMap.get(aName.toLowerCase()) ?? Infinity) : Infinity;
        const bRank = rankMap ? (rankMap.get(bName.toLowerCase()) ?? Infinity) : Infinity;
        if (aRank !== bRank) return aRank - bRank;
      } else {
        // Default: alphabetical
        const cmp = aName.localeCompare(bName, undefined, { sensitivity: "base" });
        if (cmp !== 0) return cmp;
      }
    }
    return 0; // identical taxon path → preserve original order (stable sort)
  });

  return [table[0], ...dataRows];
}

// =============================================================================
// PURE MODULE-SCOPE INTEGRITY FUNCTIONS
// (no closure over DataManager state - receive everything they need as args)
// =============================================================================

/**
 * Checks that every intermediate data-path segment is declared in the
 * customDataDefinition table.  E.g. if "info.redlist.code" is defined,
 * both "info" and "info.redlist" must also appear.
 *
 * Must be called AFTER postprocessMetadata has lowercased columnNames.
 *
 * @param {object} data       – nlDataStructure (mutated in place by the pipeline)
 * @param {string} langCode   – language code to inspect
 * @param {object} dataPathLib – the dataPath utility object
 */
function checkCustomDataDefinitionDataPaths(data, langCode, dataPathLib) {
  const table = data.sheets.content.tables.customDataDefinition.data[langCode];
  if (!table || table.length === 0) return;

  const allDataPaths = table.map((row) =>
    dataPathLib.modify.itemNumbersToHash(row.columnName).toLowerCase()
  );

  table.forEach(function (row) {
    const current = dataPathLib.modify
      .itemNumbersToHash(row.columnName)
      .toLowerCase();

    if (!dataPathLib.validate.isDataPath(current)) return;

    const split = dataPathLib.modify.pathToSegments(current);

    for (let index = 0; index < split.length; index++) {
      const cumulative = split
        .slice(0, index + 1)
        .join(".")
        .replaceAll(".#", "#");

      if (!allDataPaths.includes(cumulative)) {
        Logger.error(
          tf("dm_hidden_missing_index", [
            cumulative,
            data.sheets.content.tables.customDataDefinition.name,
          ])
        );
      }
    }
  });
}

// A dedicated validation pass, run once after checklist loading,
// not inside compileDataMeta which is per-language and allUsedDataPaths-gated

export function validateCDDColumnsAgainstHeaders(data) {
  const headers = data.sheets.checklist.rawHeaders;
  if (!headers || headers.length === 0) return;

  const langCode = data.common.languages.defaultLanguageCode;
  const cddRows = data.sheets.content.tables.customDataDefinition.data[langCode] || [];

  const allCDDColumnNames = cddRows.map(r => (r.columnName || "").toLowerCase().trim());

  cddRows.forEach(function (row) {
    const colName = (row.columnName || "").toLowerCase().trim();
    if (!colName) return;

    const position = dataPath.analyse.position(allCDDColumnNames, colName);
    if (!position.isLeaf) return;

    // --- NEW: resolve the header name(s) to check for array-leaf columns ---
    // CDD uses "habitat#" to declare an array, but the actual spreadsheet header
    // is either the bare root ("habitat", for pipe-separated notation) or
    // numbered columns ("habitat1", "habitat2", …).  Neither contains "#".
    // Strip the trailing "#" and accept the root name OR any "root<N>" variant.
    const isArrayLeaf = colName.endsWith("#");
    const effectiveColName = isArrayLeaf ? colName.slice(0, -1) : colName;

    const dataTypeBase = (row.dataType || "").trim().toLowerCase().split(/\s+/)[0];

    // For array-leaf columns, presence is satisfied by:
    //   a) the bare root header ("habitat") - pipe-separated notation, OR
    //   b) any numbered child header ("habitat1", "habitat2", …) - explicit columns
    const present = isArrayLeaf
      ? headers.some(h =>
        h === effectiveColName ||                                    // pipe-separated root
        h.startsWith(effectiveColName + ":") ||                     // language-suffixed root: "habitat:en"
        (h.startsWith(effectiveColName) &&
          /^\d/.test(h.slice(effectiveColName.length)))              // numbered child: "photo1", "photo1.source", etc.
      )
      : isColumnPresentInHeaders(dataTypeBase, effectiveColName, headers);

    if (!present) {
      Logger.critical(tf("dm_cdd_missing_column", [row.columnName, row.dataType]), "Missing column");
    }
  });
}

/**
 * Validates that every taxon column declared in the Taxa definition table is
 * actually present in the data sheet.  A taxon column may appear as:
 *   – "<colName>"       (pipe-separated "Name|Authority" or name-only)
 *   – "<colName>.name"  (explicit name sub-column)
 *
 * Taxa headers are always bare - they are never language-suffixed.
 *
 * Logs a critical error for every absent taxon column because a missing taxon
 * column makes it impossible to build the taxonomic tree.
 *
 * Must be called AFTER data.sheets.checklist.rawHeaders has been populated.
 *
 * @param {object} data – nlDataStructure
 */
function validateTaxaAgainstHeaders(data) {
  const headers = data.sheets.checklist.rawHeaders;
  if (!headers || headers.length === 0) return;

  const langCode = data.common.languages.defaultLanguageCode;
  const taxaRows = data.sheets.content.tables.taxa.data[langCode] || [];

  taxaRows.forEach(function (row) {
    const colName = (row.columnName || "").toLowerCase().trim();
    if (!colName) return;

    // Taxon column headers are always bare - never language-suffixed.
    // The column may be represented as a single "Name|Authority" cell (colName)
    // or split into explicit sub-columns (colName.name / colName.authority).
    // Presence of either the base column or the .name sub-column is sufficient.
    const candidateHeaders = [colName, colName + ".name"];
    const found = candidateHeaders.some(candidate => headers.indexOf(candidate) >= 0);

    if (!found) {
      Logger.critical(
        "Taxon column \"" + (row.columnName || colName) + "\" is declared in the Taxa " +
        "table but was not found in the data sheet. " +
        "Expected at least one of: " +
        candidateHeaders.map(h => "\"" + h + "\"").join(" or ") + "."
      );
    }
  });
}

/**
 * Runs all manual integrity checks that go beyond what can be inferred from
 * the `integrity` props in nlDataStructure.  Pure function: reads `data` and
 * calls Logger / i18n helpers; does not mutate `data`.
 *
 * Checks performed:
 *  1. mapRegionsLegend cross-row rules (uniqueness, column refs, anchor format,
 *     min-2-anchors per group, A5 center consistency, appendedLegend on gradient)
 *  2. Language UI fallback coverage
 *  3. Cross-table column-name uniqueness (Maps table excluded)
 *  4. Color-theme hue range (0–360)
 *  5. Month names count / duplicate validation
 *  6. customDataDefinition positional rules (placement/template/dataType/list/hidden)
 *
 * @param {object} data – nlDataStructure (read-only intent; hidden-column reset
 *                        is the only mutation and is intentional side-effect)
 */
function runManualIntegrityChecks(data) {

  // -- 1. mapRegionsLegend cross-row validation ------------------------------
  data.common.languages.supportedLanguages.forEach(function (lang) {
    const rows = data.sheets.appearance.tables.mapRegionsLegend.data[lang.code];
    if (!rows || rows.length === 0) return;

    const tableName = data.sheets.appearance.tables.mapRegionsLegend.name;

    const mapregionsPaths = new Set(
      (data.sheets.content.tables.customDataDefinition.data[lang.code] || [])
        .filter((r) => (r.dataType || "").trim().toLowerCase() === "mapregions")
        .map((r) => (r.columnName || "").trim().toLowerCase())
    );

    // 1a. Compound-key uniqueness: (columnName + status) must be unique per lang
    const seenPairs = new Map();
    rows.forEach(function (row, idx) {
      const colName = (row.columnName || "").toString().trim().toLowerCase();
      const status = (row.status || "").toString().trim();
      const pairKey = colName + "|" + status;
      if (seenPairs.has(pairKey)) {
        Logger.error(
          tf("dm_mapregions_duplicate_pair", [
            tableName, colName || "(empty)", status || "(empty)",
            seenPairs.get(pairKey), idx + 1,
          ])
        );
      } else {
        seenPairs.set(pairKey, idx + 1);
      }
    });

    // 1b. Non-empty columnName must reference a declared mapregions column
    rows.forEach(function (row, idx) {
      const colName = (row.columnName || "").toString().trim().toLowerCase();
      if (colName === "") return;
      if (!mapregionsPaths.has(colName)) {
        Logger.error(tf("dm_mapregions_unknown_column", [tableName, idx + 1, colName]));
      }
    });

    // 1c. gradient/stepped rows: status must match anchor notation
    const anchorRegex =
      /^-?(\d+(\.\d+)?)(%)?(p)?(s)?$|^-?(\d+(\.\d+)?)([%s]?)c(-?\d+(\.\d+)?)$/i;

    rows.forEach(function (row, idx) {
      const legendType = (row.legendType || "").toString().trim().toLowerCase();
      if (legendType !== "gradient" && legendType !== "stepped") return;
      const status = (row.status ?? "").toString().trim();
      if (status === "") {
        Logger.error(
          tf("dm_mapregions_empty_anchor", [tableName, idx + 1, legendType]),
          "Empty status code"
        );
        return;
      }
      if (!anchorRegex.test(status)) {
        Logger.error(
          tf("dm_mapregions_invalid_anchor", [tableName, idx + 1, status, legendType]),
          "Invalid status code"
        );
      }
    });

    // 1d. Each (columnName, legendType) group needs ≥ 2 anchor rows
    const anchorGroupCounts = new Map();
    rows.forEach(function (row) {
      const legendType = (row.legendType || "").toString().trim().toLowerCase();
      if (legendType !== "gradient" && legendType !== "stepped") return;
      const colName = (row.columnName || "").toString().trim().toLowerCase();
      const groupKey = colName + "|" + legendType;
      anchorGroupCounts.set(groupKey, (anchorGroupCounts.get(groupKey) || 0) + 1);
    });
    anchorGroupCounts.forEach(function (count, groupKey) {
      if (count < 2) {
        const [colName, legendType] = groupKey.split("|");
        Logger.warning(
          colName
            ? tf("dm_mapregions_single_anchor", [tableName, legendType, colName])
            : tf("dm_mapregions_single_anchor_global", [tableName, legendType])
        );
      }
    });

    // 1e. A5 center consistency: all rows in a (columnName, legendType) group
    //     that use the cNNN suffix must share the same center value
    const A5_REGEX = /^-?(\d+(\.\d+)?)([%s]?)c(-?\d+(\.\d+)?)$/i;
    const a5CenterByGroup = new Map();
    rows.forEach(function (row) {
      const legendType = (row.legendType || "").toString().trim().toLowerCase();
      if (legendType !== "gradient" && legendType !== "stepped") return;
      const colName = (row.columnName || "").toString().trim().toLowerCase();
      const status = (row.status || "").toString().trim();
      const m5 = A5_REGEX.exec(status);
      if (!m5) return;
      const center = m5[4];
      const groupKey = colName + "|" + legendType;
      if (!a5CenterByGroup.has(groupKey)) a5CenterByGroup.set(groupKey, new Set());
      a5CenterByGroup.get(groupKey).add(center);
    });
    a5CenterByGroup.forEach(function (centerSet, groupKey) {
      if (centerSet.size > 1) {
        const [colName, legendType] = groupKey.split("|");
        Logger.error(
          colName
            ? tf("dm_mapregions_a5_center_mismatch", [tableName, legendType, colName, [...centerSet].join(", ")])
            : tf("dm_mapregions_a5_center_mismatch_global", [tableName, legendType, [...centerSet].join(", ")])
        );
      }
    });

    // 1f. appendedLegend on gradient rows is silently ignored at runtime → warn
    rows.forEach(function (row, idx) {
      const legendType = (row.legendType || "").toString().trim().toLowerCase();
      if (legendType !== "gradient") return;
      const appended = (row.appendedLegend || "").toString().trim();
      if (appended !== "") {
        Logger.warning(
          tf("dm_mapregions_appended_legend_ignored", [tableName, idx + 1, appended, legendType]),
          "Appended legend for gradient legend types"
        );
      }
    });
  });

  // -- 2. Language UI fallback coverage -------------------------------------
  data.common.languages.supportedLanguages.forEach(function (lang) {
    if (
      i18nMetadata.getSupportedLanguageCodes().indexOf(lang.code) < 0 &&
      i18nMetadata.getSupportedLanguageCodes().indexOf(lang.fallbackLanguage) < 0
    ) {
      Logger.warning(
        tf("dm_specify_fallback_language", [
          lang.name,
          "Supported languages",
          data.sheets.appearance.name,
          i18nMetadata.getSupportedLanguageCodes().join(", "),
        ])
      );
    }
  });

  // -- 3. Cross-table column-name uniqueness (Maps table exempted) -----------
  const uniqueColumnNames = {};
  getAllColumnInfos(nlDataStructure, data.common.languages.defaultLanguageCode)
    .forEach(function (item) {
      const key = item.name.toLowerCase();
      if (
        !Object.prototype.hasOwnProperty.call(uniqueColumnNames, key) ||
        item.table === uniqueColumnNames[key].table
      ) {
        uniqueColumnNames[key] = item;
      } else {
        if (item.table === "Maps" || uniqueColumnNames[key].table === "Maps") return;
        Logger.error(
          tf("dm_column_name_duplicate", [item.name, item.table, uniqueColumnNames[key].table])
        );
      }
    });

  // -- 4 & 5. Hue range + month names (per language) ------------------------
  data.common.languages.supportedLanguages.forEach(function (lang) {
    const customizationData = data.sheets.appearance.tables.customization.data[lang.code];
    if (!customizationData) return;

    // 4. Month names
    const monthNamesValidation = validateConfiguredMonthNames(
      getItem(customizationData, CUSTOMIZATION_ITEMS.MONTH_NAMES, lang.code)
    );
    if (monthNamesValidation.hasValue) {
      if (monthNamesValidation.wrongCount) {
        Logger.error(
          tf("dm_month_names_wrong_count", [lang.code])
        );
      }
      if (monthNamesValidation.duplicates.length > 0) {
        Logger.error(
          tf("dm_month_names_duplicates", [lang.code, monthNamesValidation.duplicates.join(", ")])
        );
      }
    }

    // 5. Color theme hue must be 0–360 when provided
    const hueRow = customizationData.find((row) => row.item === CUSTOMIZATION_ITEMS.COLOR_THEME_HUE);
    const hueString = hueRow ? hueRow.value : "";
    if (hueString.toString().trim() !== "") {
      const hue = parseInt(hueString);
      if (isNaN(hue) || hue < 0 || hue > 360) {
        Logger.error(
          tf("dm_hue_value", [data.sheets.appearance.tables.customization.name])
        );
      }
    }
  });

  // -- 6. customDataDefinition positional / structural rules -----------------
  data.common.languages.supportedLanguages.forEach(function (lang) {
    const table = data.sheets.content.tables.customDataDefinition.data[lang.code];
    if (!table || table.length === 0) return;

    const cddColumns = data.sheets.content.tables.customDataDefinition.columns;

    const allColumnNames = table
      .map((row) => row.columnName?.toLowerCase())
      .filter((v) => v !== undefined);

    for (const row of table) {
      const columnName = row.columnName;
      if (columnName === undefined) continue; // already reported upstream

      const colPosition = dataPath.analyse.position(allColumnNames, columnName.toLowerCase());

      // 6a. Child columns may declare Placement, but it must match the root row's value.
      if (!(colPosition.isSimpleItem || colPosition.isRoot) && row.placement !== "") {
        const rootSegment6a = columnName.split(/[\.\#]/)[0].toLowerCase();
        const rootRow6a = table.find(r => (r.columnName || "").toLowerCase().trim() === rootSegment6a);
        const rootPlacement6a = rootRow6a ? (rootRow6a.placement || "").trim() : "";
        if (row.placement.trim() !== rootPlacement6a) {
          Logger.error(
            "Column \"" + columnName + "\": Placement \"" + row.placement +
            "\" does not match the root column \"" + rootSegment6a +
            "\" which has Placement \"" + (rootPlacement6a || "(empty)") +
            "\". All rows in a column group must declare the same Placement value."
          );
        }
      }

      // 6b. Only leaf columns may carry a template
      if (row.template !== "" && !colPosition.isLeaf) {
        Logger.error(tf("dm_wrong_template", [columnName]));
      }

      // 6c. "category" dataType only on leaf columns
      if (row.dataType.toLowerCase() === "category" && !colPosition.isLeaf) {
        Logger.error(tf("dm_wrong_category", [columnName, cddColumns.dataType.name]));
      }

      // 6d. "list" dataType only on columns with children
      if (row.dataType.toLowerCase().startsWith("list") && !colPosition.hasChildren) {
        Logger.error(tf("dm_wrong_separator", [columnName, cddColumns.dataType.name]));
      }

      // 6e. "details" placement only allows certain dataType types
      if (row.placement && row.placement.split("|").map((x) => x.trim()).includes("details")) {
        const alloweddataType = ["", "text", "list", "markdown", "image", "sound", "map", "mapregions"];
        const basedataType = (row.dataType || "").trim().toLowerCase().split(/\s+/)[0];
        if (!alloweddataType.includes(basedataType)) {
          Logger.error(
            tf("dm_details_dataType_invalid", [columnName, row.dataType, row.placement])
          );
        }
      }

      // 6f. Hidden columns must not carry other display properties
      if (row.hidden === "yes") {
        Object.keys(row).forEach(function (columnKey) {
          if (
            columnKey === "columnName" ||
            columnKey === "hidden" ||
            columnKey === "searchCategoryTitle" // allowed on hidden columns
          ) return;
          if (row[columnKey].toString().trim() !== "") {
            Logger.info(
              tf("dm_hidden_column_name", [columnName, cddColumns[columnKey].name]), "Hidden column"
            );
            row[columnKey] = ""; // intentional: reset to avoid misleading downstream
          }
        });
      }

      // 6g. searchCategoryTitle set on a dataType that has no filter plugin
      const basedataType6g = (row.dataType || "").trim().toLowerCase().split(/\s+/)[0];
      const searchCategoryTitle6g = (row.searchCategoryTitle || "").trim();
      if (
        basedataType6g !== "" &&
        basedataType6g !== "list" &&
        searchCategoryTitle6g !== ""
      ) {
        const customType6g = dataCustomTypes[basedataType6g];
        if (customType6g && customType6g.filterPlugin === null) {
          Logger.error(
            tf("dm_cdd_no_filter_plugin", [columnName, searchCategoryTitle6g, basedataType6g])
          );
        }
      }

      // 6h. "Belongs to" value must be one of the recognised keywords
      const belongsToRaw = (row.belongsTo || "").trim().toLowerCase();
      if (belongsToRaw !== "" && belongsToRaw !== "taxon" && belongsToRaw !== OCCURRENCE_IDENTIFIER) {
        const migrationHint = cddColumns.belongsTo.integrity?.migration
          ? " " + cddColumns.belongsTo.integrity.migration
          : "";
        Logger.error(
          "Column \"" + columnName + "\": invalid \"Belongs to\" value \"" + row.belongsTo +
          "\". Allowed values are \"taxon\", \"occurrence\", or empty (defaults to \"taxon\")." +
          migrationHint
        );
        row.belongsTo = ""; // reset to avoid misleading downstream, mirrors 6f pattern
      }

      // 6i. Child columns may declare "Belongs to", but it must match the root row's value.
      if (belongsToRaw !== "" && !(colPosition.isSimpleItem || colPosition.isRoot)) {
        const rootSegment6i = getRootDataPath(columnName.toLowerCase());
        const rootRow6i = table.find(r => (r.columnName || "").toLowerCase().trim() === rootSegment6i);
        const rootBelongsTo6i = rootRow6i ? (rootRow6i.belongsTo || "").trim().toLowerCase() : "";
        if (belongsToRaw !== rootBelongsTo6i) {
          Logger.error(
            "Column \"" + columnName + "\": \"Belongs to\" value \"" + row.belongsTo +
            "\" does not match the root column \"" + rootSegment6i +
            "\" which has \"Belongs to\" = \"" + (rootBelongsTo6i || "(empty)") +
            "\". All rows in a column group must declare the same \"Belongs to\" value."
          );
          row.belongsTo = ""; // reset to avoid misleading downstream
        }
      }
    }
  });

  // -- 7. categoryDisplay integrity ------------------------------------------
  // Every row must have a rawValue - it is the universal matcher. Warn and
  // skip rows that have none so they don't silently match everything.
  data.common.languages.supportedLanguages.forEach(function (lang) {
    const rows = data.sheets.appearance.tables.categoryDisplay.data[lang.code];
    if (!rows || rows.length === 0) return;

    const tableName = data.sheets.appearance.tables.categoryDisplay.name;

    rows.forEach(function (row, idx) {
      if ((row.rawValue || "").toString().trim() === "") {
        Logger.warning(
          "In table \"" + tableName + "\", row " + (idx + 1) +
          " for column \"" + (row.columnName || "") +
          "\" has an empty \"Raw value\". Every row must have a Raw value " +
          "to match against; this row will be ignored."
        );
      }
    });
  });
}

function normalizeTemplateDataPaths(template) {
  if (!template || typeof template !== "string") return template;

  //   Alt 1 (group 1): quoted string - consume and echo unchanged
  //                    double-quoted: "..."  handles \" escapes
  //                    single-quoted: '...'  handles \' escapes
  //
  //   Alt 2 (group 2): data path - \bdata\. followed by one or more of:
  //                    [a-zA-Z0-9_.#]  covers dot/hash/digit notation
  //                    \[[^\]]*\]      covers bracket notation data.[My Key]
  //
  // Alternation order is the safety net: a quoted string is consumed whole
  // before the engine ever tries to match a data path inside it.
  return template.replace(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\bdata\.(?:[a-zA-Z0-9_.#]|\[[^\]]*\])+)/g,
    (match, quotedLiteral, dataPath) => {
      if (quotedLiteral !== undefined) return quotedLiteral; // rule 1: hands off
      return dataPath.toLowerCase();                         // rule 2: normalise
    }
  );
}

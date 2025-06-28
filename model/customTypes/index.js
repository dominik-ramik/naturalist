import { Logger } from "../../components/Logger.js";

const helpers = {
  dataCodesCache: new Map(),
  processPossibleDataCode: function (
    currentDataPath,
    value,
    codes,
    langCode
  ) {
    let columnNameMatches = (d) =>
      d.columnName.toLowerCase() ==
      dataPath.modify.itemNumbersToHash(currentDataPath).toLowerCase();

    const key = currentDataPath + "|" + value + "|" + langCode;

    if (!dataCodesCache.has(key)) {
      let dataCodesFound = codes[langCode].find(
        (d) => columnNameMatches(d) && d.code == value
      );
      if (dataCodesFound) {
        value = dataCodesFound.replacement;
      } else if (codes[langCode].find((d) => columnNameMatches(d))) {
        Logger.warning(
          "Code '" +
            value +
            "' found in column '" +
            currentDataPath +
            "' but no correspondence found in sheet 'nl_appearance' in table 'Data codes'"
        );
      }

      dataCodesCache.set(key, value);
    }

    return dataCodesCache.get(key);
  },
};

// Main function
export function loadDataByType({
  headers,
  row,
  computedPath,
  info,
  langCode,
  overrideValue,
  data,
}) {
  let stringValue = null;

  if (overrideValue !== undefined) {
    stringValue = overrideValue;
  } else {
    stringValue = readSimpleData(headers, row, computedPath, langCode, data);
  }

  switch (info.formatting) {
    case "text":
      if (stringValue == null) {
        let template = "";
        if (
          info.table == data.sheets.content.tables.customDataDefinition.name
        ) {
          let columnMeta = data.sheets.content.tables.customDataDefinition.data[
            langCode
          ].find((row) => row.columnName === computedPath);
          template = columnMeta ? columnMeta.template : "";
        } else if (info.table == data.sheets.content.tables.maps.name) {
          let columnMeta = data.sheets.content.tables.maps.data[langCode].find(
            (row) => row.columnName === computedPath
          );
          template = columnMeta ? columnMeta.source : "";
        } else if (info.table == data.sheets.content.tables.media.name) {
          let columnMeta = data.sheets.content.tables.media.data[langCode].find(
            (row) => row.columnName === computedPath
          );
          template = columnMeta ? columnMeta.linkBase : "";
        }
        let valueRegex = new RegExp("{{\\s*value\\s*}}", "i");
        if (valueRegex.test(template)) {
          Logger.warning(
            `Defined column not present: ${computedPath}, ${info.table}, ${data.sheets.content.name}`
          );
        }
        return "";
      }
      if (stringValue.toString().length > 0) {
        stringValue = processPossibleDataCode(
          computedPath,
          stringValue,
          data.sheets.appearance.tables.dataCodes.data,
          langCode
        );
        let matchingMetaRow =
          data.sheets.content.tables.customDataDefinition.data[langCode].find(
            (row) => row.columnName.toLowerCase() === computedPath.toLowerCase()
          );
        let expectedType = "text";
        if (matchingMetaRow != null) {
          expectedType = matchingMetaRow.formatting;
        }
        stringValue = DOMPurify.sanitize(stringValue);
        stringValue = stringValue.toString().trim();
        stringValue = stringValue.replace(/\r\n/, "\\n");
        stringValue = stringValue.replace(/[\r\n]/, "\\n");
      }
      break;
    case "number":
      let sv = readSimpleData(headers, row, computedPath, langCode, data);
      if (sv == null || (typeof sv == "string" && sv.trim() == "")) {
        return null;
      }
      let number = 0;
      if (Number.isInteger(sv)) {
        number = parseInt(sv);
      } else {
        number = parseFloat(sv);
      }
      if (Number.isNaN(number)) {
        Logger.error(`Value not a number: ${sv}, ${computedPath}`);
      }
      return number;
    case "date":
      let date = stringValue;
      let dateFormat = data.common.getItem(
        log,
        data.sheets.appearance.tables.customization.data,
        "Date format",
        langCode,
        "YYYY-MM-DD"
      );
      date = dayjs(stringValue).format(dateFormat);
      return date;
    case "badge":
      let retval = processPossibleDataCode(
        computedPath,
        stringValue,
        data.sheets.appearance.tables.dataCodes.data,
        langCode,
        log
      );
      return retval;
    case "markdown":
      return readSimpleData(headers, row, computedPath, langCode, data);
    // Other cases (map regions, taxon, image, media) should be handled by caller or extended here as needed
    default:
      Logger.error(`Unknown formatting: ${info.formatting}`);
      break;
  }
  return "";
}

///////////

function readMapRegions(headers, row, computedPath, langCode) {
  const concernedColumns = headers.filter((h) =>
    h.toLowerCase().startsWith(computedPath.toLowerCase() + ".")
  );

  let mapRegions = "";
  let resultObject = {};

  if (concernedColumns.length == 0) {
    //mapRegions are already inline format
    mapRegions = readSimpleData(headers, row, computedPath, langCode);
    resultObject = parseInlineMapRegions(mapRegions, langCode);
  } else {
    //column-per-region format
    resultObject = parseColumnMapRegions(
      concernedColumns,
      headers,
      row,
      computedPath,
      langCode
    );
  }

  // Validate region codes
  let knownRegionCodes = data.sheets.appearance.tables.mapRegionsNames.data[
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
function parseColumnMapRegions(
  concernedColumns,
  headers,
  row,
  computedPath,
  langCode
) {
  const result = {};

  concernedColumns.forEach((columnName) => {
    const data = readSimpleData(headers, row, columnName, langCode);

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
    //try to recover the structure from | separated structure
    let plainSplit = _plain.split("|");
    if (plainSplit.length != 2) {
      source = _plain;
      title = "";
    } else {
      source = plainSplit[0];
      title = plainSplit[1];
    }
  }

  if (source === null || (source !== null && title === null)) {
    Logger.error(
      _tf("dm_image_column_names", [
        path,
        path,
        path + ".source",
        path + ".title",
      ])
    );
  }

  return { source: source, title: title };
}

/**
 * Unified function to read data from CSV headers/row with optional structured property parsing
 *
 * @param {string[]} headers - Array of column headers from CSV
 * @param {string[]} row - Array of values for current row
 * @param {string} path - Base column name to read from
 * @param {Object} options - Configuration options
 * @param {string} [options.langCode="en"] - Language code for column resolution
 * @param {string} [options.separator="|"] - Separator for parsing plain text into structured data
 * @param {Function} [options.log=console.log] - Logging function for errors
 * @param {Function} [options.errorMessageTemplate=null] - Template function for error messages
 * @param {Object} [options.data] - Data context with language info
 * @param {string[]|null} expectedProps - Array of expected property names for structured data (leave null/empty for simple value mode)
 *
 * @returns {string|Object} Simple string value if expectedProps is null/empty, otherwise object with properties
 *
 * @description
 * This function handles two modes:
 * 1. Simple mode (expectedProps = null/empty): Returns plain column value with language fallback
 * 2. Structured mode (expectedProps provided): Returns object with properties, trying:
 *    - Individual columns like "path.prop:lang"
 *    - Fallback to parsing "path" column using separator
 *
 * Language resolution tries columns in order:
 * - "columnName:langCode"
 * - "columnName:defaultLanguageCode"
 * - "columnName"
 *
 * @example
 * // Simple usage - returns string
 * const title = readDataFromPath(headers, row, "title", { langCode: "en" });
 *
 * @example
 * // Structured usage - returns object
 * const media = readDataFromPath(headers, row, "image",
 *   { langCode: "en", separator: "|" },
 *   ["source", "title"]
 * );
 * // Returns: { source: "photo.jpg", title: "My Photo" }
 * // Works with columns: "image.source", "image.title" OR "image" containing "photo.jpg|My Photo"
 */
function readDataFromPath(
  headers,
  row,
  path,
  options = {},
  expectedProps = null
) {
  const {
    langCode = "en",
    separator = "|",
    errorMessageTemplate = null,
    data,
  } = options;

  // Helper function for reading a single column with language fallback
  // Tries language-specific columns first, then falls back to plain column name
  function readSingleColumn(columnName) {
    const possibleColumns = [
      `${columnName}:${langCode}`,
      `${columnName}:${data.common.languages.defaultLanguageCode}`,
      columnName,
    ];

    for (const col of possibleColumns) {
      const colIndex = headers.indexOf(col);
      if (colIndex >= 0) {
        return row[colIndex];
      }
    }
    return null;
  }

  // Simple mode: If no props specified, return plain column value
  if (!expectedProps || expectedProps.length === 0) {
    return readSingleColumn(path);
  }

  // Structured mode: Build object with expected properties
  let _plain = readSingleColumn(path); // Get plain column value as fallback
  let structuredValues = {};
  let hasAnyStructuredValue = false;

  // Try to read each expected property from individual columns (e.g., "path.source", "path.title")
  expectedProps.forEach((prop) => {
    let value = readSingleColumn(`${path}.${prop}`);
    structuredValues[prop] = value;
    if (value !== null) {
      hasAnyStructuredValue = true;
    }
  });

  // Fallback: If no structured columns found, try parsing plain value with separator
  if (!hasAnyStructuredValue && _plain) {
    let plainSplit = _plain.split(separator);

    if (plainSplit.length === expectedProps.length) {
      // Perfect match: each part maps to a property
      expectedProps.forEach((prop, index) => {
        structuredValues[prop] = plainSplit[index].trim();
      });
    } else if (plainSplit.length === 1) {
      // Single value: assign to first property, empty strings for rest
      structuredValues[expectedProps[0]] = _plain;
      expectedProps.slice(1).forEach((prop) => {
        structuredValues[prop] = "";
      });
    } else {
      // Partial match: map what we can, empty strings for missing parts
      expectedProps.forEach((prop, index) => {
        structuredValues[prop] =
          index < plainSplit.length ? plainSplit[index].trim() : "";
      });
    }
  }

  // Validation: Check if we have required data and log errors if needed
  let hasValidData = structuredValues[expectedProps[0]] !== null;
  let hasMissingRequiredData =
    hasValidData &&
    expectedProps.slice(1).some((prop) => structuredValues[prop] === null);

  if (!hasValidData || hasMissingRequiredData) {
    if (errorMessageTemplate) {
      // Generate column name suggestions for error message
      let columnNames = [
        path,
        path,
        ...expectedProps.map((prop) => `${path}.${prop}`),
      ];
      Logger.error(errorMessageTemplate(columnNames));
    }
  }

  return structuredValues;
}

function readTaxon(headers, row, path, langCode) {
  let _plain = readSimpleData(headers, row, path, langCode);
  let name = readSimpleData(headers, row, path + ".name", langCode);
  let authority = readSimpleData(headers, row, path + ".authority", langCode);

  if (name === null && authority === null) {
    let plainSplit = _plain.split("|");

    if (plainSplit.length != 2) {
      name = _plain;
      authority = "";
    } else {
      name = plainSplit[0];
      authority = plainSplit[1];
    }
  }

  if (name === null || (name !== null && authority === null)) {
    Logger.error(
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

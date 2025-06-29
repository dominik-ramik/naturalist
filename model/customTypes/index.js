import { Logger } from "../../components/Logger.js";
import { nlDataStructure } from "../DataManagerData.js";
import { dataPath } from "../DataPath.js";

const data = nlDataStructure;

// Helper function to build readers object indexed by dataType
function buildReaders(...readerObjects) {
  const readers = {};
  readerObjects.forEach((reader) => {
    readers[reader.dataType] = reader;
  });
  return readers;
}

// Import and build all readers that are to be supported
import { readerText } from "./ReaderText.js";
import { readerMarkdown } from "./ReaderMarkdown.js";
import { readerTaxon } from "./ReaderTaxon.js";
import { readerNumber } from "./ReaderNumber.js";
import { readerBadge } from "./ReaderBadge.js";
const readers = buildReaders(
  readerText,
  readerMarkdown,
  readerTaxon,
  readerNumber,
  readerBadge
);

// Verify readers
function verifyReaders() {
  const dataTypes = new Set();
  const duplicateDataTypes = [];

  Object.entries(readers).forEach(([dataType, reader], index) => {
    // Check for required properties and their types
    if (
      !reader.hasOwnProperty("dataType") ||
      typeof reader.dataType !== "string"
    ) {
      console.error(
        `Reader at index ${index} is missing required 'dataType' property or it's not a string`
      );
    }

    if (
      !reader.hasOwnProperty("readData") ||
      typeof reader.readData !== "function"
    ) {
      console.error(
        `Reader at index ${index} is missing required 'readData' property or it's not a function`
      );
    }

    if (
      !reader.hasOwnProperty("dataToUI") ||
      typeof reader.dataToUI !== "function"
    ) {
      console.error(
        `Reader at index ${index} is missing required 'dataToUI' property or it's not a function`
      );
    }

    // Check if object key matches reader's dataType
    if (dataType !== reader.dataType) {
      console.error(
        `Reader key '${dataType}' doesn't match reader's dataType '${reader.dataType}'`
      );
    }

    // Check for duplicate dataTypes (though this is less likely with object structure)
    if (reader.dataType && typeof reader.dataType === "string") {
      if (dataTypes.has(reader.dataType)) {
        duplicateDataTypes.push(reader.dataType);
      } else {
        dataTypes.add(reader.dataType);
      }
    }
  });

  // Report duplicate dataTypes
  if (duplicateDataTypes.length > 0) {
    console.error(
      `Duplicate dataType(s) found in readers: ${duplicateDataTypes.join(", ")}`
    );
  }
}

// Run verification
verifyReaders();

export const helpers = {
  dataCodes: data.sheets.appearance.tables.dataCodes.data,
  dataCodesCache: new Map(),
  // Pre-computed lookup maps for faster data code resolution
  dataCodesLookup: new Map(), // langCode -> Map(columnName -> Map(code -> replacement))
  // Initialize lookup maps once during startup
  initializeDataCodesLookup: function () {
    this.dataCodesLookup.clear();

    Object.keys(this.dataCodes).forEach((langCode) => {
      const langMap = new Map();
      this.dataCodesLookup.set(langCode, langMap);

      this.dataCodes[langCode].forEach((dataCodeRow) => {
        const normalizedColumnName = dataPath.modify
          .itemNumbersToHash(dataCodeRow.columnName)
          .toLowerCase();

        if (!langMap.has(normalizedColumnName)) {
          langMap.set(normalizedColumnName, new Map());
        }

        const codeMap = langMap.get(normalizedColumnName);
        codeMap.set(dataCodeRow.code, dataCodeRow.replacement);
      });
    });
  },

  processPossibleDataCode: function (currentDataPath, value, langCode) {
    // Early return for empty/null values to avoid unnecessary processing
    if (!value || value === "") return value;

    const key = currentDataPath + "|" + value + "|" + langCode;

    if (this.dataCodesCache.has(key)) {
      return this.dataCodesCache.get(key);
    }

    // Use pre-computed lookup instead of array.find()
    const normalizedPath = dataPath.modify
      .itemNumbersToHash(currentDataPath)
      .toLowerCase();
    const langMap = this.dataCodesLookup.get(langCode);

    if (langMap && langMap.has(normalizedPath)) {
      const codeMap = langMap.get(normalizedPath);
      if (codeMap.has(value)) {
        value = codeMap.get(value);
      } else {
        // Only warn if we have codes for this column but not this specific value
        Logger.warning(
          "Code '" +
            value +
            "' found in column '" +
            currentDataPath +
            "' but no correspondence found in sheet 'nl_appearance' in table 'Data codes'"
        );
      }
    }

    this.dataCodesCache.set(key, value);
    return value;
  },
};

// Initialize the lookup maps when the module loads
helpers.initializeDataCodesLookup();

// Cache management function
export function clearDataCodesCache() {
  helpers.dataCodesCache.clear();
  // Re-initialize lookup maps when cache is cleared
  helpers.initializeDataCodesLookup();
}

/**
 * Load and process data from spreadsheet row based on column type and formatting rules
 *
 * @param {Object} context - Data context containing headers, row, and language info
 * @param {string[]} context.headers - Array of column headers from spreadsheet
 * @param {string[]} context.row - Array of values for current row
 * @param {string} context.langCode - Language code for localized column resolution
 * @param {string} computedPath - Column path/name to read data from
 * @param {Object} info - Column metadata containing formatting type and table info
 *
 * @returns {string|number|Object|null} Processed data value based on formatting type
 */
export function loadDataByType(context, computedPath, info) {
  // Try to find a matching reader for the formatting type
  const matchingReader = readers[info.formatting];

  if (matchingReader) {
    // Call the reader's readData function and return the result
    let dataRead = matchingReader.readData(context, computedPath);

    if (typeof dataRead === "string") {
      dataRead = helpers.processPossibleDataCode(
        computedPath,
        dataRead,
        context.langCode
      );
    }

    return dataRead;
  } else {
    // No matching reader found, log error with available types
    const availableFormattings = Object.keys(readers).join(", ");
    //TODO: change to Logger.error
    Logger.warning(
      `Unknown formatting: ${info.formatting}. Available formattings: ${availableFormattings}`
    );
    return null;
  }
}

/**
 * Unified function to read data from spreadsheet headers/row with optional structured property parsing
 *
 * @param {Object} context - Data context containing headers, row, and language info
 * @param {string[]} context.headers - Array of column headers from spreadsheet
 * @param {string[]} context.row - Array of values for current row
 * @param {string} context.langCode - Language code for column resolution
 * @param {string} path - Base column name to read from
 * @param {Object} options - Configuration options
 * @param {string} [options.separator="|"] - Separator for parsing plain text into structured data
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
export function readDataFromPath(
  context,
  path,
  options = {},
  expectedProps = null
) {
  const { headers, row, langCode } = context;
  const { errorMessageTemplate = null } = options;

  const separator = "|"; // Default separator for structured data parsing

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
        const cellValue = row[colIndex];
        // Early termination if cell value is empty or just whitespace
        if (
          cellValue === null ||
          cellValue === undefined ||
          String(cellValue).trim() === ""
        ) {
          return null;
        }
        return cellValue;
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

  if (!hasAnyStructuredValue && (_plain === null || _plain === undefined)) {
    return null; // Return null if plain value is not available
  }

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

  hasMissingRequiredData = false;

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

import { Logger } from "../../components/Logger.js";
import { setReporter } from "./reporter.js";

// Hook the reporter to Logger once, before any readData calls are made.
// This is the only place inside customTypes/ that couples to Logger directly;
// all plugin files use the report() abstraction from reporter.js.
setReporter((level, msg, groupTitle) => Logger[level](msg, groupTitle));

// Helper function to build readers object indexed by dataType
function buildReaders(...readerObjects) {
  const readers = {};
  readerObjects.forEach((reader) => {
    readers[reader.dataType] = reader;
  });
  return readers;
}

// Import and build all readers that are to be supported
import { helpers } from "./helpers.js";
import { customTypeText } from "./CustomTypeText.js";
import { customTypeMarkdown } from "./CustomTypeMarkdown.js";
import { customTypeTaxon } from "./CustomTypeTaxon.js";
import { customTypeNumber } from "./CustomTypeNumber.js";
import { customTypeDate } from "./CustomTypeDate.js";
import { customTypeCategory } from "./CustomTypeCategory.js";
import { customTypeImage } from "./CustomTypeImage.js";
import { customTypeMapregions } from "./CustomTypeMapregions.js";
import { customTypeSound } from "./CustomTypeSound.js";
import { customTypeMap } from "./CustomTypeMap.js";
import { customTypeMonths } from "./CustomTypeMonths.js";
import { customTypeGeopoint } from "./CustomTypeGeopoint.js";
import { customTypeInterval } from "./CustomTypeInterval.js";
import { dataPath } from "../DataPath.js";

const dataCustomTypes = buildReaders(
  customTypeText,
  customTypeMarkdown,
  customTypeTaxon,
  customTypeNumber,
  customTypeDate,
  customTypeCategory,
  customTypeImage,
  customTypeMapregions,
  customTypeSound,
  customTypeMap,
  customTypeMonths,
  customTypeGeopoint,
  customTypeInterval
);

export const allowedDataTypesIncludingList = [
  "list",
  ...Object.keys(dataCustomTypes)
];

// Export dataCustomTypes for use in UI rendering
export { dataCustomTypes };

// Verify readers
function verifyReaders() {
  const dataTypes = new Set();
  const duplicateDataTypes = [];

  Object.entries(dataCustomTypes).forEach(([dataType, reader], index) => {
    //try getting the reader dataType property and use it instead of index, fall back to index if not available to provide more context in error messages
    const readerDataType = reader.dataType || `index ${index}`;


    // Check for required properties and their types
    if (
      !reader.hasOwnProperty("dataType") ||
      typeof reader.dataType !== "string"
    ) {
      console.error(
        `CustomType at ${readerDataType} is missing required 'dataType' property or it's not a string`
      );
    }
    if (
      !reader.hasOwnProperty("expectedColumns") ||
      typeof reader.expectedColumns !== "function"
    ) {
      console.error(
        `CustomType at ${readerDataType} is missing required 'expectedColumns' property or it's not a function`
      );
    }

    if (
      !reader.hasOwnProperty("filterPlugin") ||
      (typeof reader.filterPlugin !== "object" && reader.filterPlugin !== null)
    ) {
      console.error(
        `CustomType at ${readerDataType} is missing required 'filterPlugin' property or it's not an object or null`
      );
    }

    if (
      !reader.hasOwnProperty("readData") ||
      typeof reader.readData !== "function"
    ) {
      console.error(
        `CustomType at ${readerDataType} is missing required 'readData' property or it's not a function`
      );
    }

    if (
      !reader.hasOwnProperty("render") ||
      typeof reader.render !== "function"
    ) {
      console.error(
        `CustomType at ${readerDataType} is missing required 'render' property or it's not a function`
      );
    }

    if (
      !reader.hasOwnProperty("toDwC") ||
      typeof reader.toDwC !== "function"
    ) {
      console.error(
        `CustomType at ${readerDataType} is missing required 'toDwC' property or it's not a function`
      );
    }

    // Check if object key matches reader's dataType
    if (dataType !== reader.dataType) {
      console.error(
        `CustomType key '${dataType}' doesn't match CustomType's dataType '${reader.dataType}'`
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

  // Additional check for getSearchableText method
  Object.entries(dataCustomTypes).forEach(([dataType, reader]) => {
    if (!reader.hasOwnProperty("getSearchableText") || typeof reader.getSearchableText !== "function") {
      console.error(`CustomType '${dataType}' is missing 'getSearchableText' method - search may not work properly`);
    }
  });
}

// Run verification
verifyReaders();

/**
 * Returns true if at least one of the type's expected columns is present
 * in the checklist headers for the given base path.
 *
 * @param {string}   dataType - The dataType type string from CDD
 * @param {string}   basePath   - The column name as declared in CDD (lowercased)
 * @param {string[]} headers    - Lowercased checklist sheet headers
 * @returns {boolean}
 */
export function isColumnPresentInHeaders(dataType, basePath, headers) {
  const reader = dataCustomTypes[dataType];

  // Normalise headers once: replace digit runs with # to match CDD notation
  const normalisedHeaders = headers.map(h => dataPath.modify.itemNumbersToHash(h));

  const candidates = (reader && typeof reader.expectedColumns === "function")
    ? reader.expectedColumns(basePath)
    : [basePath, basePath + "."];  // fallback: bare column or any dotted child

  // Also normalise candidates for the same reason (though CDD paths already use #)
  return candidates.some(col => {
    const normCol = dataPath.modify.itemNumbersToHash(col);
    return normalisedHeaders.some(h =>
      h === normCol ||
      h.startsWith(normCol + ".") ||
      h.startsWith(normCol + ":")); // language-suffixed variant: "col:en"
  });
}

// Cache management function
export function clearHelpersCache() {
  helpers.clearCaches();
}

/**
 * Get searchable text for a data value using the appropriate reader
 * @param {any} data - The data value
 * @param {string} dataType - The dataType type (reader dataType)
 * @param {Object} uiContext - UI context for the reader
 * @returns {string[]} Array of searchable strings
 */
export function getSearchableTextByType(data, dataType, uiContext) {
  const reader = dataCustomTypes[dataType];
  if (!reader || !reader.getSearchableText) return [];
  return reader.getSearchableText(data, uiContext);
}

/**
 * Load and process data from spreadsheet row based on column type and formatting rules
 *
 * @param {Object} context - Data context containing headers, row, and language info
 * @param {string[]} context.headers - Array of column headers from spreadsheet
 * @param {string[]} context.row - Array of values for current row
 * @param {string} context.langCode - Language code for localized column resolution
 * @param {string} computedPath - Column path/name to read data from
 * @param {Object} info - Column metadata containing dataType type and table info
 *
 * @returns {string|number|Object|null} Processed data value based on dataType type
 */
export function loadDataByType(context, computedPath, info) {
  // Try to find a matching reader for the dataType type
  const matchingReader = dataCustomTypes[info.dataType];

  if (matchingReader) {
    // Call the reader's readData function and return the result
    let dataRead = matchingReader.readData(context, computedPath);

    return dataRead;
  } else {
    // No matching reader found, log error with available types
    const availabledataTypes = Object.keys(dataCustomTypes).join(", ");
    Logger.error(
      `Unknown data type: ${info.dataType}. Available data types: ${availabledataTypes}`
    );

    if (import.meta.env.DEV) {
      console.error(
        `Unknown data type: ${info.dataType}. Available data types: ${availabledataTypes}. Check the reader definitions in src/model/customTypes/index.js and ensure the data type is correct and imported.`
      );
    }

    return null;
  }
}

export function getAvailableDataTypeNames() {
  return Object.keys(dataCustomTypes).map((key) => dataCustomTypes[key].dataType);
}
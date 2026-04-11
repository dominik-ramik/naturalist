import { Logger } from "../../components/Logger.js";

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

// Export dataCustomTypes for use in UI rendering
export { dataCustomTypes };

// Verify readers
function verifyReaders() {
  const dataTypes = new Set();
  const duplicateDataTypes = [];

  Object.entries(dataCustomTypes).forEach(([dataType, reader], index) => {
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
      !reader.hasOwnProperty("render") ||
      typeof reader.render !== "function"
    ) {
      console.error(
        `Reader at index ${index} is missing required 'render' property or it's not a function`
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

  // Additional check for getSearchableText method
  Object.entries(dataCustomTypes).forEach(([dataType, reader]) => {
    if (!reader.hasOwnProperty("getSearchableText") || typeof reader.getSearchableText !== "function") {
      console.error(`Reader '${dataType}' is missing 'getSearchableText' method - search may not work properly`);
    }
  });
}

// Run verification
verifyReaders();

// Cache management function
export function clearDataCodesCache() {
  helpers.dataCodesCache.clear();
}

/**
 * Get searchable text for a data value using the appropriate reader
 * @param {any} data - The data value
 * @param {string} formatting - The formatting type (reader dataType)
 * @param {Object} uiContext - UI context for the reader
 * @returns {string[]} Array of searchable strings
 */
export function getSearchableTextByType(data, formatting, uiContext) {
  const reader = dataCustomTypes[formatting];
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
 * @param {Object} info - Column metadata containing formatting type and table info
 *
 * @returns {string|number|Object|null} Processed data value based on formatting type
 */
export function loadDataByType(context, computedPath, info) {
  // Try to find a matching reader for the formatting type
  const matchingReader = dataCustomTypes[info.formatting];

  if (matchingReader) {
    // Call the reader's readData function and return the result
    let dataRead = matchingReader.readData(context, computedPath);

    return dataRead;
  } else {
    // No matching reader found, log error with available types
    const availableFormattings = Object.keys(dataCustomTypes).join(", ");
    Logger.error(
      `Unknown formatting: ${info.formatting}. Available formattings: ${availableFormattings}`
    );

    if (import.meta.env.DEV) {
      console.error(
        `Unknown formatting: ${info.formatting}. Available formattings: ${availableFormattings}. Check the reader definitions in src/model/customTypes/index.js and ensure the formatting type is correct and imported.`
      );
    }

    return null;
  }
}
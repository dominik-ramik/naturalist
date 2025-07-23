import { Logger } from "../../components/Logger.js";
import { nlDataStructure } from "../DataManagerData.js";


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
import { helpers } from "./helpers.js";
import { readerImage } from "./ReaderImage.js";
import { readerMapRegions } from "./ReaderMapRegions.js";
const dataReaders = buildReaders(
  readerText,
  readerMarkdown,
  readerTaxon,
  readerNumber,
  readerBadge,
  readerImage,
  readerMapRegions
);

// Export dataReaders for use in UI rendering
export { dataReaders };

// Verify readers
function verifyReaders() {
  const dataTypes = new Set();
  const duplicateDataTypes = [];

  Object.entries(dataReaders).forEach(([dataType, reader], index) => {
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

// Cache management function
export function clearDataCodesCache() {
  helpers.dataCodesCache.clear();
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
  const matchingReader = dataReaders[info.formatting];

  if (matchingReader) {
    // Call the reader's readData function and return the result
    let dataRead = matchingReader.readData(context, computedPath);

    // Remove the old data code processing - now handled in readSingleColumn
    return dataRead;
  } else {
    // No matching reader found, log error with available types
    const availableFormattings = Object.keys(dataReaders).join(", ");
    //TODO: change to Logger.error
    Logger.warning(
      `Unknown formatting: ${info.formatting}. Available formattings: ${availableFormattings}`
    );
    return null;
  }
}
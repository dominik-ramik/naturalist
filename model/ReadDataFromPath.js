import { helpers } from "./customTypes/helpers.js";
import { nlDataStructure } from "./DataManagerData.js";
import { dataPath } from "./DataPath.js";
import { Logger } from "../components/Logger.js";
import { _tf } from "./I18n.js";

const data = nlDataStructure;

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
  dataType,
  expectedProps = null
) {
  const { headers, row, langCode } = context;

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
        let cellValue = row[colIndex];
        // Early termination if cell value is empty or just whitespace
        if (
          cellValue === null ||
          cellValue === undefined ||
          String(cellValue).trim() === ""
        ) {
          return null;
        }

        // Process data codes for all leaf values
        if (typeof cellValue === "string") {
          // Normalize the column name to match data codes format (convert numbers to #)
          const normalizedColumnName =
            dataPath.modify.itemNumbersToHash(columnName);
          cellValue = helpers.processPossibleDataCode(
            normalizedColumnName,
            cellValue,
            langCode
          );
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

  /*
  let hasMissingRequiredData =
    hasValidData &&
    expectedProps.slice(1).some((prop) => structuredValues[prop] === null);
*/

  if (!hasValidData) {

    // Generate column name suggestions for error message
    let columnNames = [
      ...expectedProps.map((prop) => `${path}.${prop}`),
    ];

    Logger.error(
      _tf("dm_generic_column_names", [
        dataType,
        path,
        columnNames.join(", "),
        path + "." + columnNames[0]
      ])
    );
  }

  return structuredValues;
}

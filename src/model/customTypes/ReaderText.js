import m from "mithril";
import { helpers } from "./helpers.js";

export let readerText = {
  dataType: "text",
  readData: function (context, computedPath) {
    const { headers, row, langCode } = context;
    let columnIndex = headers.indexOf(computedPath.toLowerCase());

    if (columnIndex < 0) {
      columnIndex = headers.indexOf(
        computedPath.toLowerCase() + ":" + langCode
      );
    }

    if (columnIndex < 0 || row[columnIndex] === undefined) {
      return null;
    }

    let value = row[columnIndex].toString().trim();

    if (value === "") {
      return null;
    }

    // Apply data code transformation
    value = helpers.processPossibleDataCode(computedPath, value, langCode);

    return value;
  },

  /**
   * Extract searchable text from this data type
   * @param {any} data - The data value
   * @param {Object} uiContext - UI context (optional)
   * @returns {string[]} Array of searchable strings
   */
  getSearchableText: function (data, uiContext) {
    if (!data || typeof data !== "string") return [];
    return [data];
  },

  render: function (data, uiContext) {
    // Handle null/undefined
    if (data === null || data === undefined) {
      return null;
    }

    // Handle empty strings
    if (typeof data === "string" && data.trim() === "") {
      return null;
    }

    // For non-string types (numbers, booleans), convert to string
    let displayData;
    if (typeof data === "string") {
      displayData = data;
    } else if (typeof data === "number" || typeof data === "boolean") {
      displayData = data.toString();
    } else {
      // Objects and arrays should not be handled by text reader
      // Return the raw toString which will signal to caller this wasn't handled
      return null;
    }

    if (displayData.trim() === "") {
      return null;
    }

    // Apply template if available
    displayData = helpers.processTemplate(displayData, uiContext);

    return m("span", displayData);
  },
};

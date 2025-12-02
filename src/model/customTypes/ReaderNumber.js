import m from "mithril";
import { helpers } from "./helpers.js";

export let readerNumber = {
  dataType: "number",
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

    let value = row[columnIndex];

    if (value === "" || value === null || value === undefined) {
      return null;
    }

    // Convert to number
    let numValue = parseFloat(value);
    if (isNaN(numValue)) {
      return null;
    }

    return numValue;
  },

  /**
   * Extract searchable text from number data
   * @param {any} data - The number value
   * @param {Object} uiContext - UI context (optional)
   * @returns {string[]} Array of searchable strings
   */
  getSearchableText: function (data, uiContext) {
    if (data === null || data === undefined) return [];
    return [data.toString()];
  },

  render: function (data, uiContext) {
    if (data === null || data === undefined) {
      return null;
    }

    return m("span", data.toString());
  },
};

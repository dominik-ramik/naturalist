import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { helpers } from "./helpers.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";
import { applyHighlight } from "../highlightUtils.js";

export let customTypeText = {
  dataType: "text",
  expectedColumns: (basePath) => [basePath],

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

    // Do not apply replacement, we only do it on "category" now
    //value = helpers.processPossibleDataCode(computedPath, value, langCode);

    return value;
  },

  /**
   * Extract searchable text from this data type
   * @param {any} data - The data value
   * @param {Object} uiContext - UI context (optional)
   * @returns {string[]} Array of searchable strings
   */
  getSearchableText: function (data, uiContext) {
    if (data === null || data === undefined) return [];

    const displayData = helpers.processTemplate(
      typeof data === "string" ? data : String(data),
      uiContext
    );
    const searchable = String(displayData ?? "").trim();
    return searchable ? [searchable] : [];
  },

  filterPlugin: filterPluginText,

  toDwC: function (data, subPath) {
    // For text, we can return the string directly, or null if it's not a valid string
    if (data === null || data === undefined) {
      return null;
    }
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
    displayData = String(helpers.processTemplate(displayData, uiContext) ?? "");

    return m("span", applyHighlight(displayData, uiContext?.highlightRegex));
  },
};

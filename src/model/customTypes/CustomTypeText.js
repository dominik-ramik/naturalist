import m from "mithril";
import { helpers } from "./helpers.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";

export let customTypeText = {
  dataType: "text",
  meta: {
    summary: "Plain text string. The default type when Formatting is left empty.",
    whenToUse: "Any short categorical label, a status code, a single-word attribute, or any free-form text that does not need Markdown formatting.",
    behaviorFulltextIndexing: "The full string value is indexed as-is.",
    detailsPaneTab: "Text",
    inputFormats: [
      {
        label: "Single cell",
        syntax: "Any string value. Leading and trailing whitespace is trimmed. Empty cells are skipped.",
        example: { columns: ["status"], rows: [["Native"], ["Endemic"], ["Introduced"]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "Data Code replacement applies before display: if a Data Codes entry exists for this column, the raw value is replaced with the full label before rendering and before category matching.",
      },
    ],
  },
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

  filterPlugin: filterPluginText,

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
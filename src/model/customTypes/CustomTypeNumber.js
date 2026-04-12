import m from "mithril";
import { helpers } from "./helpers.js";
import { filterPluginNumber } from "../filterPlugins/filterPluginNumber.js";

export let customTypeNumber = {
  dataType: "number",
  meta: {
    summary: "Numeric value (integer or decimal). Parsed with `parseFloat()`; non-numeric cells are skipped.",
    whenToUse: "Measurements, counts, scores, percentages, elevation, or any column that users may want to filter by numeric range.",
    behaviorFulltextIndexing: "The number's string representation is indexed.",
    detailsPaneTab: null,
    inputFormats: [
      {
        label: "Single cell — plain number",
        syntax: "An integer or decimal number. No units or symbols — add those via the Template column.",
        example: { columns: ["wingLength"], rows: [["12.5"], ["8.3"], ["0"]] },
      },
    ],
    notes: [
      {
        type: "warning",
        text: "Store bare numbers in data cells — no units, no symbols. Use the **Template** column with `{{unit \"m\"}}` to add units at display time. Entering `5 m` in a cell turns the value into text and disables numeric filtering.",
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

  filterPlugin: filterPluginNumber,

  extractAllValues(_rawValue, leafData) {
    return leafData.filter(v => typeof v === "number" && !isNaN(v));
  },

  render: function (data, uiContext) {
    // Only handle actual numbers
    if (data === null || data === undefined) {
      return null;
    }

    if (typeof data !== "number") {
      // Not a number, don't handle
      return null;
    }

    // Apply template if available
    let displayData = helpers.processTemplate(data, uiContext);

    if (typeof displayData !== "string") {
      return m("span", displayData?.toLocaleString?.() || displayData?.toString?.() || "");
    }

    return m("span", m.trust(displayData));
  },
};
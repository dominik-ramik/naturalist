import m from "mithril";
import { helpers } from "./helpers.js";
import { processMarkdownWithBibliography } from "../../components/Utils.js";

export let readerMarkdown = {
  dataType: "markdown",
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

    return value;
  },

  /**
   * Extract searchable text from markdown data
   * @param {any} data - The markdown string
   * @param {Object} uiContext - UI context (optional)
   * @returns {string[]} Array of searchable strings
   */
  getSearchableText: function (data, uiContext) {
    if (!data || typeof data !== "string") return [];
    return [helpers.extractSearchableTextFromMarkdown(data)];
  },

  render: function (data, uiContext) {
    if (!data || data.toString().trim() === "") {
      return null;
    }

    // Apply template if available
    let displayData = helpers.processTemplate(data, uiContext);

    // Process markdown
    const htmlContent = processMarkdownWithBibliography(displayData);

    return m("span", m.trust(htmlContent));
  },
};

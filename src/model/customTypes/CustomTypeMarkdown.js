import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { helpers } from "./helpers.js";
import { htmlToPlainText, processMarkdownWithBibliography } from "../../components/Utils.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";

export let customTypeMarkdown = {
  dataType: "markdown",
  expectedColumns: (basePath) => [basePath],

  filterPlugin: null, // No specific filter plugin for markdown; use plain text search on rendered output

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

    const displayData = helpers.processTemplate(data, uiContext);
    const htmlContent = processMarkdownWithBibliography(String(displayData ?? ""));
    const searchable = htmlToPlainText(htmlContent).trim();
    return searchable ? [searchable] : [];
  },

  toDwC: function (data, subPath) {
    // For text, we can return the string directly, or null if it's not a valid string
    if (data === null || data === undefined) {
      return null;
    }
  },

  render: function (data, uiContext) {
    if (!data || data.toString().trim() === "") {
      return null;
    }

    if (typeof data !== "string") {
      //console.log("Warning: readerMarkdown received non-string data:", data);
      return data;
    }

    // Apply template if available
    let displayData = String(helpers.processTemplate(data, uiContext) ?? "");

    // Process markdown
    const htmlContent = processMarkdownWithBibliography(displayData, "", false, uiContext?.highlightRegex);

    return m("span", m.trust(htmlContent));
  },
};

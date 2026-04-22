import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { helpers, compileCategoryMatcher, MATCHER_CACHE } from "./helpers.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";
import { applyHighlight, textMatchesHighlight } from "../highlightUtils.js";

// ---------------------------------------------------------------------------
// CSS helper
// ---------------------------------------------------------------------------
function purifyCssString(css) {
  if (css.indexOf('"') >= 0)  css = css.substring(0, css.indexOf('"'));
  if (css.indexOf("'") >= 0)  css = css.substring(0, css.indexOf("'"));
  if (css.indexOf(";") >= 0)  css = css.substring(0, css.indexOf(";"));
  if (css.indexOf(":") >= 0)  css = css.substring(0, css.indexOf(":"));
  return css;
}

export let customTypeCategory = {
  dataType: "category",
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

    // Apply data code transformation
    value = helpers.processPossibleDataCode(computedPath, value, langCode);

    return value;
  },

  /**
   * Extract searchable text from category data
   * @param {any} data - The category value
   * @param {Object} uiContext - UI context (optional)
   * @returns {string[]} Array of searchable strings
   */
  getSearchableText: function (data, uiContext) {
    if (!data || typeof data !== "string") return [];
    return [data];
  },

  filterPlugin: filterPluginText,

  render: function (data, uiContext) {
    if (data === null || data === undefined || data.toString().trim() === "") {
      return null;
    }

    // Convert data to string to ensure string methods work
    const dataString = data.toString();

    let badgeMeta = uiContext.meta.categories;
    let badgeFormat = badgeMeta.find(function (possibleFormat) {
      // Retrieve or lazily compile the matcher for this category entry.
      // The compiled function is cached via a private Symbol so it is built
      // only once per entry across thousands of render calls.
      if (!possibleFormat[MATCHER_CACHE]) {
        possibleFormat[MATCHER_CACHE] = compileCategoryMatcher(possibleFormat.contains);
      }
      return possibleFormat[MATCHER_CACHE](dataString);
    });

    if (badgeFormat) {
      return m.trust(
        "<span class='category" + (textMatchesHighlight(dataString, uiContext?.highlightRegex) ? " search-highlight-field" : "") + "' style='" +
          (badgeFormat.background
            ? "background-color: " + purifyCssString(badgeFormat.background) + ";"
            : "") +
          (badgeFormat.text
            ? "color: " + purifyCssString(badgeFormat.text) + ";"
            : "") +
          (badgeFormat.border
            ? "border-color: " + purifyCssString(badgeFormat.border) + ";"
            : "") +
          "'>" +
          dataString.replace(/\s/g, "&nbsp;") +
          "</span>"
      );
    }

    return m("span", applyHighlight(dataString.trim(), uiContext?.highlightRegex));
  },
};
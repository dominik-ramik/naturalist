import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { helpers } from "./helpers.js";
import { filterPluginNumber } from "../filterPlugins/filterPluginNumber.js";
import { numericFilters } from "../filterPlugins/shared/filterUtils.js";
import { applyHighlight, highlightHtml, textMatchesHighlight } from "../HighlightUtils.js";

function matchesNumberFilter(value, filterDef) {
  if (!filterDef) return false;

  const operation = filterDef.numeric?.operation;
  if (operation) {
    const comparer = numericFilters[operation]?.comparer;
    return !!comparer && comparer(value, filterDef.numeric.threshold1, filterDef.numeric.threshold2);
  }

  return Array.isArray(filterDef.selected) && filterDef.selected.includes(value);
}

function renderDisplayString(displayString, highlightRegex, highlightWholeField) {
  const hasHtml = /<[^>]+>/.test(displayString);

  if (highlightRegex) {
    if (hasHtml) {
      const highlightedHtml = highlightHtml(displayString, highlightRegex);
      if (highlightedHtml !== displayString) {
        return m("span", m.trust(highlightedHtml));
      }
    } else {
      const highlightedText = applyHighlight(displayString, highlightRegex);
      if (Array.isArray(highlightedText)) {
        return m("span", highlightedText);
      }
    }
  }

  if (highlightWholeField) {
    return hasHtml
      ? m("span", m("mark.search-highlight", m.trust(displayString)))
      : m("span", m("mark.search-highlight", displayString));
  }

  return hasHtml
    ? m("span", m.trust(displayString))
    : m("span", displayString);
}

export let customTypeNumber = {
  dataType: "number",
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

  toDwC: function (data, subPath) {
    // For text, we can return the string directly, or null if it's not a valid string
    if (!Number.isFinite(data)) {
      return null;
    }

    return data;
  },

  render: function (data, uiContext) {
    // Only handle actual numbers
    if (!Number.isFinite(data)) {
      return null;
    }

    const rawStr = data.toString();
    const matchedByRegex = textMatchesHighlight(rawStr, uiContext?.highlightRegex);
    const matchedByFilter = matchesNumberFilter(data, uiContext?.filterDef);
    const displayData = helpers.processTemplate(data, uiContext);

    if (typeof displayData === "number") {
      const localeStr = displayData?.toLocaleString?.() ?? rawStr;
      const highlighted = applyHighlight(localeStr, uiContext?.highlightRegex);
      if (Array.isArray(highlighted)) {
        return m("span", highlighted);
      }
      if (matchedByRegex || matchedByFilter) {
        return m("span", m("mark.search-highlight", localeStr));
      }
      return m("span", localeStr);
    }

    return renderDisplayString(
      displayData?.toString?.() ?? String(displayData),
      uiContext?.highlightRegex,
      matchedByRegex || matchedByFilter
    );
  },
};

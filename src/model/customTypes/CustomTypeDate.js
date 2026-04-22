import dayjs from "dayjs";
import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

import { Checklist } from "../Checklist.js";
import { helpers } from "./helpers.js";
import { filterPluginDate } from "../filterPlugins/filterPluginDate.js";
import { numericFilters } from "../filterPlugins/shared/filterUtils.js";
import { applyHighlight, highlightHtml, textMatchesHighlight } from "../highlightUtils.js";

function getDateFormat(langCode) {
  return Checklist.getCurrentDateFormat(langCode);
}

function getRenderedDateString(data, uiContext) {
  const dateObj = dayjs(data);
  if (!dateObj.isValid()) return "";

  const langCode = uiContext?.langCode || Checklist.getCurrentLanguage();
  const formattedDate = dateObj.format(getDateFormat(langCode));
  return String(uiContext ? helpers.processTemplate(formattedDate, uiContext) : formattedDate);
}

function getDateSearchableText(data, uiContext) {
  const renderedDate = getRenderedDateString(data, uiContext);
  if (!renderedDate) return "";
  return /<[^>]+>/.test(renderedDate)
    ? renderedDate.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : renderedDate.trim();
}

function matchesDateFilter(value, filterDef) {
  if (!filterDef) return false;

  const operation = filterDef.numeric?.operation;
  if (operation) {
    const comparer = numericFilters[operation]?.comparer;
    return !!comparer && comparer(value, filterDef.numeric.threshold1, filterDef.numeric.threshold2);
  }

  return Array.isArray(filterDef.selected) && filterDef.selected.includes(value);
}

export let customTypeDate = {
  dataType: "date",
  expectedColumns: (basePath) => [basePath],

  readData: function (context, computedPath) {
    const { headers, row, langCode } = context;
    const candidateColumns = [
      computedPath.toLowerCase(),
      `${computedPath.toLowerCase()}:${langCode}`,
    ];

    for (const columnName of candidateColumns) {
      const columnIndex = headers.indexOf(columnName);

      if (columnIndex < 0 || row[columnIndex] === undefined) {
        continue;
      }

      const value = row[columnIndex];
      if (value === "" || value === null || value === undefined) {
        continue;
      }

      const dateObj = dayjs(value);
      if (dateObj.isValid()) {
        return dateObj.startOf('day').valueOf();
      }
    }

    return null;
  },

  getSearchableText: function (data, uiContext) {
    if (data === null || data === undefined) {
      return [];
    }

    const searchable = getDateSearchableText(data, uiContext);
    return searchable ? [searchable] : [];
  },

  filterPlugin: filterPluginDate,

  extractAllValues(_rawValue, leafData) {
    return leafData.filter(v => typeof v === "number" && !isNaN(v));
  },

  render: function (data, uiContext) {
    if (data === null || data === undefined) {
      return null;
    }

    const dateObj = dayjs(data);
    if (!dateObj.isValid()) {
      return null;
    }

    const renderedDate = getRenderedDateString(data, uiContext);
    const searchableText = getDateSearchableText(data, uiContext);
    const matchedByRegex = textMatchesHighlight(searchableText, uiContext?.highlightRegex);
    const matchedByFilter = matchesDateFilter(data, uiContext?.filterDef);

    if (/<[^>]+>/.test(renderedDate)) {
      const highlightedHtml = highlightHtml(renderedDate, uiContext?.highlightRegex);
      if (highlightedHtml !== renderedDate) {
        return m("span.data-date", m.trust(highlightedHtml));
      }
      if (matchedByRegex || matchedByFilter) {
        return m("span.data-date", m("mark.search-highlight", m.trust(renderedDate)));
      }
      return m("span.data-date", m.trust(renderedDate));
    }

    const highlightedText = applyHighlight(renderedDate, uiContext?.highlightRegex);
    if (Array.isArray(highlightedText)) {
      return m("span.data-date", highlightedText);
    }
    if (matchedByRegex || matchedByFilter) {
      return m("span.data-date", m("mark.search-highlight", renderedDate));
    }
    return m("span.data-date", renderedDate);
  },
};

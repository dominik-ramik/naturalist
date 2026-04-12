import dayjs from "dayjs";
import m from "mithril";

import { Checklist } from "../Checklist.js";
import { helpers } from "./helpers.js";
import { filterPluginDate } from "../filterPlugins/filterPluginDate.js";

function getDateFormat(langCode) {
  return Checklist.getCurrentDateFormat(langCode);
}

export let customTypeDate = {
  dataType: "date",

  meta: {
    summary: "Date value. Parsed using day.js — accepts ISO 8601, common date strings, and Excel date serial numbers. Rendered according to the Date format setting in `nl_appearance`.",
    whenToUse: "Collection dates, publication dates, observation dates, any date-stamped field.",
    behaviorFulltextIndexing: "The formatted date string (using the active Date format setting) is indexed.",
    detailsPaneTab: null,
    inputFormats: [
      {
        label: "Single cell — any day.js-parseable date",
        syntax: "ISO 8601 (`2024-01-15`), common formats (`Jan 15, 2024`, `15/01/2024`), or Excel date serial numbers when the cell is formatted as a date in Excel.",
        example: { columns: ["collectionDate"], rows: [["2024-01-15"], ["1978-06-14"], ["2003-08-02"]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "Configure the display format in `nl_appearance` → Customization → **Date format** using [day.js format tokens](https://day.js.org/docs/en/display/format). Different formats can be set per language: `MMM D, YYYY` for English and `DD/MM/YYYY` for French.",
      },
    ],
  },

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
        return dateObj.valueOf();
      }
    }

    return null;
  },

  getSearchableText: function (data, uiContext) {
    if (data === null || data === undefined) {
      return [];
    }

    const dateObj = dayjs(data);
    if (!dateObj.isValid()) {
      return [];
    }

    const langCode = uiContext?.langCode || Checklist.getCurrentLanguage();
    return [dateObj.format(getDateFormat(langCode))];
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

    let formattedDate = dateObj.format(getDateFormat());
    if (uiContext) {
      formattedDate = helpers.processTemplate(formattedDate, uiContext);
    }

    return m("span.data-date", formattedDate);
  },
};
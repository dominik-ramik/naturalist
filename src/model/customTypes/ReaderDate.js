import dayjs from "dayjs";
import m from "mithril";

import { Checklist } from "../Checklist.js";
import { helpers } from "./helpers.js";

function getDateFormat(langCode) {
  return Checklist.getCurrentDateFormat(langCode);
}

export let readerDate = {
  dataType: "date",

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

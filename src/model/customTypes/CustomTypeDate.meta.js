// src/model/customTypes/CustomTypeDate.meta.js
import { filterMetaDate } from "../filterPlugins/filterPluginDate.meta.js";

export const customTypeDateMeta = {
  dataType: "date",
  filterMeta: filterMetaDate,
  meta: {
    summary: "Date value. Format your data cells as dates, not text. Rendered according to the **Date format** setting in [[ref:appearance.customization]].",
    whenToUse: "Collection dates, publication dates, observation dates, any date-stamped field.",
    behaviorFulltextIndexing: "The formatted date string (using the active **Date format** setting in [[ref:appearance.customization]]) is indexed.",
    dwcNotes: {
      output: "",
      subPaths: [
        // {subPath: "source", label: "Source URL"},
        // {subPath: "title", label: "Title or caption"},
      ]
    },
    detailsPaneTab: null,
    inputFormats: [
      {
        label: "Single cell - date format:",
        syntax: "cells formated as date in your spreadsheet, only year, month and day are preserved and time is stripped. Also can parse ISO 8601 (`2024-01-15`) and technically any date parseable by [day.js](https://day.js.org/docs/en/display/format).",
        example: { columns: ["collectionDate"], rows: [["2024-01-15"], ["1978-06-14"], ["2003-08-02"]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "Configure the display format in [[ref:appearance.customization]] → **Date format** using [day.js format tokens](https://day.js.org/docs/en/display/format). Different formats can be set per language.",
      },
    ],
  },
};

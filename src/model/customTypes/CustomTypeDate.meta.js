// src/model/customTypes/CustomTypeDate.meta.js
import { filterMetaDate } from "./filterMeta.js";

export const customTypeDateMeta = {
  dataType:   "date",
  filterMeta: filterMetaDate,
  meta: {
    summary:                  "Date value. Parsed using day.js — accepts ISO 8601, common date strings, and Excel date serial numbers. Rendered according to the **Date format** setting in [[ref:appearance.customization]].",
    whenToUse:                "Collection dates, publication dates, observation dates, any date-stamped field.",
    behaviorFulltextIndexing: "The formatted date string (using the active Date format setting) is indexed.",
    detailsPaneTab:           null,
    inputFormats: [
      {
        label:  "Single cell — any day.js-parseable date",
        syntax: "ISO 8601 (`2024-01-15`), common formats (`Jan 15, 2024`, `15/01/2024`), or Excel date serial numbers when the cell is formatted as a date in Excel.",
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

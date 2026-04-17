// src/model/customTypes/CustomTypeNumber.meta.js
import { filterMetaNumber } from "../filterPlugins/filterPluginNumber.meta.js";

export const customTypeNumberMeta = {
  dataType:   "number",
  filterMeta: filterMetaNumber,
  meta: {
    summary:                  "Numeric value (integer or decimal). Parsed with `parseFloat()`; non-numeric cells are skipped.",
    whenToUse:                "Measurements, counts, scores, percentages, elevation, or any column that users may want to filter by numeric range.",
    behaviorFulltextIndexing: "The number's string representation is indexed.",
    detailsPaneTab:           null,
    inputFormats: [
      {
        label:  "Single cell - plain number",
        syntax: "An integer or decimal number. No units or symbols - add those via the Template column.",
        example: { columns: ["wingLength"], rows: [["12.5"], ["8.3"], ["0"]] },
      },
    ],
    notes: [
      {
        type: "warning",
        text: "Store bare numbers in data cells - no units, no symbols. Use the **Template** column with `{{unit \"m\"}}` to add units at display time. Entering `5 m` in a cell turns the value into text and disables numeric filtering.",
      },
    ],
  },
};

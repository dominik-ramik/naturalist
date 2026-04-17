// src/model/customTypes/CustomTypeCategory.meta.js
import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";

export const customTypeCategoryMeta = {
  dataType:   "category",
  filterMeta: filterMetaText,
  meta: {
    summary:                  "Categorical text value rendered as a coloured pill/badge. Data reading is identical to `text` but the value is looked up in the [[ref:appearance.categories]] table for visual styling.",
    whenToUse:                "Any column with a small, fixed set of categorical values that benefit from colour coding - Red List categories, presence/origin status, life-form codes, etc.",
    behaviorFulltextIndexing: "The string value (after Data Code replacement) is indexed.",
    detailsPaneTab:           "Text",
    inputFormats: [
      {
        label:  "Single cell",
        syntax: "Any string value. [[ref:appearance.dataCodes]] replacement applies first. The result is matched against the [[ref:appearance.categories]] table using a case-insensitive substring match.",
        example: { columns: ["redlist"], rows: [["LC"], ["EN"], ["CR"]] },
      },
    ],
    notes: [
      {
        type: "warning",
        text: "The [[ref:appearance.categories]] table must be populated for this type to show coloured badges. Setting the formatting to `category` alone does nothing visual without corresponding category definitions.",
      },
    ],
  },
};

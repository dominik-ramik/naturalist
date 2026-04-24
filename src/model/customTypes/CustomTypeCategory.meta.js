// src/model/customTypes/CustomTypeCategory.meta.js
import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";

export const customTypeCategoryMeta = {
  dataType: "category",
  filterMeta: filterMetaText,
  meta: {
    summary: "A categorical value from a fixed or controlled vocabulary. Rendered optionally with a human-readable label and colored badge appearance.",
    whenToUse: "Any column with a small, fixed set of categorical values that benefit from color coding or code-to-label mapping - Red List categories, presence/origin status, life-form codes, etc.",
    behaviorFulltextIndexing: "The display label resolved from [[ref:appearance.categoryDisplay]] is indexed; if no matching label is defined, the raw string value is indexed.",
    dwcNotes: {
      output: "",
      subPaths: [
        // {subPath: "source", label: "Source URL"},
        // {subPath: "title", label: "Title or caption"},
      ]
    },
    detailsPaneTab: "",
    inputFormats: [
      {
        label: "Single cell",
        syntax: "Any string value. The raw cell value is matched against the [[ref:appearance.categoryDisplay.rawValue]] column using case-insensitive wildcard patterns (`*` matches any sequence of characters); the first matching row wins and supplies the label and badge colors.",
        example: { columns: ["redlist"], rows: [["LC"], ["EN"], ["CR"]] },
      },
    ],
    notes: [
      {
        type: "warning",
        text: "The [[ref:appearance.categoryDisplay]] table must be populated for this type to show colored badges or human-readable label substitutions. Setting the [[ref:content.customDataDefinition.dataType]] to `category` alone does nothing visual without corresponding category display definitions.",
      },
    ],
  },
};
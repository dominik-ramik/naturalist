// src/model/customTypes/CustomTypeText.meta.js
import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";

export const customTypeTextMeta = {
  dataType: "text",
  filterMeta: filterMetaText,
  meta: {
    summary: "Plain text string. No formatting.",
    whenToUse: "Any short label or any free-form text that does not need Markdown formatting (see [[ref:type.markdown]]) or category-based formatting (see [[ref:type.category]]).",
    behaviorFulltextIndexing: "The full string value is indexed as-is.",
    dwcNotes: {
      output: "Plain text value as appearing in the cell.",
      subPaths: [
        {suffix: "", label: "raw cell value"},
      ]
    },
    detailsPaneTab: "Text",
    inputFormats: [
      {
        label: "Single cell",
        syntax: "Any string value. Leading and trailing whitespace is trimmed. Empty cells are skipped.",
        example: { columns: ["specimenStateNote"], rows: [["fair"], ["..."], ["frass found, schedule fumigation"]] },
      },
    ],
    notes: [
    ],
  },
};

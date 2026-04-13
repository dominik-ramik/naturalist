// src/model/customTypes/CustomTypeText.meta.js
import { filterMetaText } from "./filterMeta.js";

export const customTypeTextMeta = {
  dataType:   "text",
  filterMeta: filterMetaText,
  meta: {
    summary:                  "Plain text string. The default type when Formatting is left empty.",
    whenToUse:                "Any short categorical label, a status code, a single-word attribute, or any free-form text that does not need Markdown formatting.",
    behaviorFulltextIndexing: "The full string value is indexed as-is.",
    detailsPaneTab:           "Text",
    inputFormats: [
      {
        label:  "Single cell",
        syntax: "Any string value. Leading and trailing whitespace is trimmed. Empty cells are skipped.",
        example: { columns: ["status"], rows: [["Native"], ["Endemic"], ["Introduced"]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "Data Code replacement applies before display: if a [[ref:appearance.dataCodes]] entry exists for this column, the raw value is replaced with the full label before rendering and before category matching.",
      },
    ],
  },
};

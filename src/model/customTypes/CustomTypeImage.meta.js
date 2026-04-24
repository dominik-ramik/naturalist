// src/model/customTypes/CustomTypeImage.meta.js
import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";

export const customTypeImageMeta = {
  dataType: "image",
  filterMeta: filterMetaText,
  meta: {
    summary: "An image file, displayed as a clickable thumbnail in the taxon card or with a title caption in the Details pane. Supports relative paths (resolved from `usercontent/`) and absolute URLs.",
    whenToUse: "Species photographs, illustrations, habitat photos, specimen images, ...",
    behaviorFulltextIndexing: "The image title is indexed for full-text search.",
    dwcNotes: {
      output: "",
      subPaths: [
        // {subPath: "source", label: "Source URL"},
        // {subPath: "title", label: "Title or caption"},
      ]
    },
    detailsPaneTab: "Media",
    inputFormats: [
      {
        label: "Two columns (source + title)",
        syntax: "`[columnname].source` and `[columnname].title` as separate columns.",
        example: { columns: ["photo.source", "photo.title"], rows: [["images/litoria.jpg", "Green tree frog"], ["https://example.org/pic.jpg", "External photo"]] },
      },
      {
        label: "Single column - pipe-separated",
        syntax: "`source|title` in one cell.",
        example: { columns: ["photo"], rows: [["images/litoria.jpg|Green tree frog"]] },
      },
      {
        label: "Single column - no title",
        syntax: "`source` is the entire content of the cell.",
        example: { columns: ["photo"], rows: [["images/litoria.jpg"]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "Arrays of images work with numbered columns: `photo1.source`, `photo1.title`, `photo2.source`, referenced as `photo#` in the [[ref:content.customDataDefinition]] table. Use a **Template** to avoid repeating a shared directory path - e.g. `images/{{value}}.jpg` inside [[ref:content.customDataDefinition.template]] lets you enter just the base filename in each cell, assuming those files are in the `usercontent/` directory.",
      },
    ],
  },
};

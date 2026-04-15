// src/model/customTypes/CustomTypeImage.meta.js
import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";

export const customTypeImageMeta = {
  dataType:   "image",
  filterMeta: filterMetaText,
  meta: {
    summary:                  "An image file, displayed as a clickable thumbnail in the taxon card or with a title caption in the Details pane. Supports relative paths (resolved from `usercontent/`) and absolute URLs.",
    whenToUse:                "Species photographs, illustrations, habitat photos, or any image associated with a taxon.",
    behaviorFulltextIndexing: "The image title is indexed for full-text search.",
    detailsPaneTab:           "Media",
    inputFormats: [
      {
        label:  "Two columns (source + title)",
        syntax: "`<columnname>.source` and `<columnname>.title` as separate columns.",
        example: { columns: ["photo.source", "photo.title"], rows: [["images/litoria.jpg", "Green tree frog"], ["https://example.org/pic.jpg", "External photo"]] },
      },
      {
        label:  "Single column — pipe-separated",
        syntax: "`source|title` in one cell.",
        example: { columns: ["photo"], rows: [["images/litoria.jpg|Green tree frog"]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "Arrays of images work with numbered columns: `photo1.source`, `photo1.title`, `photo2.source`, referenced as `photo#` in the meta sheet. Use a **Template** to avoid repeating a shared directory path — e.g. `images/{{value}}.jpg` lets you enter just the base filename in each cell.",
      },
    ],
  },
};

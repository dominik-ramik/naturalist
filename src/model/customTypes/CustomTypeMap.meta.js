import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";

export const customTypeMapMeta = {
  dataType: "map",
  filterMeta: filterMetaText,
  meta: {
    summary: "A static map image (JPG, PNG, SVG, etc.) displayed as a clickable thumbnail. For interactive SVG region maps generated directly from your data use [[ref:type.mapregions]] instead.",
    whenToUse: "Scanned range maps, hand-drawn distribution maps, or any static image that represents geographic information.",
    behaviorFulltextIndexing: "The map title is indexed for full-text search.",
    dwcNotes: {
      output: "not accessible through column names, use `media:` directive in DwC export for media files, see [[ref:content.dwcArchive.valueSource]]",
      subPaths: []
    },
    detailsPaneTab: "Map",
    inputFormats: [
      {
        label: "Two columns (source + title)",
        syntax: "`[columnname].source` and `[columnname].title` as separate columns.",
        example: { columns: ["rangemap.source", "rangemap.title"], rows: [["maps/litoria_range.png", "Known range"]] },
      },
      {
        label: "Single column - pipe-separated",
        syntax: "`source|title` in one cell.",
        example: { columns: ["rangemap"], rows: [["maps/litoria_range.png|Known range"]] },
      },
    ],
    notes: [{
      type: "tip",
      text: "Use a **Template** to avoid repeating a shared directory path - e.g. `maps/{{value}}.jpg` inside [[ref:content.customDataDefinition.template]] lets you enter just the base filename in each cell, assuming those files are in the `usercontent/` directory.",
    },],
  },
};

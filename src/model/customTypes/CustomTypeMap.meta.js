import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";

export const customTypeMapMeta = {
  dataType:   "map",
  filterMeta: filterMetaText,
  meta: {
    summary:                  "A static map image (JPG, PNG, SVG, PDF, etc.) displayed as a clickable thumbnail. For interactive SVG region maps use `mapregions` instead.",
    whenToUse:                "Scanned range maps, hand-drawn distribution maps, or any static image that represents geographic information for a taxon.",
    behaviorFulltextIndexing: "The map title is indexed for full-text search.",
    detailsPaneTab:           "Map",
    inputFormats: [
      {
        label:  "Two columns (source + title)",
        syntax: "`<columnname>.source` and `<columnname>.title` as separate columns.",
        example: { columns: ["rangemap.source", "rangemap.title"], rows: [["maps/litoria_range.png", "Known range"]] },
      },
      {
        label:  "Single column — pipe-separated",
        syntax: "`source|title` in one cell.",
        example: { columns: ["rangemap"], rows: [["maps/litoria_range.png|Known range"]] },
      },
    ],
    notes: [],
  },
};

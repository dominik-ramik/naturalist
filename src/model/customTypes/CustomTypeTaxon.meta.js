import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";

export const customTypeTaxonMeta = {
  dataType:   "taxon",
  filterMeta: filterMetaText,
  meta: {
    summary:                  "A reference to another taxon in the dataset, rendered as a clickable link that navigates to or highlights that taxon in the tree.",
    whenToUse:                "Basionyms, synonyms, type species, or any field that references another taxon that should be navigable within the dataset.",
    behaviorFulltextIndexing: "Both `taxon.name` and `taxon.authority` are indexed for full-text search.",
    detailsPaneTab:           null,
    inputFormats: [
      {
        label:  "Two columns (name + authority)",
        syntax: "`<columnname>.name` and `<columnname>.authority` as separate columns.",
        example: { columns: ["basionym.name", "basionym.authority"], rows: [["Rana aurea", "Lesson, 1829"]] },
      },
      {
        label:  "Single column — pipe-separated",
        syntax: "`Name|Authority` in one cell.",
        example: { columns: ["basionym"], rows: [["Rana aurea|Lesson, 1829"]] },
      },
      {
        label:  "Single column — name only",
        syntax: "Just the taxon name, with an optional separate `<columnname>.authority` column.",
        example: { columns: ["basionym"], rows: [["Rana aurea"]] },
      },
    ],
    notes: [],
  },
};

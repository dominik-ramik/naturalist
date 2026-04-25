import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";

export const customTypeTaxonMeta = {
  dataType: "taxon",
  filterMeta: filterMetaText,
  meta: {
    summary: "A taxon name, rendered as a clickable link. Shows the [Taxon details](/user-guide/taxon-details) upon click with external search engines if configured in [[ref:content.searchOnline]].",
    whenToUse: "Basionyms, synonyms, type species, host plants, common pests, ...",
    behaviorFulltextIndexing: "Both `taxon.name` and `taxon.authority` are indexed for full-text search.",
    dwcNotes: {
      output: "",
      subPaths: [
         {suffix: "", label: "name part of the taxon, e.g. 'Myzomela cardinalis'"},
         {suffix: "name", label: "name part of the taxon, e.g. 'Myzomela cardinalis'"},
         {suffix: "authority", label: "authority part of the taxon, e.g. '(Gmelin, JF, 1788)'"},
         {suffix: "lastNamePart", label: "the last whitespace-delimited token of the name, e.g. 'cardinalis', or nothing if the name is a single token"},
      ]
    },
    detailsPaneTab: null,
    inputFormats: [
      {
        label: "Two columns (name + authority)",
        syntax: "`[columnname].name` and `[columnname].authority` as separate columns.",
        example: { columns: ["basionym.name", "basionym.authority"], rows: [["Rana aurea", "Lesson, 1829"]] },
      },
      {
        label: "Single column - pipe-separated",
        syntax: "`Name|Authority` in one cell.",
        example: { columns: ["basionym"], rows: [["Rana aurea|Lesson, 1829"]] },
      },
      {
        label: "Single column - name only",
        syntax: "Just the taxon name with no authority.",
        example: {
          text: "Note we are using here an 'array' to allow for multiple pests for the same taxon in [[ref:data]] sheet. This would suppose the [[ref:content.customDataDefinition]] contains a row for `commonPests#` with [[ref:content.customDataDefinition.dataType]] set to `taxon`.",
          columns: ["commonPests1", "commonPests2"],
          rows: [["Helicoverpa armigera", "Plutella xylostella"], ["Tetranychus urticae", ""]],
        },
      },
      {
        label: "Two columns",
        syntax: "The same data as above, but written with name and authority in separate columns.",
        example: {
          columns: ["commonPests1.name", "commonPests1.authority", "commonPests2.name", "commonPests2.authority"],
          rows: [["Helicoverpa armigera", "(Hübner, 1805)", "Plutella xylostella", " (Linnaeus, 1758)"],
          ["Tetranychus urticae", "Koch, 1836", "", ""]],
        },
      },
    ],
    notes: [],
  },
};

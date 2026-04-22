import { filterMetaMonths } from "../filterPlugins/filterPluginMonths.meta.js";

export const customTypeMonthsMeta = {
  dataType: "months",
  filterMeta: filterMetaMonths,
  meta: {
    summary: "For storing months of year regardless to the date, like phenological data - which months of the year a taxon is active, flowering, migrating, breeding, etc. Rendered compactly with December-January wraparound support.",
    whenToUse: "Flowering periods, breeding seasons, flight periods, activity windows - any phenological attribute expressed as a set of months.",
    behaviorFulltextIndexing: "Individual month names are indexed even if they are displayed compactly as a range. Text-search for `February` will match `February`, `February-March` as well as `January-April`.",
    detailsPaneTab: null,
    inputFormats: [
      {
        label: "Format 1: Per-month columns",
        syntax: "Columns named `[columnname].jan`, …, `[columnname].dec`. Any non-empty cell activates that month.",
        example: {
          columns: ["species", "flowers.jan", "flowers.feb", "...", "flowers.dec", "[comment]"], rows: [
            ["Helleborus niger", "x", "x", "...", "x", "Renders as `December-February`"],
            ["Galanthus nivalis", "x", "x", "...", "", "Renders as `January-February`"]
          ]
        },
      },
      {
        label: "Format 2: Inline cell - three-letter codes or 1-based numbers",
        syntax: "Three-letter codes (`jan`, `feb`) or 1-based numbers, pipe/comma-separated, with optional dash ranges. Wraparound (e.g. `nov-feb`) is supported.",
        example: {
          columns: ["flowering"], rows: [
            ["jan-feb|dec"],
            ["12-2"],
            ["jan, mar-oct, dec"],
            ["1, 3-10, 12"]
          ]
        },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "Customise displayed month names in [[ref:appearance.customization]] → **Month names** with a comma-separated list of 12 names in January-December order.",
      },
    ],
  },
};

import { filterMetaMonths } from "../filterPlugins/filterPluginMonths.meta.js";

export const customTypeMonthsMeta = {
  dataType:   "months",
  filterMeta: filterMetaMonths,
  meta: {
    summary:                  "Phenological data - which months of the year a taxon is active, flowering, breeding, etc. Rendered compactly with December–January wraparound support and bold month names.",
    whenToUse:                "Flowering periods, breeding seasons, flight periods, activity windows - any phenological attribute expressed as a set of months.",
    behaviorFulltextIndexing: "The full rendered range string (e.g. `Jan–Feb and Dec`) is indexed as a single token.",
    detailsPaneTab:           null,
    inputFormats: [
      {
        label:  "Format 1: Per-month columns",
        syntax: "Columns named `<columnname>.jan`, …, `<columnname>.dec`. Any non-empty cell activates that month.",
        example: { columns: ["flowering.jan", "flowering.feb", "flowering.dec"], rows: [["x", "x", "x"]] },
      },
      {
        label:  "Format 2: Inline cell - three-letter codes or 1-based numbers",
        syntax: "Three-letter codes (`jan`, `feb`) or 1-based numbers, pipe/comma-separated, with optional dash ranges. Wraparound (e.g. `nov-feb`) is supported.",
        example: { columns: ["flowering"], rows: [["jan-feb|dec"], ["11-2"]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "Customise displayed month names in [[ref:appearance.customization]] → **Month names** with a comma-separated list of 12 names in January–December order.",
      },
    ],
  },
};

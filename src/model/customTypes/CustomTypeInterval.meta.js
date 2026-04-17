import { filterMetaInterval } from "../filterPlugins/filterPluginInterval.meta.js";

export const customTypeIntervalMeta = {
  dataType:   "interval",
  filterMeta: filterMetaInterval,
  meta: {
    summary:                  "A numeric range representing minimum and maximum values, both inclusive. Rendered as `from – to` (e.g. `10 – 15`); if both endpoints are equal, shown as a single value.",
    whenToUse:                "Physical dimensions (length, wingspan, weight), altitude limits, depth ranges, or any numeric attribute with a minimum and maximum boundary.",
    behaviorFulltextIndexing: "The rendered range string (e.g. `10 - 15`) is indexed as a single token.",
    detailsPaneTab:           null,
    inputFormats: [
      {
        label:  "Format 1: Two columns (.from and .to)",
        syntax: "`<columnname>.from` and `<columnname>.to`, each a single number.",
        example: { columns: ["length.from", "length.to"], rows: [["10.5", "15"], ["-5", "0"]] },
      },
      {
        label:  "Format 2: Single column - pipe-separated",
        syntax: "`from | to`. Both `.` and `,` are valid decimal separators.",
        example: { columns: ["length"], rows: [["10.6 | 15"]] },
      },
      {
        label:  "Format 3: Single column - dash-separated",
        syntax: "`15.6 - 18.1` or `15.6-18.1`. Handles negatives: `-10--5`.",
        example: { columns: ["length"], rows: [["15.6 - 18.1"], ["-10--5"]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "When a **Template** is configured (e.g. `{{unit \"cm\"}}`), it is applied to each endpoint independently, producing `10 cm – 15 cm`.",
      },
    ],
  },
};

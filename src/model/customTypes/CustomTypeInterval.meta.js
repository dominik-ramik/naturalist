import { shuffle } from "d3";
import { filterMetaInterval } from "../filterPlugins/filterPluginInterval.meta.js";

export const customTypeIntervalMeta = {
  dataType: "interval",
  filterMeta: filterMetaInterval,
  meta: {
    summary: "A numeric range representing minimum and maximum values, both inclusive. Rendered as `from - to` (e.g. `10 - 15`); if both endpoints are equal, shown as a single value.",
    whenToUse: "Typical ranges of physical dimensions (length, wingspan, weight), altitude limits or precision range, depth ranges, or any numeric attribute with a minimum and maximum boundary.",
    behaviorFulltextIndexing: "The rendered range string (e.g. `10 - 15`) is indexed as a single token.",
    dwcNotes: {
      output: "numeric value of either chosen endpoint.",
      subPaths: [
        { suffix: "from", label: "the lower endpoint numeric value" },
        { suffix: "to", label: "the upper endpoint numeric value" },
      ]
    },
    detailsPaneTab: null,
    inputFormats: [
      {
        label: "Format 1: Two columns (.from and .to)",
        syntax: "`[columnname].from` and `[columnname].to`, each a single number, use numeric format for both.",
        example: {
          columns: ["length.from", "length.to", "[comment]"],
          rows: [
            ["10.5", "15", ""],
            ["-5", "0", ""],
            ["42", "", "If both endpoints are the same, you can put the value in either column and leave the other empty."],
          ]
        },
      },
      {
        label: "Format 2: Single column - pipe-separated",
        syntax: "`from | to`. Both `.` and `,` are valid decimal separators.",
        example: {
          columns: ["length", "[comment]"], rows: [
            ["10.6 | 15", ""],
            ["42", "If both endpoints are the same, just enter a single value."]]
        },
      },
      {
        label: "Format 3: Single column - dash-separated",
        syntax: "`15.6 - 18.1` or `15.6-18.1`. Handles negatives: `-10--5`.",
        example: { columns: ["length"], rows: [["15.6 - 18.1"], ["-10--5"]] },
      },
    ],
    notes: [
      {
        type: "warning",
        text: "Store bare numbers in data cells - no units, no symbols. Enter `5 - 6`, not `5 m - 6 m`. Use the [[ref:content.customDataDefinition.template]] column with `{{unit \"m\"}}` (see also [unit template](./templates#unit-automatic-unit-scaling)) to add units at display time. Entering `5 m - 6 m` in a cell would be interpreted as text and not parse correctly.",
      },
      {
        type: "tip",
        text: "When the [unit template](./templates#unit-automatic-unit-scaling) is configured (e.g. `{{unit \"cm\"}}`), it is applied to each endpoint independently, data `10 - 15` producing `10 cm - 15 cm`."
      },
    ],
  },
};

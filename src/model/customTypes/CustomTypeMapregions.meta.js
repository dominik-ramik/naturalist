import { filterMetaMapregions } from "../filterPlugins/filterPluginMapregions.meta.js";

export const customTypeMapregionsMeta = {
  dataType:   "mapregions",
  filterMeta: filterMetaMapregions,
  meta: {
    summary:                  "Geographic distribution data encoded as region code / status / note tuples. Rendered as a coloured SVG map in the Details pane and as an inline text list of region names in the taxon card.",
    whenToUse:                "Any geographic distribution data where you want an interactive choropleth map and/or an inline region list in the taxon card.",
    behaviorFulltextIndexing: "Region names (resolved from the [[ref:appearance.mapRegionsNames]] table) are indexed for full-text search.",
    detailsPaneTab:           "Map",
    inputFormats: [
      {
        label:  "Format 1: Inline single cell",
        syntax: "All regions in one cell, separated by `|`. Each region: `RegionCode:Status#Note1#Note2`. Status and notes are optional. Escape a literal `#` as `\\#`.",
        example: { columns: ["distribution"], rows: [["fr:native#Verified 2022 | de:introduced | gb"]] },
      },
      {
        label:  "Format 2: Per-column",
        syntax: "Each region has its own column `<columnname>.<regioncode>`. Cell content: `Status#Note`.",
        example: { columns: ["map.fr", "map.de", "map.gb"], rows: [["native", "introduced#2015", ""]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "The **Template** column must specify the SVG file path for the Details pane map to appear - e.g. `maps/world.svg`. Without a template, only the inline region name list is rendered. Region codes and their display names are defined in [[ref:appearance.mapRegionsNames]].",
      },
      {
        type: "tip",
        text: "For the world SVG map, the special codes `fr`, `nl`, and `cn` are automatically remapped to `frx`, `nlx`, and `cnx` to handle overseas territories correctly. This remapping applies only to files named `world.svg`.",
      },
    ],
  },
};

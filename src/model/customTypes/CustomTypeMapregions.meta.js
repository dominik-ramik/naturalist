import { filterMetaMapregions } from "../filterPlugins/filterPluginMapregions.meta.js";

export const customTypeMapregionsMeta = {
  dataType: "mapregions",
  filterMeta: filterMetaMapregions,
  meta: {
    summary:
      "Encodes geographic distribution as a set of region / status / note tuples. Renders as a colour-coded SVG choropleth map in the Details pane and as an annotated inline text list of region names in the taxon card. The two outputs can be used independently or together.",

    whenToUse:
      "Any geographic distribution data where you want an interactive coloured map, a filterable region list, or both. Works equally well for simple presence/absence, named qualitative statuses (native / introduced / extirpated), and numeric data (counts, scores, measurements) rendered as a gradient or stepped colour ramp. Three things are needed together: (1) region codes and status values in the data sheet, (2) a row per region code in the [[ref:appearance.mapRegionsNames]] table, and (3) colour rules in the [[ref:appearance.mapRegionsLegend]] table. The **Template** column in Custom Data Definition must hold the SVG file path (e.g. `maps/europe.svg`) for the choropleth map to appear - without it, only the inline text list renders. See [Distribution maps with mapregions](/author-guide/mapregions) for the full mental model, SVG authoring guidance, and worked examples.",

    behaviorFulltextIndexing:
      "Region names (resolved from the [[ref:appearance.mapRegionsNames]] table) are indexed for full-text search.",

    detailsPaneTab: "Map",

    inputFormats: [
      {
        label: "Format 1: Inline (single cell)",
        syntax:
          "All regions in one cell, separated by `|`. Each region entry: `RegionCode:Status#Note1#Note2`. Status and notes are optional. Escape a literal `#` inside a note as `\\#`.",
        example: {
          columns: ["distribution"],
          rows: [["fr:native#Verified 2022 | de:introduced | gb"]],
        },
      },
      {
        label: "Format 2: Per-column",
        syntax:
          "Each region has its own column `<columnname>.<regioncode>`. Cell content: `Status#Note`. An empty cell means the taxon is absent from that region. Auto-detected: if sub-columns exist the per-column format is used; otherwise the single-cell inline format is used.",
        example: {
          columns: ["map.fr", "map.de", "map.gb"],
          rows: [["native", "introduced#2015", ""]],
        },
      },
    ],

    notes: [
      {
        type: "tip",
        text:
          "The **Template** column must specify the SVG file path for the Details pane map to appear - e.g. `maps/world.svg`. Without a Template value, only the inline region name list is rendered. The world SVG shipped with NaturaList is ready to use; you can also place your own SVG maps in `usercontent/maps/`.",
      },
      {
        type: "tip",
        text:
          "For the world SVG map, the special codes `fr`, `nl`, and `cn` are automatically remapped to `frx`, `nlx`, and `cnx` to handle overseas territories correctly. Your data sheet and [[ref:appearance.mapRegionsNames]] table continue to use `fr`, `nl`, `cn` - only the SVG element `class` attributes need to carry `frx`, `nlx`, `cnx`. This remapping applies only to filenames ending in `world.svg`.",
      },
      {
        type: "info",
        text:
          "Region codes must be all-lowercase letters a–z only (no digits, no hyphens). Every code that appears in data must have a matching row in the [[ref:appearance.mapRegionsNames]] table, or an error is logged at compile time.",
      },
    ],
  },
};
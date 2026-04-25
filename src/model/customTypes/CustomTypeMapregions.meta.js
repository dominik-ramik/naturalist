import { filterMetaMapregions } from "../filterPlugins/filterPluginMapregions.meta.js";

export const customTypeMapregionsMeta = {
  dataType: "mapregions",
  filterMeta: filterMetaMapregions,
  meta: {
    summary:
      "Encodes geographic distribution as a set of `region` / `status` / `note` (optional) tuples. Renders in two ways: as a color-coded SVG choropleth map in the [Details pane](/user-guide/taxon-details) and as an annotated inline text list of region names in the taxon card. The two outputs can be used independently or together.",

    whenToUse:
      "Any geographic distribution data where you want a colored choropleth map, a filterable region list, or both. Works equally well for simple presence/absence, named qualitative statuses (native / introduced / extirpated), and numeric data (counts, scores, measurements) rendered as a gradient or binned color ramp.\n\nThree things are needed together:\n\n- Region codes and status values (with optional notes) in the [[ref:data]] sheet\n\n- A row per region code in the [[ref:appearance.mapRegionsNames]] table\n\n- Color rules in the [[ref:appearance.mapRegionsLegend]] table. The [[ref:content.customDataDefinition.template]] column in Custom Data Definition must hold the SVG file path (e.g. `maps/europe.svg`) for the choropleth map to appear - without it, only the inline text list renders.\n\nSee [Distribution maps with mapregions](./mapregions) for the full mental model, SVG authoring guidance, and worked examples.",

    behaviorFulltextIndexing:
      "Region names (resolved from the [[ref:appearance.mapRegionsNames]] table) are indexed for full-text search. Categorical and numerical status values as well as individual occurrence notes are indexed as text",

    dwcNotes: {
      output: "none, the [[ref:type.mapregions]] doesn't map to any DwC fields.",
      subPaths: []
    },

    detailsPaneTab: "Map",

    inputFormats: [
      {
        label: "Format 1: Inline (single cell)",
        syntax:
          "All regions in one cell, separated by `|`. Each region entry: `RegionCode:Status#Note1#Note2`. Status and notes are optional and can contain Markdown and `@citekeys` from [[ref:content.bibliography]] as well as shortcodes from [[ref:content.databaseShortcodes]]. Escape a literal `#` inside a note as `\\#`. This is very compact and potentially less readable, the best use case is when your data is generated from an [external database](./workbook-structure#scripted-and-automated-data-integration).",
        example: {
          columns: ["distribution", "[comment]"],
          rows: [["fr:native#verified in 2021 by @smith2022 | de:introduced", "This could render: **France** *(native, verified in 2021 by [Smith et al., 2022](#))*, **Germany** *(introduced)*"]],
        },
      },
      {
        label: "Format 2: Per-column",
        syntax:
          "Each region has its own column `[columnname].[regioncode]`. Cell content: `Status#Note`. An empty cell means no data from this region. Auto-detected: if sub-columns exist the per-column format is used; otherwise the single-cell inline format is used.",
        example: {
          text: "This is equivalent to the previous example (note the distribution.gb with no data), but more readable and easier to edit manually:",
          columns: ["distribution.fr", "distribution.de", "distribution.gb"],
          rows: [["native # verified in 2021 by @smith2022", "introduced", ""]],
        },
      },
    ],

    notes: [
      {
        type: "tip",
        text:
          "The [[ref:content.customDataDefinition.template]] column must specify the SVG file path for the Details pane map to appear - e.g. `maps/world.svg`. Without a Template value, only the inline region name list is rendered. The world SVG shipped with NaturaList is ready to use; you can also place your own SVG maps in `usercontent/maps/`.",
      },
      {
        type: "tip",
        text:
          "For the world SVG map, the special codes `fr`, `nl`, and `cn` are automatically remapped to `frx`, `nlx`, and `cnx` to handle overseas territories correctly. Your data sheet and [[ref:appearance.mapRegionsNames]] table continue to use `fr`, `nl`, `cn` - only the SVG element `class` attributes need to carry `frx`, `nlx`, `cnx`. This remapping applies only to filenames ending in `world.svg`.",
      },
    ],
  },
};
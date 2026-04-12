import m from "mithril";

import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { relativeToUsercontent } from "../../components/Utils.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";

export let customTypeMap = {
  dataType: "map",
  meta: {
    summary: "A static map image (JPG, PNG, SVG, PDF, etc.) displayed as a clickable thumbnail in the taxon card, or in the **Map** tab of the Details pane. Use this for scanned range maps or distribution maps as static image files — for interactive SVG region maps, use `mapregions` instead.",
    whenToUse: "Scanned range maps, hand-drawn distribution maps, or any static image that represents geographic information for a taxon.",
    behaviorFulltextIndexing: "The map title is indexed for full-text search.",
    detailsPaneTab: "Map",
    inputFormats: [
      {
        label: "Two columns (source + title)",
        syntax: "`<columnname>.source` and `<columnname>.title` as separate columns. Source is a path or URL to any image file.",
        example: { columns: ["rangemap.source", "rangemap.title"], rows: [["maps/litoria_range.png", "Known range"], ["https://example.org/map.svg", "Modelled range"]] },
      },
      {
        label: "Single column — pipe-separated",
        syntax: "`source|title` in one cell.",
        example: { columns: ["rangemap"], rows: [["maps/litoria_range.png|Known range"]] },
      },
    ],
    notes: [],
  },
  filterPlugin: filterPluginText,
  readData: function (context, computedPath) {
    let mapData = readDataFromPath(
      context,
      computedPath,
      {
        errorMessageTemplate: (columnNames) =>
          tf("dm_generic_column_names", [
            "map",
            computedPath,
            String.join(", ", columnNames),
          ]),
      },
      ["source", "title"]
    );

    if (
      (typeof mapData === "string" && mapData.length == 0) ||
      mapData == null
    ) {
      // If the text is an empty string, return null
      return null;
    }

    return mapData;
  },
  
  /**
   * Extract searchable text from map data
   * @param {any} data - The map object with source and title
   * @param {Object} uiContext - UI context (optional)
   * @returns {string[]} Array of searchable strings
   */
  getSearchableText: function(data, uiContext) {
    if (!data || typeof data !== "object") return [];
    const result = [];
    if (data.title) result.push(data.title);
    return result;
  },
  
  render: function (data, uiContext) {
    if (!data || data.source.toString().trim() === "") {
      return null;
    }

    let source = data.source;
    let title = data.title;
    
    source = helpers.processTemplate(source, uiContext);

    // Default image rendering
    source = relativeToUsercontent(source);

    const imageElement = m(
      "span.image-in-view-wrap.fullscreenable-image.clickable[title=" +
        title +
        "]",
      {
        onclick: function (e) {
          this.classList.toggle("fullscreen");
          this.classList.toggle("clickable");
          e.preventDefault();
          e.stopPropagation();
        },
      },
      m("img.image-in-view[src=" + source + "][alt=" + title + "]")
    );

    if (uiContext.placement === "details") {
      return m("div", [
        imageElement,
        title ? m(".title", title) : null,
      ]);
    } else {
      return imageElement;
    }
  },
};
import m from "mithril";

import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";
import { applyHighlight } from "../highlightUtils.js";

export let customTypeMap = {
  dataType: "map",

  filterPlugin: filterPluginText,
  readData: function (context, computedPath) {
    let mapData = readDataFromPath(
      context,
      computedPath,
      "map",
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
  getSearchableText: function (data, uiContext) {
    if (!data || typeof data !== "object") return [];
    const result = [];
    if (data.title) result.push(data.title);
    return result;
  },
  extractFilterLeafValues: function (data, _path) {
    if (!data || typeof data !== "object") return [];
    return data.title ? [data.title] : [];
  },
  render: function (data, uiContext) {
    if (!data || data.source.toString().trim() === "") {
      return null;
    }

    let source = data.source;
    let title = data.title;

    source = helpers.processSource(source, uiContext);

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
        title ? m(".title", applyHighlight(title, uiContext?.highlightRegex)) : null,
      ]);
    } else {
      return imageElement;
    }
  },
};
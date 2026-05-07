import m from "mithril";

import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";
import { applyHighlight } from "../HighlightUtils.js";
import { FullscreenableMedia } from "../../components/FullscreenableMedia.js";

export let customTypeMap = {
  dataType: "map",
  expectedColumns: (basePath) => [basePath, `${basePath}.source`, `${basePath}.title`],


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

  getPreloadableAssetPaths: function (mediaItem, rowTemplate, entry) {
    if (!mediaItem || typeof mediaItem !== "object") return [];
    const source = mediaItem.source;
    if (!source || source.trim() === "") return [];
    return [helpers.processSourceForPreload(source, rowTemplate, entry)];
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

  toDwC: function (data, subPath) {
    // For DwC export, we use media: directive for media files, not direct column names
    return null;
  },

render: function (data, uiContext) {
    if (!data || data.source.toString().trim() === "") {
      return null;
    }

    const title = data.title || "";

    const { fullSource, thumbSource } =
      helpers.processSourceBothVariants(data.source, uiContext);

    const imageElement = m(FullscreenableMedia, {
      fullSrc:  fullSource,
      thumbSrc: thumbSource,
      title,
      extraWrapClass: "image-in-view-wrap",
    });

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
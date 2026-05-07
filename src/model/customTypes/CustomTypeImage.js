import m from "mithril";

import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { processMarkdownWithBibliography } from "../../components/Utils.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";
import { applyHighlight } from "../HighlightUtils.js";
import { FullscreenableMedia } from "../../components/FullscreenableMedia.js";

export let customTypeImage = {
  dataType: "image",
  expectedColumns: (basePath) => [basePath, `${basePath}.source`, `${basePath}.title`],


  filterPlugin: filterPluginText,
  readData: function (context, computedPath) {
    let imageData = readDataFromPath(
      context,
      computedPath,
      "image",
      ["source", "title"]
    );

    if (
      (typeof imageData === "string" && imageData.length == 0) ||
      imageData == null
    ) {
      // If the text is an empty string, return null
      return null;
    }

    return imageData;
  },

  getPreloadableAssetPaths: function (mediaItem, rowTemplate, entry) {
    if (!mediaItem || typeof mediaItem !== "object") return [];
    const source = mediaItem.source;
    if (!source || source.trim() === "") return [];
    return [helpers.processSourceForPreload(source, rowTemplate, entry)];
  },
  /**
   * Extract searchable text from image data
   * @param {any} data - The image object with source and title
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

    let title = data.title;

    const { fullSource, thumbSource } =
      helpers.processSourceBothVariants(data.source, uiContext);

    // Interpret the title as Markdown (strip tags for plain-text tooltip/alt)
    if (title && title.trim() !== "") {
      title = processMarkdownWithBibliography(title).replace(/<[^>]+>/g, "").trim();
    }

    const imageElement = m(FullscreenableMedia, {
      fullSrc: fullSource,
      thumbSrc: thumbSource,
      title: title || "",
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
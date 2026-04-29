import m from "mithril";

import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";
import { applyHighlight } from "../highlightUtils.js";

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

    let title = data.title;

    // Resolve both the full-size and thumbnail source URLs.
    // When the template uses plain {{value}} (or has no template), both will
    // be identical and the swap logic below is a no-op — backward compatible.
    const { fullSource, thumbSource } =
      helpers.processSourceBothVariants(data.source, uiContext);

    const imageElement = m(
      "span.image-in-view-wrap.fullscreenable-image.clickable[title=" + title + "]",
      {
        onclick: function (e) {
          const wrap = this;
          const img  = wrap.querySelector("img.image-in-view");
          const goingFullscreen = !wrap.classList.contains("fullscreen");

          wrap.classList.toggle("fullscreen");
          wrap.classList.toggle("clickable");

          if (goingFullscreen) {
            const full  = img.dataset.fullsrc;
            const thumb = img.dataset.thumbsrc;
            if (full && full !== thumb) {
              // Thumbnail is already showing (precached). Background-load the
              // full-resolution map image; swap once ready. Silently keeps the
              // thumbnail if the network request fails (offline fallback).
              const loader = new window.Image();
              loader.onload = function () {
                if (wrap.classList.contains("fullscreen")) {
                  img.src = full;
                }
              };
              loader.src = full;
            }
          } else {
            // Returning from fullscreen: restore thumbnail to free the large
            // decoded bitmap from memory.
            const thumb = img.dataset.thumbsrc;
            if (thumb) img.src = thumb;
          }

          e.preventDefault();
          e.stopPropagation();
        },
      },
      m("img.image-in-view", {
        src:             thumbSource,
        alt:             title,
        "data-thumbsrc": thumbSource,
        "data-fullsrc":  fullSource,
      })
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
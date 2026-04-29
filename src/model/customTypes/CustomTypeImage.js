import m from "mithril";

import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { processMarkdownWithBibliography } from "../../components/Utils.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";
import { applyHighlight } from "../highlightUtils.js";

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

    // Resolve both the full-size and thumbnail source URLs.
    // When the template uses plain {{value}} (or has no template), both will
    // be identical and the swap logic below is a no-op — backward compatible.
    const { fullSource, thumbSource } =
      helpers.processSourceBothVariants(data.source, uiContext);

    // Interpret the title as Markdown
    if (title && title.trim() !== "") {
      title = processMarkdownWithBibliography(title).replace(/<[^>]+>/g, "").trim();
    }

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
              // The thumbnail is already showing (precached). Kick off a
              // background load for the full version; swap it in once ready
              // so the user sees maximum quality without waiting for it up
              // front. If the load fails (offline) the thumb stays — no error.
              const loader = new window.Image();
              loader.onload = function () {
                // Guard: user may have closed fullscreen before load finished.
                if (wrap.classList.contains("fullscreen")) {
                  img.src = full;
                }
              };
              loader.src = full;
            }
          } else {
            // Returning from fullscreen: restore the thumbnail so the large
            // decoded bitmap isn't held in memory unnecessarily.
            const thumb = img.dataset.thumbsrc;
            if (thumb) img.src = thumb;
          }

          e.preventDefault();
          e.stopPropagation();
        },
      },
      m("img.image-in-view", {
        src:              thumbSource,
        alt:              title,
        "data-thumbsrc":  thumbSource,
        "data-fullsrc":   fullSource,
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
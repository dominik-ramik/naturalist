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
  render: function (data, uiContext) {
    //console.log("Rendering ReaderImage with data:", data, "and uiContext:", uiContext);
    if (!data || data.source.toString().trim() === "") {
      return null;
    }

    let source = data.source;
    let title = data.title;

    source = helpers.processSource(source, uiContext);

    // Interpret the title as Markdown
    if (title && title.trim() !== "") {
      let processedTitle = processMarkdownWithBibliography(title).replace(/<[^>]+>/g, "").trim();
      title = processedTitle;
    }

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
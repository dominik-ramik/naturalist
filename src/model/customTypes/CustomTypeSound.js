import m from "mithril";

import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { MinimalAudioPlayer } from "../../components/MinimalAudioPlayer.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";
import { applyHighlight } from "../highlightUtils.js";

export let customTypeSound = {
  dataType: "sound",
  expectedColumns: (basePath) => [basePath, `${basePath}.source`, `${basePath}.title`],


  filterPlugin: filterPluginText,

  readData: function (context, computedPath) {
    let soundData = readDataFromPath(
      context,
      computedPath,
      "sound",
      ["source", "title"]
    );

    if (
      (typeof soundData === "string" && soundData.length == 0) ||
      soundData == null
    ) {
      // If the text is an empty string, return null
      return null;
    }

    return soundData;
  },
  /**
   * Extract searchable text from sound data
   * @param {any} data - The sound object with source and title
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

    return m(
      ".media-sound",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
        },
      },
      [m(MinimalAudioPlayer, { src: source }),
      title ? m(".title", applyHighlight(title, uiContext?.highlightRegex)) : null
      ]
    );
  },
};
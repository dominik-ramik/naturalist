import m from "mithril";

import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { relativeToUsercontent } from "../../components/Utils.js";
import { MinimalAudioPlayer } from "../../components/MinimalAudioPlayer.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";

export let customTypeSound = {
  dataType: "sound",

  meta: {
    summary: "An audio file, rendered as a minimal inline audio player with a play button and title. Supports relative paths (resolved from `usercontent/`) and absolute URLs.",
    whenToUse: "Bird calls, animal vocalisations, insect sounds, or any audio recording associated with a taxon.",
    behaviorFulltextIndexing: "The sound title is indexed for full-text search.",
    detailsPaneTab: "Media",
    inputFormats: [
      {
        label: "Two columns (source + title)",
        syntax: "`<columnname>.source` and `<columnname>.title` as separate columns. Source is a path or URL to an audio file.",
        example: { columns: ["call.source", "call.title"], rows: [["sounds/litoria_call.mp3", "Advertisement call"]] },
      },
      {
        label: "Single column — pipe-separated",
        syntax: "`source|title` in one cell.",
        example: { columns: ["call"], rows: [["sounds/litoria_call.mp3|Advertisement call"]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "Supported formats are whatever the user's browser supports natively — typically MP3, OGG, WAV, AAC. Use a **Template** such as `sounds/{{value}}.mp3` to enter only the base filename in each cell.",
      },
    ],
  },

  filterPlugin: filterPluginText,

  readData: function (context, computedPath) {
    let soundData = readDataFromPath(
      context,
      computedPath,
      {
        errorMessageTemplate: (columnNames) =>
          tf("dm_generic_column_names", [
            "sound",
            computedPath,
            String.join(", ", columnNames),
          ]),
      },
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
  render: function (data, uiContext) {
    if (!data || data.source.toString().trim() === "") {
      return null;
    }

    let source = data.source;
    let title = data.title;

    // Process template if available
    source = helpers.processTemplate(source, uiContext);

    source = relativeToUsercontent(source);

    return m(
      ".media-sound",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
        },
      },
      [m(MinimalAudioPlayer, { src: source }), title ? m(".title", title) : null]
    );
  },
};
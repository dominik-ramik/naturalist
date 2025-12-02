import m from "mithril";

import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { relativeToUsercontent } from "../../components/Utils.js";
import { Checklist } from "../Checklist.js";
import { _tf } from "../I18n.js";
import { MinimalAudioPlayer } from "../../components/MinimalAudioPlayer.js";

export let readerSound = {
  dataType: "sound",
  readData: function (context, computedPath) {
    let soundData = readDataFromPath(
      context,
      computedPath,
      {
        errorMessageTemplate: (columnNames) =>
          _tf("dm_generic_column_names", [
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
    if (data.source) result.push(data.source);
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
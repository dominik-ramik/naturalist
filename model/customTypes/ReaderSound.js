import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { relativeToUsercontent } from "../../components/Utils.js";
import { Checklist } from "../Checklist.js";
import { _tf } from "../I18n.js";

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
  dataToUI: function (data, uiContext) {
    if (!data || data.source.toString().trim() === "") {
      return null;
    }

    let source = data.source;
    let title = data.title;

    // Process template if available
    source = helpers.processTemplate(source, uiContext);

    source = relativeToUsercontent(source);

    return m(".media-sound", [
      m("audio[controls=controls][controlslist=nodownload]", {
        oncontextmenu: (e) => {
          return false;
        },
      }, [
        m("source[src=" + source + "]"),
      ]),
      m(".title", title),
    ]);
  },
};
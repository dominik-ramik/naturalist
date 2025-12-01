import m from "mithril";

import { readDataFromPath } from "../ReadDataFromPath.js";
import { processMarkdownWithBibliography } from "../../components/Utils.js";
import { Checklist } from "../Checklist.js";

export let readerText = {
  dataType: "text",
  readData: function (context, computedPath) {
    let text = readDataFromPath(context, computedPath, {});

    if (typeof text === "string" && text.length == 0) {
      // If the text is an empty string, return null
      return null;
    }

    return text;
  },
  render: function (data, uiContext) {
    if (data === null || data === undefined || data.toString().trim() === "" ) {
      return null;
    }

    let processedData = data.toString().trim();    
    return processedData;
  },
};

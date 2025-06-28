import { readDataFromPath } from "./index.js";

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
  dataToUI: function (data) {
    return "UI: " + data;
  },
};

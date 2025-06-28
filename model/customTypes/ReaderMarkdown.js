import { readDataFromPath } from "./index.js";

export let readerMarkdown = {
  dataType: "markdown",
  readData: function (context, computedPath) {
    let value = readDataFromPath(context, computedPath, {});

    return value;
  },
  dataToUI: function (data) {
    return "UI: " + data;
  },
};

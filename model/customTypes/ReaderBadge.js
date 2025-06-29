import { readDataFromPath } from "./index.js";

export let readerBadge = {
  dataType: "badge",
  readData: function (context, computedPath) {
    let badgeText = readDataFromPath(context, computedPath, {});

    if ((typeof badgeText === "string" && badgeText.length == 0) || badgeText == null) {
      // If the text is an empty string, return null
      return null;
    }

    console.log("Badge text read from path:", computedPath, badgeText);

    return badgeText;
  },
  renderData: function (data, uiContext) {
    return "UI: " + data;
  },
};

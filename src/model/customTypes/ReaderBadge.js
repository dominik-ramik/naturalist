import m from "mithril";

import { readDataFromPath } from "../ReadDataFromPath.js";

export let readerBadge = {
  dataType: "badge",
  readData: function (context, computedPath) {
    let value = readDataFromPath(context, computedPath, {});
    return value;
  },
  render: function (data, uiContext) {
    if (data === null || data === undefined || data.toString().trim() === "") {
      return null;
    }

    // Convert data to string to ensure string methods work
    const dataString = data.toString();

    function purifyCssString(css) {
      if (css.indexOf('"') >= 0) {
        css = css.substring(0, css.indexOf('"'));
      }
      if (css.indexOf("'") >= 0) {
        css = css.substring(0, css.indexOf("'"));
      }
      if (css.indexOf(";") >= 0) {
        css = css.substring(0, css.indexOf(";"));
      }
      if (css.indexOf(":") >= 0) {
        css = css.substring(0, css.indexOf(":"));
      }
      return css;
    }

    let badgeMeta = uiContext.meta.badges;
    let badgeFormat = badgeMeta.find(function (possibleFormat) {
      let possibleFormatCured = possibleFormat.contains
        .toLowerCase()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); //escape characters for RegEx

      var reg = new RegExp(possibleFormatCured, "gi");
      return reg.test(dataString.toLowerCase());
    });

    if (badgeFormat) {
      return m.trust(
        "<span class='badge' style='" +
          (badgeFormat.background
            ? "background-color: " + purifyCssString(badgeFormat.background) + ";"
            : "") +
          (badgeFormat.text
            ? "color: " + purifyCssString(badgeFormat.text) + ";"
            : "") +
          (badgeFormat.border
            ? "border-color: " + purifyCssString(badgeFormat.border) + ";"
            : "") +
          "'>" +
          dataString.replace(/\s/g, "&nbsp;") +
          "</span>"
      );
    }

    return dataString.trim();
  },
};
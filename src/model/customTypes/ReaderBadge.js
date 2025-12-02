import m from "mithril";
import { helpers } from "./helpers.js";

export let readerBadge = {
  dataType: "badge",
  readData: function (context, computedPath) {
    const { headers, row, langCode } = context;
    let columnIndex = headers.indexOf(computedPath.toLowerCase());

    if (columnIndex < 0) {
      columnIndex = headers.indexOf(
        computedPath.toLowerCase() + ":" + langCode
      );
    }

    if (columnIndex < 0 || row[columnIndex] === undefined) {
      return null;
    }

    let value = row[columnIndex].toString().trim();

    if (value === "") {
      return null;
    }

    // Apply data code transformation
    value = helpers.processPossibleDataCode(computedPath, value, langCode);

    return value;
  },

  /**
   * Extract searchable text from badge data
   * @param {any} data - The badge value
   * @param {Object} uiContext - UI context (optional)
   * @returns {string[]} Array of searchable strings
   */
  getSearchableText: function (data, uiContext) {
    if (!data || typeof data !== "string") return [];
    return [data];
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
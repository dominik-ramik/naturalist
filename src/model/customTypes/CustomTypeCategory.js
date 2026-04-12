import m from "mithril";
import { helpers } from "./helpers.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";

export let customTypeCategory = {
  dataType: "category",
  meta: {
    summary: "Categorical text value rendered as a coloured pill/badge. Identical data reading to `text` but looks up the value in the Colored Categories table for visual styling.",
    whenToUse: "Any column with a small, fixed set of categorical values that benefit from colour coding — Red List categories, presence/origin status, life-form codes, etc.",
    behaviorFulltextIndexing: "The string value (after Data Code replacement) is indexed.",
    detailsPaneTab: "Text",
    inputFormats: [
      {
        label: "Single cell",
        syntax: "Any string value. Data Code replacement applies first. The result is then matched against the Colored Categories table using a case-insensitive substring match.",
        example: { columns: ["redlist"], rows: [["LC"], ["EN"], ["CR"]] },
      },
    ],
    notes: [
      {
        type: "warning",
        text: "The Colored Categories table in `nl_appearance` must be populated for this type to show coloured badges. Setting the formatting to `category` alone does nothing visual without corresponding category definitions.",
      },
    ],
  },
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
   * Extract searchable text from category data
   * @param {any} data - The category value
   * @param {Object} uiContext - UI context (optional)
   * @returns {string[]} Array of searchable strings
   */
  getSearchableText: function (data, uiContext) {
    if (!data || typeof data !== "string") return [];
    return [data];
  },

  filterPlugin: filterPluginText,

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

    let badgeMeta = uiContext.meta.categories;
    let badgeFormat = badgeMeta.find(function (possibleFormat) {
      let possibleFormatCured = possibleFormat.contains
        .toLowerCase()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); //escape characters for RegEx

      var reg = new RegExp(possibleFormatCured, "gi");
      return reg.test(dataString.toLowerCase());
    });

    if (badgeFormat) {
      return m.trust(
        "<span class='category' style='" +
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
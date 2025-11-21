import m from "mithril";

import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { relativeToUsercontent } from "../../components/Utils.js";
import { Checklist } from "../Checklist.js";
import { _tf, _t } from "../I18n.js";

export let readerMap = {
  dataType: "map",
  readData: function (context, computedPath) {
    let mapData = readDataFromPath(
      context,
      computedPath,
      {
        errorMessageTemplate: (columnNames) =>
          _tf("dm_generic_column_names", [
            "map",
            computedPath,
            String.join(", ", columnNames),
          ]),
      },
      ["source", "title"]
    );

    if (
      (typeof mapData === "string" && mapData.length == 0) ||
      mapData == null
    ) {
      // If the text is an empty string, return null
      return null;
    }

    return mapData;
  },
  dataToUI: function (data, uiContext) {
    if (!data || data.source.toString().trim() === "") {
      return null;
    }

    let source = data.source;
    let title = data.title;
    
    source = helpers.processTemplate(source, uiContext);

    // Default image rendering
    source = relativeToUsercontent(source);

    const imageElement = m(
      "span.image-in-view-wrap.fullscreenable-image.clickable[title=" +
        title +
        "]",
      {
        onclick: function (e) {
          this.classList.toggle("fullscreen");
          this.classList.toggle("clickable");
          e.preventDefault();
          e.stopPropagation();
        },
      },
      m("img.image-in-view[src=" + source + "][alt=" + title + "]")
    );

    if (uiContext.placement === "details") {
      return m("div", [
        imageElement,
        title ? m(".title", title) : null,
      ]);
    } else {
      return imageElement;
    }
  },
};
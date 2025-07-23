import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { relativeToUsercontent } from "../../components/Utils.js";
import { Checklist } from "../Checklist.js";
import { _tf } from "../I18n.js";

export let readerImage = {
  dataType: "image",
  readData: function (context, computedPath) {
    let imageData = readDataFromPath(
      context,
      computedPath,
      {
        errorMessageTemplate: (columnNames) =>
          _tf("dm_generic_column_names", [
            "image",
            computedPath,
            String.join(", ", columnNames),
          ]),
      },
      ["source", "title"]
    );

    if (
      (typeof imageData === "string" && imageData.length == 0) ||
      imageData == null
    ) {
      // If the text is an empty string, return null
      return null;
    }

    return imageData;
  },
  dataToUI: function (data, uiContext) {
    if (!data || data.source.toString().trim() === "") {
      return null;
    }

    let source = data.source;
    let title = data.title;

    // Process template if available
    if (
      uiContext.meta.template != "" &&
      Checklist.handlebarsTemplates[uiContext.dataPath]
    ) {
      let templateData = Checklist.getDataObjectForHandlebars(
        source,
        uiContext.originalData,
        uiContext.taxon.name,
        uiContext.taxon.authority
      );
      source = Checklist.handlebarsTemplates[uiContext.dataPath](templateData);
    }

    source = relativeToUsercontent(source);

    return m(
      "span.image-in-view-wrap.fullscreenable-image.clickable[title=" +
        title +
        "]",
      {
        onclick: function () {
          this.classList.toggle("fullscreen");
        },
      },
      m("img.image-in-view[src=" + source + "][alt=" + title + "]")
    );
  },
};
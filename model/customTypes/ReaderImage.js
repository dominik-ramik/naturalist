import { helpers } from "./helpers.js";
import { readDataFromPath } from "../ReadDataFromPath.js";
import { processMarkdownWithBibliography, relativeToUsercontent } from "../../components/Utils.js";
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
    //console.log("Rendering ReaderImage with data:", data, "and uiContext:", uiContext);
    if (!data || data.source.toString().trim() === "") {
      return null;
    }

    let source = data.source;
    let title = data.title;

    source = helpers.processTemplate(source, uiContext);
    source = relativeToUsercontent(source);

    // Interpret the title as Markdown
    if (title && title.trim() !== "") {
      let processedTitle = processMarkdownWithBibliography(title).replace(/<[^>]+>/g, "").trim();
      title = processedTitle;
    }

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
import m from "mithril";

import { readDataFromPath } from "../ReadDataFromPath.js";
import { processMarkdownWithBibliography } from "../../components/Utils.js";
import { Checklist } from "../Checklist.js";

export let readerMarkdown = {
  dataType: "markdown",
  readData: function (context, computedPath) {
    let value = readDataFromPath(context, computedPath, {});
    return value;
  },
  dataToUI: function (data, uiContext) {
    if (data === null || data === undefined || data.toString().trim() === "") {
      return null;
    }

    let processedData = data;

    // Process template first if available
    if (uiContext.meta.template != "" && Checklist.handlebarsTemplates[uiContext.dataPath]) {
      let templateData = Checklist.getDataObjectForHandlebars(
        data,
        uiContext.originalData,
        uiContext.taxon.name,
        uiContext.taxon.authority
      );
      processedData = Checklist.handlebarsTemplates[uiContext.dataPath](templateData);
    }

    // Process markdown and bibliography fully (consistent with view and other readers)
    processedData = processedData.replace(/\r?\n/g, " $NEWLINE$"); // Normalize line endings - hotfix for edge cases of @citekey at the end of a line for some reason getting the end-of-line char included mark attached to itself and then misinterpreted by the bibliography processor
    processedData = processMarkdownWithBibliography(processedData);
    processedData = processedData.replace(/ \$NEWLINE\$/g, "\n"); // Back from normalization
    return m.trust(processedData);
  },
};

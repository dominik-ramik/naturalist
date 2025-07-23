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

    // Process markdown and bibliography
    processedData = processMarkdownWithBibliography(processedData);
    return m.trust(processedData);
  },
};

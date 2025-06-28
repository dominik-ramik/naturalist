import { _tf } from "../I18n.js";
import { readDataFromPath } from "./index.js";

export let readerTaxon = {
  dataType: "taxon",
  readData: function (context, computedPath) {
    let taxon = readDataFromPath(
      context,
      computedPath,
      {
        errorMessageTemplate: (columnNames) =>
          _tf("dm_taxon_column_names", columnNames),
      },
      ["name", "authority"]
    );

    return taxon;
  },
  dataToUI: function (data) {
    return "UI: " + data;
  },
};

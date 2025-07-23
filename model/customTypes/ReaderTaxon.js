import { ClickableTaxonName } from "../../view/ClickableTaxonNameView.js";
import { _tf } from "../I18n.js";
import { readDataFromPath } from "../ReadDataFromPath.js";

export let readerTaxon = {
  dataType: "taxon",
  readData: function (context, computedPath) {
    let taxon = readDataFromPath(context, computedPath, this.dataType, [
      "name",
      "authority",
    ]);

    return taxon;
  },
  dataToUI: function (data, uiContext) {
    // If data has taxonTree structure, use it directly
    if (data && data.taxonTree && data.taxonTree.taxon) {
      return m(ClickableTaxonName, {
        taxonTree: {
          taxon: data.taxonTree.taxon,
          data: {},
          children: {},
        },
      });
    }

    // Otherwise, treat data as the taxon name directly
    return m(ClickableTaxonName, {
      taxonTree: {
        taxon: data,
        data: {},
        children: {},
      },
    });
  },
};

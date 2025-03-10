import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { filterMatches,  routeTo,  } from "../components/Utils.js";

export let ClickableTaxonName = {
  view: function (vnode) {
    let nameTag = Checklist.shouldItalicizeTaxon(vnode.attrs.currentTaxonLevel)
      ? "i"
      : "span";
    let taxonTree = vnode.attrs.taxonTree;

    if (taxonTree.taxon.n == "" && taxonTree.taxon.a == "") {
      return null;
    }

    let filterMatch = filterMatches(
      taxonTree.taxon.n + " " + taxonTree.taxon.a
    );

    return m(
      "span.copiable.clickable",
      {
        onclick: function () {
          routeTo(
            "/details/" + taxonTree.taxon.n + "/" + Settings.currentDetailsTab()
          );
        },
      },
      [
        m(
          nameTag +
            ".taxon-name" +
            (filterMatch ? ".found" : "") +
            "[style=font-size: " +
            vnode.attrs.fontSize +
            "%]",
          taxonTree.taxon.n
        ),
        taxonTree.taxon.a == ""
          ? null
          : m(
              "span.taxon-authority[style=font-size: " +
                vnode.attrs.fontSize +
                "%]",
              " " + taxonTree.taxon.a
            ),
      ]
    );
  },
};

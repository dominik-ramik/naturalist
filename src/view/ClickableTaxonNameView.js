import m from "mithril";

import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { filterMatches,  routeTo,  } from "../components/Utils.js";

export let ClickableTaxonName = {
  view: function (vnode) {
    let nameTag = Checklist.shouldItalicizeTaxon(vnode.attrs.currentTaxonLevel)
      ? "i"
      : "span";
    let taxonTree = vnode.attrs.taxonTree;

    if (taxonTree.taxon.name?.trim() == "" && taxonTree.taxon.authority?.trim() == "") {
      return null;
    }

    let filterMatch = filterMatches(
      taxonTree.taxon.name + " " + taxonTree.taxon.authority
    );

    return m(
      "span.copiable.clickable",
      {
        onclick: function () {
          routeTo(
            "/details/" + taxonTree.taxon.name + "/" + Settings.currentDetailsTab()
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
          taxonTree.taxon.name
        ),
        taxonTree.taxon.authority == ""
          ? null
          : m(
              "span.taxon-authority[style=font-size: " +
                vnode.attrs.fontSize +
                "%]",
              " " + taxonTree.taxon.authority
            ),
      ]
    );
  },
};

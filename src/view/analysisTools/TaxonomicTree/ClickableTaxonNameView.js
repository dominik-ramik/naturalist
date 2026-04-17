import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

import { Checklist } from "../../../model/Checklist.js";
import { Settings } from "../../../model/Settings.js";
import { routeTo } from "../../../components/Utils.js";
import { applyHighlight, buildSearchRegex } from "../../../model/highlightUtils.js";

function getTaxonHighlightRegex() {
  const terms = [];

  Object.values(Checklist.filter?.taxa || {}).forEach(fd => {
    if (fd?.matchMode === "exclude" || !Array.isArray(fd?.selected)) return;
    terms.push(...fd.selected.map(String));
  });

  Object.values(Checklist.filter?.data || {}).forEach(fd => {
    if (fd?.type !== "taxon" || fd?.matchMode === "exclude" || !Array.isArray(fd?.selected)) return;
    terms.push(...fd.selected.map(String));
  });

  if (Checklist.filter?.text?.trim()) {
    terms.push(...Checklist.filter.text.split(Settings.SEARCH_OR_SEPARATOR));
  }

  return buildSearchRegex(terms);
}

export let ClickableTaxonName = {
  view: function (vnode) {
    let nameTag = Checklist.shouldItalicizeTaxon(vnode.attrs.currentTaxonLevel)
      ? "i"
      : "span";
    let taxonTree = vnode.attrs.taxonTree;

    if (taxonTree.taxon.name?.trim() == "" && taxonTree.taxon.authority?.trim() == "") {
      return null;
    }

    const highlightRegex = getTaxonHighlightRegex();

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
            ".taxon-name[style=font-size: " +
            vnode.attrs.fontSize +
            "%]",
          applyHighlight(taxonTree.taxon.name, highlightRegex)
        ),
        taxonTree.taxon.authority == ""
          ? null
          : m(
              "span.taxon-authority[style=font-size: " +
                vnode.attrs.fontSize +
                "%]",
              applyHighlight(" " + taxonTree.taxon.authority, highlightRegex)
            ),
      ]
    );
  },
};

import { ClickableTaxonName } from "./ClickableTaxonNameView.js";
import { Checklist } from "../model/Checklist.js";
import { _t } from "../model/I18n.js";
import { copyToClipboard } from "../components/Utils.js";

export let TaxonNameView = {
  view: function (vnode) {
    let inverseTaxonLevel = Checklist.inverseTaxonLevel(
      vnode.attrs.currentTaxonLevel
    );

    let fontSize = 100 + (10 * inverseTaxonLevel - 1);
    if (fontSize > 200) {
      fontSize = 200;
    }

    let parentTaxonIndicator = Checklist.getParentTaxonIndicator(
      vnode.attrs.currentTaxonLevel,
      vnode.attrs.parents
    );

    return m(
      ".taxon-name-inner-wrapper",
      m(ClickableTaxonName, {
        taxonTree: vnode.attrs.taxonTree,
        fontSize: fontSize,
        currentTaxonLevel: vnode.attrs.currentTaxonLevel,
      }),
      inverseTaxonLevel >= 1
        ? m(".copy-to-clipboard-section[style=display: flex;]", [
            m(
              ".copy-leaf-taxon.clickable",
              {
                onclick: function () {
                  copyToClipboard(
                    vnode.attrs.taxonTree.taxon.n +
                      (vnode.attrs.taxonTree.taxon.a
                        ? " " + vnode.attrs.taxonTree.taxon.a
                        : ""),
                    _t("taxon")
                  );
                },
                oncontextmenu: function (e) {
                  // Prevent the default context menu from appearing
                  e.preventDefault();

                  let textToCopy = "";

                  for (const taxon of vnode.attrs.parents) {
                    textToCopy += taxon.n + "\t";
                    if (taxon.a) {
                      textToCopy += taxon.a + "\t";
                    }
                  }
                  textToCopy += vnode.attrs.taxonTree.taxon.n + "\t";
                  if (vnode.attrs.taxonTree.taxon.a) {
                    textToCopy += vnode.attrs.taxonTree.taxon.a + "\t";
                  }

                  textToCopy = textToCopy.trim();

                  copyToClipboard(textToCopy, _t("taxon"));

                  return false; // Prevent default and stop propagation
                },
              },
              m("img[src=img/ui/checklist/copy.svg]")
            ),
          ])
        : null,
      vnode.attrs.currentTaxonLevel > 0 &&
        inverseTaxonLevel >= 1 &&
        parentTaxonIndicator !== null
        ? m(
            ".parent-taxon-indicator.clickable",
            {
              onclick: function (e) {
                Checklist.filter.clear();
                Checklist.filter.taxa[
                  parentTaxonIndicator.rankColumnName
                ].selected = [parentTaxonIndicator.taxon.n];
                Checklist.filter.commit("/checklist");
              },
            },
            _t("in_taxon_group", [
              parentTaxonIndicator.rank.toLowerCase(),
              parentTaxonIndicator.taxon.n,
            ])
          )
        : null
    );
  },
};

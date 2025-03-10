import { ClickableTaxonName } from "./ClickableTaxonNameView.js";
import { Checklist } from "../model/Checklist.js";
import { _t } from "../model/I18n.js";

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
        ? m(
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
            },
            m("img[src=img/ui/checklist/copy.svg]")
          )
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

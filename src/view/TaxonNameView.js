import m from "mithril";

import { ClickableTaxonName } from "./ClickableTaxonNameView.js";
import { Checklist } from "../model/Checklist.js";
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

    const taxaMetaKeys = Object.keys(Checklist.getTaxaMeta());
    const isSparse = vnode.attrs.parents.length < vnode.attrs.currentTaxonLevel;

    let parentTaxonIndicator;
    if (isSparse) {
      // For specimens, offset-based parent lookup is unreliable on sparse t arrays.
      // Look up the full t array from the cache and find the actual last non-null parent.
      const taxonEntry = Checklist.getTaxonByName(vnode.attrs.taxonTree.taxon.name);
      parentTaxonIndicator = null;
      if (taxonEntry && taxonEntry.t) {
        for (let i = vnode.attrs.currentTaxonLevel - 1; i >= 0; i--) {
          if (taxonEntry.t[i] !== null && taxonEntry.t[i] !== undefined) {
            const parentDataPath = taxaMetaKeys[i];
            const parentMeta = Checklist.getTaxaMeta()[parentDataPath];
            parentTaxonIndicator = {
              rank: parentMeta.name,
              rankColumnName: parentDataPath,
              taxon: taxonEntry.t[i],
              offset: vnode.attrs.currentTaxonLevel - i,
            };
            break;
          }
        }
      }
    } else {
      parentTaxonIndicator = Checklist.getParentTaxonIndicator(
        vnode.attrs.currentTaxonLevel,
        vnode.attrs.parents
      );
    }

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
                  vnode.attrs.taxonTree.taxon.name +
                  (vnode.attrs.taxonTree.taxon.authority
                    ? " " + vnode.attrs.taxonTree.taxon.authority
                    : ""),
                  t("taxon")
                );
              },
              oncontextmenu: function (e) {
                // Prevent the default context menu from appearing
                e.preventDefault();

                let textToCopy = "";

                for (const taxon of vnode.attrs.parents) {
                  textToCopy += taxon.name + "\t";
                  if (taxon.authority) {
                    textToCopy += taxon.authority + "\t";
                  }
                }
                textToCopy += vnode.attrs.taxonTree.taxon.name + "\t";
                if (vnode.attrs.taxonTree.taxon.authority) {
                  textToCopy += vnode.attrs.taxonTree.taxon.authority + "\t";
                }

                textToCopy = textToCopy.trim();

                copyToClipboard(textToCopy, t("taxon"));

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
              ].selected = [parentTaxonIndicator.taxon.name];
              Checklist.filter.commit("/checklist");
            },
          },
          t("in_taxon_group", [
            parentTaxonIndicator.rank.toLowerCase(),
            parentTaxonIndicator.taxon.name,
          ])
        )
        : null
    );
  },
};

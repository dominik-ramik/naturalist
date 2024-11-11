import { Settings } from "../model/Settings.js";
import { copyToClipboard, routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { TaxonDataView } from "../view/TaxonDataView.js";
import { _t } from "../model/I18n.js";
import { filterMatches } from "../components/Utils.js";

export let TaxonView = {
    view: function (vnode) {
        let inverseTaxonLevel = Object.keys(Checklist.getTaxaMeta()).length - (vnode.attrs.currentLevel);
        let fontSize = 100 + (8 * inverseTaxonLevel - 1);
        if (fontSize > 200) {
            fontSize = 200;
        }

        let parentTaxonIndicator = Checklist.getParentTaxonIndicator(vnode.attrs.currentLevel, vnode.attrs.parents);

        return m("ul.card.taxon-level" + inverseTaxonLevel, [
            m("li.taxon", [
                m(".taxon-name-stripe", [
                    m(ClickableTaxonName, {
                        taxonTree: vnode.attrs.taxonTree,
                        fontSize: fontSize
                    }),
                    inverseTaxonLevel >= 1 ? m(".copy-leaf-taxon.clickable", {
                        onclick: function () {
                            copyToClipboard(vnode.attrs.taxonTree.taxon.n + (vnode.attrs.taxonTree.taxon.a ? " " + vnode.attrs.taxonTree.taxon.a : ""), _t("taxon"));
                        }
                    }, m("img[src=img/ui/checklist/copy.svg]")) : null,
                    (vnode.attrs.currentLevel > 0 && inverseTaxonLevel >= 1 && parentTaxonIndicator !== null) ? m(".parent-taxon-indicator.clickable", {
                        onclick: function (e) {
                            Checklist.filter.clear();
                            Checklist.filter.taxa[parentTaxonIndicator.rankColumnName].selected = [parentTaxonIndicator.taxon.n];
                            Checklist.filter.commit("/checklist");
                        }
                    }, _t("in_taxon_group", [parentTaxonIndicator.rank.toLowerCase(), parentTaxonIndicator.taxon.n])) : null,
                    m(".spacer"),
                    (vnode.attrs.taxonTree && inverseTaxonLevel > 1 && Object.keys(vnode.attrs.taxonTree.children).length > 0) ? m(".show-all-of-taxon.clickable", {
                        onclick: function (e) {
                            Checklist.filter.clear();
                            let taxonLevelKey = Object.keys(Checklist.filter.taxa)[vnode.attrs.currentLevel];
                            Checklist.filter.taxa[taxonLevelKey].selected = [vnode.attrs.taxonTree.taxon.n];
                            Checklist.filter.commit("/checklist");
                        }
                    }, _t("show_all_of_taxon", [vnode.attrs.taxonTree.taxon.n])) : null,
                ]),
                vnode.attrs.displayMode == "" ? m(TaxonDataView, {
                    taxon: vnode.attrs.taxonTree
                }) : null
            ]),
            Object.keys(vnode.attrs.taxonTree.children).map(function (currentTaxonKey) {
                if (vnode.attrs.displayMode != "" && Object.keys(Checklist.getTaxaMeta()).indexOf(vnode.attrs.displayMode) <= vnode.attrs.currentLevel) {
                    return null;
                }

                return m(TaxonView, {
                    parents: ((vnode.attrs.parents == null || vnode.attrs.parents.length == 0) ? [vnode.attrs.taxonTree.taxon] : [...vnode.attrs.parents, vnode.attrs.taxonTree.taxon]),
                    taxonKey: currentTaxonKey,
                    taxonTree: vnode.attrs.taxonTree.children[currentTaxonKey],
                    currentLevel: vnode.attrs.currentLevel + 1,
                    displayMode: vnode.attrs.displayMode
                });
            })
        ]);
    }
}

export let ClickableTaxonName = {
    view: function (vnode) {
        let taxonTree = vnode.attrs.taxonTree;

        if (taxonTree.taxon.n == "" && taxonTree.taxon.a == "") {
            return null;
        }

        let filterMatch = filterMatches(taxonTree.taxon.n + " " + taxonTree.taxon.a)

        return m("span.copiable.clickable", {
            onclick: function () {
                routeTo('/details/' + taxonTree.taxon.n + '/' + Settings.currentDetailsTab());
            }
        }, [
            m("i.taxon-name" + (filterMatch ? ".found" : "") + "[style=font-size: " + vnode.attrs.fontSize + "%]", taxonTree.taxon.n),
            taxonTree.taxon.a == "" ? null : m("span.taxon-authority[style=font-size: " + vnode.attrs.fontSize + "%]", " " + taxonTree.taxon.a),
        ]);
    }
}
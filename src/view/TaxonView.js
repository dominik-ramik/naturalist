import m from "mithril";

import { Settings } from "../model/Settings.js";
import { copyToClipboard, routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { TaxonDataView } from "../view/TaxonDataView.js";
import { _t } from "../model/I18n.js";
import { filterMatches } from "../components/Utils.js";
import { TaxonNameView } from "./TaxonNameView.js";

export let TaxonView = {
  view: function (vnode) {
    function detailsIcon(taxonName, detailsType) {
      let icon = "";
      let tabName = "";
      switch (detailsType) {
        case "media":
          icon = "media";
          tabName = "media";
          break;
        case "maps":
          icon = "map";
          tabName = "map";
          break;
        case "text":
          icon = "text";
          tabName = "text";
          break;

        default:
          break;
      }

      return m(
        ".show-all-of-taxon.clickable",
        {
          onclick: function (e) {
            routeTo("/details/" + taxonName + "/" + tabName);
          },
        },
        m(".taxon-details-icon", [m("img[src=./img/ui/tabs/" + icon + ".svg]")]),
      );
    }

    const taxonName = vnode.attrs.taxonTree.taxon.name;
    const tabsData = Checklist.getDetailsTabsForTaxon(taxonName);

    let inverseTaxonLevel = Checklist.inverseTaxonLevel(vnode.attrs.currentTaxonLevel);

    const showSearchAll =
      Object.keys(vnode.attrs.taxonTree.children).length > 0;

    function shouldRenderTab(tabsData, tabKey) {
      return (
        tabsData &&
        Object.hasOwn(tabsData, tabKey) &&
        tabsData[tabKey] &&
        tabsData[tabKey].length > 0
      );
    }

    return m("ul.card.taxon-level" + inverseTaxonLevel, [
      m("li.taxon", [
        m(".taxon-name-stripe", [
          m(TaxonNameView, {
            taxonTree: vnode.attrs.taxonTree,
            currentTaxonLevel: vnode.attrs.currentTaxonLevel,
            parents: vnode.attrs.parents
          }),
          m(".spacer"),
          m(".details-icons-wrapper", [
            m(".show-all-of-taxon.clickable",
              {
                onclick: function (e) {
                  routeTo("/single-access-keys/filter/" + taxonName);
                },
              }, m(".taxon-details-icon", [m("img[src=./img/ui/checklist/key_vertical.svg]")])),
            shouldRenderTab(tabsData, "media") &&
            detailsIcon(taxonName, "media"),
            shouldRenderTab(tabsData, "map") &&
            detailsIcon(taxonName, "maps"),
            shouldRenderTab(tabsData, "text") &&
            detailsIcon(taxonName, "text"),
            (shouldRenderTab(tabsData, "media") ||
              shouldRenderTab(tabsData, "map") ||
              shouldRenderTab(tabsData, "text")) &&
            showSearchAll &&
            m(".vertical-separator"),
            vnode.attrs.taxonTree && inverseTaxonLevel > 1 && showSearchAll
              ? m(
                ".show-all-of-taxon.clickable",
                {
                  onclick: function (e) {
                    Checklist.filter.clear();
                    let taxonLevelKey = Object.keys(Checklist.filter.taxa)[
                      vnode.attrs.currentTaxonLevel
                    ];
                    Checklist.filter.taxa[taxonLevelKey].selected = [
                      vnode.attrs.taxonTree.taxon.name,
                    ];
                    Checklist.filter.commit("/checklist");
                  },
                },
                m(".search-all-of-taxon", [
                  m("img[src=./img/ui/checklist/search.svg]"),
                  vnode.attrs.taxonTree.taxon.name,
                ])
              )
              : null,
          ]),
        ]),
        vnode.attrs.displayMode == ""
          ? m(TaxonDataView, {
            taxon: vnode.attrs.taxonTree,
          })
          : null,
      ]),
      Object.keys(vnode.attrs.taxonTree.children).map(function (
        currentTaxonKey
      ) {
        if (
          vnode.attrs.displayMode != "" &&
          Object.keys(Checklist.getTaxaMeta()).indexOf(
            vnode.attrs.displayMode
          ) <= vnode.attrs.currentTaxonLevel
        ) {
          return null;
        }

        return m(TaxonView, {
          parents:
            vnode.attrs.parents == null || vnode.attrs.parents.length == 0
              ? [vnode.attrs.taxonTree.taxon]
              : [...vnode.attrs.parents, vnode.attrs.taxonTree.taxon],
          taxonKey: currentTaxonKey,
          taxonTree: vnode.attrs.taxonTree.children[currentTaxonKey],
          currentTaxonLevel: vnode.attrs.currentTaxonLevel + 1,
          displayMode: vnode.attrs.displayMode,
        });
      }),
    ]);
  },
};

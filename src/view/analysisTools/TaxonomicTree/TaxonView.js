import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

import { Settings } from "../../../model/Settings.js";
import { copyToClipboard, routeTo } from "../../../components/Utils.js";
import { Checklist } from "../../../model/Checklist.js";
import { TaxonDataView } from "./TaxonDataView.js";
import { TaxonNameView } from "./TaxonNameView.js";

import "./TaxonView.css";
import { mdiImageOutline, mdiKeyVariant, mdiMagnify } from "@mdi/js";
import { Icon } from "../../../components/Icon.js";
import { getUiForTab } from "../../../components/TabsUi.js";

export let TaxonView = {
  view: function (vnode) {
    const occurrenceMetaIndex = Checklist.getOccurrenceMetaIndex();
    const isOccurrenceLevel = vnode.attrs.currentTaxonLevel === occurrenceMetaIndex;

    if (isOccurrenceLevel && !Settings.checklistShowOccurrences()) {
      return null;
    }

    /**
     * Recursively checks if this taxon node or any of its children
     * contain an occurrence record.
     */
    const branchHasOccurrences = (node) => {
      if (node.taxonMetaIndex === occurrenceMetaIndex) return true;
      if (!node.children) return false;
      return Object.values(node.children).some(branchHasOccurrences);
    };

    if (!Settings.checklistPruneEmpty() && !branchHasOccurrences(vnode.attrs.taxonTree)) {
      return null;
    }

    function detailsIcon(taxonName, detailsType) {
      const taxonLeaf = vnode.attrs.taxonTree.taxon;
      const taxonRouteParam = encodeURIComponent(
        taxonLeaf.name + "\x00" + (taxonLeaf.authority ?? "")
      );

      return m(
        ".show-all-of-taxon.clickable",
        {
          onclick: function (e) {
            routeTo("/details/" + taxonRouteParam + "/" + detailsType);
          },
        },
        m(Icon, { path: getUiForTab(detailsType).icon }),
      );
    }

    const taxonName = vnode.attrs.taxonTree.taxon.name;
    const taxonAuthority = vnode.attrs.taxonTree.taxon.authority ?? "";
    const tabsData = Checklist.getDetailsTabsForTaxon(taxonName, taxonAuthority);

    let inverseTaxonLevel = Checklist.inverseTaxonLevel(vnode.attrs.currentTaxonLevel);

    function shouldRenderTab(tabsData, tabKey) {
      return (
        tabsData &&
        Object.hasOwn(tabsData, tabKey) &&
        tabsData[tabKey] &&
        tabsData[tabKey].length > 0
      );
    }

    const sortedChildKeys = Object.keys(vnode.attrs.taxonTree.children)
      .filter((key) => {
        return (
          Settings.checklistShowOccurrences() ||
          vnode.attrs.taxonTree.children[key].taxonMetaIndex !== occurrenceMetaIndex
        );
      })
      .sort(function (a, b) {
        const aIsOccurrence =
          vnode.attrs.taxonTree.children[a].taxonMetaIndex === occurrenceMetaIndex;
        const bIsOccurrence =
          vnode.attrs.taxonTree.children[b].taxonMetaIndex === occurrenceMetaIndex;
        if (aIsOccurrence && !bIsOccurrence) return -1;
        if (!aIsOccurrence && bIsOccurrence) return 1;
        return 0;
      });

    const showSearchAll = sortedChildKeys.length > 0;
    const nonOccurrenceChildKeys = Object.keys(vnode.attrs.taxonTree.children).filter(
      (key) => vnode.attrs.taxonTree.children[key].taxonMetaIndex !== occurrenceMetaIndex
    );
    const isTerminalNode = nonOccurrenceChildKeys.length === 0;

    if (vnode.attrs.terminalOnly && !isTerminalNode) {
      return sortedChildKeys.map(function (currentTaxonKey) {
        const childNode = vnode.attrs.taxonTree.children[currentTaxonKey];

        if (
          vnode.attrs.displayMode != "" &&
          childNode.taxonMetaIndex !== occurrenceMetaIndex &&
          Object.keys(Checklist.getTaxaMeta()).indexOf(
            vnode.attrs.displayMode
          ) < childNode.taxonMetaIndex
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
          currentTaxonLevel: vnode.attrs.taxonTree.children[currentTaxonKey].taxonMetaIndex,
          displayMode: vnode.attrs.displayMode,
          showTaxonMeta: vnode.attrs.showTaxonMeta,
          showOccurrenceMeta: vnode.attrs.showOccurrenceMeta,
          terminalOnly: vnode.attrs.terminalOnly,
        });
      });
    }

    return m("ul.card.taxon-level" + inverseTaxonLevel + (isOccurrenceLevel ? ".occurrence-level" : ""), [

      m("li.taxon", [
        m(".taxon-name-stripe", [
          m(TaxonNameView, {
            taxonTree: vnode.attrs.taxonTree,
            currentTaxonLevel: vnode.attrs.currentTaxonLevel,
            parents: vnode.attrs.parents,
            variant: isOccurrenceLevel ? "occurrence" : null,
          }),
          m(".spacer"),
          m(".details-icons-wrapper", [
            (Checklist.getSingleAccessTaxonomicKeys().some(k => Checklist.isKeyRelevantToTaxon(k, taxonName)))
              ? m(".additional-taxon-indicators.clickable",
                {
                  onclick: function (e) {
                    routeTo("/single-access-keys/filter/" + taxonName);
                  },
                }, m(".taxon-details-icon", [
                  m(Icon, { path: mdiKeyVariant })
                ]))
              : null,
            shouldRenderTab(tabsData, "media") &&
            shouldRenderTab(tabsData, "media") &&
            detailsIcon(taxonName, "media"),
            shouldRenderTab(tabsData, "map") &&
            detailsIcon(taxonName, "map"),
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
                  m(Icon, { path: mdiMagnify }),
                  vnode.attrs.taxonTree.taxon.name,
                ])
              )
              : null,
          ]),
        ]),
        vnode.attrs.displayMode == "" &&
          ((isOccurrenceLevel && vnode.attrs.showOccurrenceMeta !== false) ||
            (!isOccurrenceLevel && vnode.attrs.showTaxonMeta !== false))
          ? m(TaxonDataView, {
            taxon: vnode.attrs.taxonTree,
          })
          : null,
      ]),
      sortedChildKeys.map(function (currentTaxonKey) {
        const childNode = vnode.attrs.taxonTree.children[currentTaxonKey];

        if (
          vnode.attrs.displayMode != "" &&
          childNode.taxonMetaIndex !== occurrenceMetaIndex &&
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
          currentTaxonLevel: vnode.attrs.taxonTree.children[currentTaxonKey].taxonMetaIndex,
          displayMode: vnode.attrs.displayMode,
          showTaxonMeta: vnode.attrs.showTaxonMeta,
          showOccurrenceMeta: vnode.attrs.showOccurrenceMeta,
          terminalOnly: vnode.attrs.terminalOnly,
        });
      }),
    ]);
  },
};
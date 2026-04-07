import m from "mithril";
import "./DetailsView.css";

import {
  TabsContainer,
  TabsContainerTab,
} from "../components/TabsContainer.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import {
  routeTo,
} from "../components/Utils.js";


import { TabSummary } from "./detailsTabs/TabSummary.js";
import { TabMap } from "./detailsTabs/TabMap.js";
import { TabText } from "./detailsTabs/TabText.js";
import { TabExternalSearch } from "./detailsTabs/TabExternalSearch.js";
import { TabMedia } from "./detailsTabs/TabMedia.js";

export let DetailsView = {
  selectedTaxon: null,
  taxonName: "",
  taxonAuthority: "",
  taxonData: {},

  view: function (vnode) {
    DetailsView.taxonName = m.route.param("taxon")
      ? m.route.param("taxon")
      : "";

    let path = location.hash;
    if (path.indexOf("?") > 0 && path.indexOf("/details/") >= 0) {
      path = path.substring(0, path.indexOf("?"));
    }
    path = path.substring(path.lastIndexOf("/") + 1);
    let tab = path;

    let taxon = Checklist.getTaxonByName(DetailsView.taxonName);

    if (taxon.isInChecklist) {
      DetailsView.taxonAuthority = taxon.t[taxon.t.length - 1].a;
      DetailsView.taxonData = taxon.d;
    }

    return m(".details", [
      m(".details-taxon-crumbs-zone", taxonomyCrumbs(DetailsView.taxonName)),
      m(".details-taxon-zone", DetailsView.taxonName),
      m(TabsContainer, {
        tabs: TabsForDetails(
          Checklist.getDetailsTabsForTaxon(DetailsView.taxonName),
          taxon,
          DetailsView.taxonName
        ),
        activeTab: tab,
      }),
    ]);
  },
};

function taxonomyCrumbs(taxonName) {
  let taxon = Checklist.getTaxonByName(taxonName);

  const nonNullTaxa = taxon.t.filter(t => t !== null);
  return nonNullTaxa.map(function (taxonEntry, index) {
    if (index == nonNullTaxa.length - 1) {
      return null; // skip the taxon itself, only show ancestors
    }
    return m(".details-taxon-crumb", [
      m(".crumb-taxon-name-wrap", [
        m(".crumb-taxon-name", taxonEntry.name),
        taxonEntry.authority == ""
          ? null
          : m(".crumb-taxon-authority", taxonEntry.authority),
      ]),
    ]);
  });
}

function TabsForDetails(detailsTabs, taxon, taxonName) {
  let tabs = {};
  const taxonLeafName = taxon.t[taxon.t.length - 1].name;

  // Summary tab is always present
  tabs["summary"] = new TabsContainerTab(
    TabSummary(taxon, taxonName),
    "./img/ui/tabs/summary.svg",
    t("tab_title_summary"),
    function () {
      Settings.currentDetailsTab("summary");
      routeTo("/details/" + taxonLeafName + "/summary");
    }
  );

  if (detailsTabs == null) return tabs;

  Object.keys(detailsTabs).forEach(function (key) {
    if (!detailsTabs[key] || detailsTabs[key].length === 0) return;

    let tabData = null;
    switch (key) {
      case "media":   tabData = TabMedia(detailsTabs[key], taxon, taxonName); break;
      case "map":     tabData = TabMap(detailsTabs[key], taxon, taxonName); break;
      case "text":    tabData = TabText(detailsTabs[key], taxon, taxonName); break;
      case "externalsearch":
        tabData = TabExternalSearch(
          detailsTabs[key],
          taxon,
          taxonName,
          DetailsView.taxonData,
          DetailsView.taxonAuthority
        );
        break;
      default: console.log("Unknown tab type: " + key); return;
    }

    if (tabData == null) return;

    tabs[key] = new TabsContainerTab(
      tabData,
      "./img/ui/tabs/" + key + ".svg",
      t("tab_title_" + key),
      function () {
        Settings.currentDetailsTab(key);
        routeTo("/details/" + taxonLeafName + "/" + Settings.currentDetailsTab());
      }
    );
  });

  return tabs;
}


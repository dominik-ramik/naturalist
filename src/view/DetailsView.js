import m from "mithril";
import { t, tf } from 'virtual:i18n-self';
import "./DetailsView.css";

import {
  TabsContainer,
  TabsContainerTab,
} from "../components/TabsContainer.js";
import { Checklist } from "../model/Checklist.js";
import { CacheManager } from "../model/CacheManager.js";
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
  taxonName: "",
  taxonAuthority: "",
  taxonData: {},
  taxon: null,
  isInChecklist: false,
  // Cache the raw tab DATA returned by Checklist (safe to cache - it is plain data,
  // not vnodes).  This avoids re-running the Checklist lookup on every redraw while
  // still producing fresh vnode trees each render, which Mithril requires.
  // Invalidated whenever the taxon changes.
  _cachedDetailsTabs: null,
  _cachedDataContextRevision: "",

  oninit: function (vnode) {
    DetailsView._updateTaxonState();
  },

  onbeforeupdate: function (vnode) {
    DetailsView._updateTaxonState();
  },

  _updateTaxonState: function () {
    const raw = decodeURIComponent(m.route.param("taxon") ?? "");
    const separatorIndex = raw.indexOf("\x00");
    const name = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
    const authority = separatorIndex >= 0 ? raw.slice(separatorIndex + 1) : "";

    // Guard must compare BEFORE writing - currently it writes taxonName first,
    // making the comparison always true
    const dataContextRevision = CacheManager.contextRevision();
    if (
      name === DetailsView.taxonName &&
      authority === DetailsView.taxonAuthority &&
      dataContextRevision === DetailsView._cachedDataContextRevision
    ) return;

    DetailsView.taxonName = name;
    DetailsView.taxonAuthority = authority;
    DetailsView._cachedDataContextRevision = dataContextRevision;
    const taxon = Checklist.getTaxonByNameAndAuthority(name, authority);
    DetailsView.taxon = taxon;
    DetailsView.isInChecklist = taxon?.isInChecklist ?? false;
    if (taxon.isInChecklist) {
      DetailsView.taxonData = taxon.d;
    }
    DetailsView._cachedDetailsTabs = Checklist.getDetailsTabsForTaxon(name, authority);
  },

  view: function (vnode) {
    const taxon = DetailsView.taxon ?? Checklist.getTaxonByNameAndAuthority(DetailsView.taxonName, DetailsView.taxonAuthority);

    // Vnode trees MUST be built fresh on every render - Mithril mutates them
    // in-place during the diff/patch cycle, so cached vnodes cause stale DOM
    // references and dead event handlers.  Only the upstream data is cached.
    const tabs = TabsForDetails(
      DetailsView._cachedDetailsTabs ?? Checklist.getDetailsTabsForTaxon(DetailsView.taxonName, DetailsView.taxonAuthority),
      taxon,
      DetailsView.taxonName
    );

    // Resolve the active tab from the URL on every render: the user can switch
    // tabs without changing the taxon, so this cannot live behind the taxon-
    // change guard in _updateTaxonState.
    let path = location.hash;
    let tab;
    if (path.indexOf("/details/") >= 0) {
      if (path.indexOf("?") > 0) {
        path = path.substring(0, path.indexOf("?"));
      }
      tab = path.substring(path.lastIndexOf("/") + 1);
    } else {
      tab = Settings.currentDetailsTab();
    }

    if (!Object.keys(tabs).includes(tab)) {
      console.log("fallback to default tab, because requested tab '" + tab + "' is not available for this taxon");
      // For unknown taxa the first available tab is externalsearch (if configured);
      // for known taxa fall back to summary as before.
      if ("externalsearch" in tabs) {
        tab = "externalsearch";
      } else if ("summary" in tabs) {
        tab = "summary";
      } else {
        tab = Object.keys(tabs)[0] ?? "summary";
      }
    }

    // Only persist when the active tab actually changed – avoids redundant
    // localStorage writes (and any future side-effects) on every redraw.
    if (Settings.currentDetailsTab() !== tab) {
      Settings.currentDetailsTab(tab);
    }

    return m(".details", [
      // Ancestor breadcrumbs are only meaningful for taxa that exist in the
      // database; for external taxa the taxon-zone already shows the name.
      m(".details-taxon-crumbs-zone",
        DetailsView.isInChecklist ? taxonomyCrumbs(DetailsView.taxonName, DetailsView.taxonAuthority) : null
      ),
      m(".details-taxon-zone",
        [
          m(".details-taxon-zone-name", DetailsView.taxonName),
          DetailsView.taxonAuthority ? m(".details-taxon-zone-authority", DetailsView.taxonAuthority) : null
        ]),
      m(TabsContainer, {
        tabs: tabs,
        activeTab: tab,
      }),
    ]);
  },
};

function taxonomyCrumbs(taxonName, taxonAuthority) {
  let taxon = Checklist.getTaxonByNameAndAuthority(taxonName, taxonAuthority);

  // Taxon is not in the database – nothing to show (caller already guards,
  // but be defensive here too).
  if (!taxon?.isInChecklist || !taxon.t) return null;

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
  const isInChecklist = taxon?.isInChecklist ?? false;

  // taxon.t is always defined (getTaxonByName synthesises a single-entry array
  // for unknown taxa), so this dereference is safe in both branches.
  const taxonLeaf = taxon.t[taxon.t.length - 1];
  const authority = taxonLeaf.authority ?? taxonLeaf.a ?? "";
  const taxonRouteParam = encodeURIComponent(
    taxonLeaf.name + (authority ? "\x00" + authority : "")
  );

  // Summary tab is only meaningful for taxa that exist in the database.
  if (isInChecklist) {
    tabs["summary"] = new TabsContainerTab(
      TabSummary(taxon, taxonName),
      "./img/ui/tabs/summary.svg",
      t("tab_title_summary"),
      function () {
        Settings.currentDetailsTab("summary");
        routeTo("/details/" + taxonRouteParam + "/summary");
      }
    );
  }

  if (detailsTabs == null) return tabs;

  Object.keys(detailsTabs).forEach(function (key) {
    if (!detailsTabs[key] || detailsTabs[key].length === 0) return;

    // For taxa not in the database, only the "Search online" tab makes sense.
    if (!isInChecklist && key !== "externalsearch") return;

    let tabData = null;
    switch (key) {
      case "media": tabData = TabMedia(detailsTabs[key], taxon, taxonName); break;
      case "map": tabData = TabMap(detailsTabs[key], taxon, taxonName); break;
      case "text": tabData = TabText(detailsTabs[key], taxon, taxonName); break;
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
        routeTo("/details/" + taxonRouteParam + "/" + Settings.currentDetailsTab());
      }
    );
  });

  return tabs;
}

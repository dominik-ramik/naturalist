import {
  TabsContainer,
  TabsContainerTab,
} from "../components/TabsContainer.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { _t } from "../model/I18n.js";
import {
  relativeToUsercontent,
  routeTo,
  mdImagesClickableAndUsercontentRelative,
  colorSVGMap,
  getRegionColors,
} from "../components/Utils.js";
import { dataReaders } from "../model/customTypes/index.js";

export let DetailsView = {
  selectedTaxon: null,
  taxonName: "",
  taxonAuthority: "",
  taxonData: {},

  /*

  onupdate: function (vnode) {
    return this.view(vnode);
  },
  */

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

  return taxon.t.map(function (taxonName, index) {
    if (index == taxon.t.length - 1) {
      return null;
    }
    return m(".details-taxon-crumb", [
      /* Experimental hide names
      m(
        ".crumb-taxon-level",
        Checklist.getTaxaMeta()[Object.keys(Checklist.getTaxaMeta())[index]]
          .name
      ),
      */
      m(".crumb-taxon-name-wrap", [
        m(".crumb-taxon-name", taxonName.name),
        taxonName.authority == ""
          ? null
          : m(".crumb-taxon-authority", taxonName.authority),
      ]),
    ]);
  });
}

function TabsForDetails(detailsTabs, taxon, taxonName) {
  if (detailsTabs == null) {
    return null;
  }

  let nonEmptyTabs = 0;
  Object.keys(detailsTabs).forEach(function (key) {
    if (detailsTabs[key] != null && detailsTabs[key].length > 0) {
      nonEmptyTabs++;
    }
  });

  if (nonEmptyTabs == 0) {
    return null;
  }

  let tabs = [];

  Object.keys(detailsTabs).forEach(function (key) {
    let icon = "./img/ui/tabs/" + key + ".svg";
    let tabData = null;
    let title = _t("tab_title_" + key);
    let onClickCallback = function () {
      Settings.currentDetailsTab(key);
      routeTo(
        "/details/" +
          taxon.t[taxon.t.length - 1].name +
          "/" +
          Settings.currentDetailsTab()
      );
    };

    switch (key) {
      case "media":
        tabData = TabMedia(detailsTabs[key], taxon, taxonName);
        break;
      case "map":
        tabData = TabMap(detailsTabs[key], taxon, taxonName);
        break;
      case "text":
        tabData = TabText(detailsTabs[key], taxon, taxonName);
        break;
      case "externalsearch":
        tabData = TabExternalSearch(detailsTabs[key], taxon, taxonName);
        break;
      default:
        console.log("Unknown tab type: " + key);
        return null;
        break;
    }

    if (tabData == null) {
      return;
    }

    tabs[key] = new TabsContainerTab(tabData, icon, title, onClickCallback);
  });

  return tabs;
}

function TabMedia(tabData, taxon, taxonName) {
  if (!tabData || tabData.length === 0) {
    return null;
  }

  let renderedContent = [];

  tabData.forEach(function (item) {
    const { data, meta, dataPath } = item;

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return;
    }

    const uiContext = {
      meta: meta,
      dataPath: dataPath || meta.columnName || "",
      originalData: taxon.d,
      taxon: {
        name: taxon.t[taxon.t.length - 1].name,
        authority: taxon.t[taxon.t.length - 1].authority,
      },
      placement: "details",
    };

    console.log("TabMedia item:", uiContext);

    // Get the appropriate reader based on formatting type
    const reader = dataReaders[meta.formatting];

    if (reader && reader.dataToUI) {
      let renderedItem = reader.dataToUI(data, uiContext);
      if (renderedItem) {
        renderedContent.push(renderedItem);
      }
    }
  });

  if (renderedContent.length === 0) {
    return null;
  }

  return m(".media-list", renderedContent);
}

function TabMap(tabData, taxon, taxonName) {
  if (!tabData || tabData.length === 0) {
    return null;
  }

  let renderedContent = [];

  tabData.forEach(function (item) {
    const { data, meta, dataPath } = item;

    if (!data) {
      return;
    }

    const uiContext = {
      meta: meta,
      dataPath: dataPath || meta.columnName || "",
      originalData: taxon.d,
      taxon: {
        name: taxon.t[taxon.t.length - 1].name,
        authority: taxon.t[taxon.t.length - 1].a,
      },
      placement: "details",
    };

    // Get the appropriate reader based on formatting type
    const reader = dataReaders[meta.formatting];

    if (reader && reader.dataToUI) {
      let renderedItem = reader.dataToUI(data, uiContext);
      if (renderedItem) {
        renderedContent.push(renderedItem);
      }
    }
  });

  if (renderedContent.length === 0) {
    return null;
  }

  return m(".media-list", renderedContent);
}

function TabText(tabData, taxon, taxonName) {
  if (!tabData || tabData.length === 0) {
    return null;
  }

  let mdIndex = "";
  let renderedContent = [];

  tabData.forEach(function (item) {
    const { data, meta } = item;

    if (!data || data.toString().trim() === "") {
      return;
    }

    // Create UI context for the reader
    const uiContext = {
      meta: meta,
      dataPath: meta.columnName || "",
      originalData: taxon.d,
      taxon: {
        name: taxonName,
        authority: taxon.t[taxon.t.length - 1].a,
      },
      placement: "details",
    };

    // Get the appropriate reader based on formatting type
    const reader = dataReaders[meta.formatting] || dataReaders["text"];

    if (reader && reader.dataToUI) {
      // Generate index entry if we have multiple items
      if (tabData.length > 1) {
        const metaKey = meta.columnName || "text";
        mdIndex +=
          "- <div class='index-head' onclick=\"document.getElementById('" +
          metaKey +
          "').scrollIntoView({behavior: 'smooth'}, true)\">" +
          meta.title +
          "</div>\n";
      }

      // Render the content using the reader
      let renderedItem = reader.dataToUI(data, uiContext);

      if (renderedItem) {
        // Wrap with heading if we have a title
        if (meta.title) {
          const metaKey = meta.columnName || "text";
          renderedContent.push(
            m("div", [
              m("div.textHeading", { id: metaKey }, meta.title),
              renderedItem,
            ])
          );
        } else {
          renderedContent.push(renderedItem);
        }
      }
    }
  });

  if (renderedContent.length === 0) {
    return null;
  }

  // Combine index and content
  let finalContent = [];

  if (mdIndex.length > 0 && tabData.length > 1) {
    finalContent.push(m.trust(marked.parse(mdIndex)));
  }

  finalContent = finalContent.concat(renderedContent);

  return m("div", finalContent);
}

function TabExternalSearch(tabData, taxon, taxonName) {
  if (tabData.length == 0) {
    return null;
  }

  return m(
    ".search-engines",
    tabData.map(function (engine) {
      if (engine.restrictToTaxon && engine.restrictToTaxon.length > 0) {
        let restricted = engine.restrictToTaxon
          .split(",")
          .map((i) => i.trim().toLowerCase())
          .filter((i) => i !== null && i !== "");

        if (!taxon.t.find((t) => restricted.includes(t.name.toLowerCase()))) {
          return null; // If taxon to which this should be restricted is not found in the taxonomic branch, then don't show this engine
        }
      }

      let translatedURL = resolveTemplate(engine.url, "");

      return m(
        ".search-engine",
        {
          onclick: function () {
            window.open(translatedURL, "_blank");
          },
        },
        [
          m(
            "img.engine-icon[src=usercontent/online_search_icons/" +
              engine.icon +
              "]"
          ),
          m(".engine-title", engine.title),
        ]
      );
    })
  );
}

function resolveTemplate(template, currentValue) {
  var compiledTemplate = null;

  try {
    compiledTemplate = Handlebars.compile(template);
  } catch (ex) {
    console.log("Handlebars error", ex);
    return;
  }

  let data = Checklist.getDataObjectForHandlebars(
    currentValue,
    DetailsView.taxonData,
    DetailsView.taxonName,
    DetailsView.taxonAuthority
  );

  return compiledTemplate(data);
}

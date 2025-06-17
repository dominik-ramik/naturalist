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
        m(".crumb-taxon-name", taxonName.n),
        taxonName.a == "" ? null : m(".crumb-taxon-authority", taxonName.a),
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
          taxon.t[taxon.t.length - 1].n +
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
  let mediaRenderingData = {};

  //content
  Object.keys(Checklist.getDataMeta("media")).forEach(function (metaKey) {
    let meta = Checklist.getDataMeta("media")[metaKey];
    if (meta.datatype == "media") {
      if (tabData.indexOf(metaKey) >= 0) {
        let mediaType = meta.type;
        let mediaTitle = meta.title;
        let mediaUrl = meta.link;

        let mediaItems = taxon.d[metaKey];

        mediaItems.forEach(function (mediaItem) {
          if (
            mediaItem == undefined ||
            mediaItem == null ||
            !mediaItem.source ||
            mediaItem.source == ""
          ) {
            return;
          }

          let url = "";
          if (mediaUrl == "") {
            url = mediaItem.source;
          } else {
            url = resolveTemplate(mediaUrl, mediaItem.source);
          }

          url = relativeToUsercontent(url);

          let title = mediaItem.hasOwnProperty("title") ? mediaItem.title : "";

          if (!mediaRenderingData.hasOwnProperty(mediaType)) {
            mediaRenderingData[mediaType] = {};
          }
          if (!mediaRenderingData[mediaType].hasOwnProperty(metaKey)) {
            mediaRenderingData[mediaType][metaKey] = {
              title: mediaTitle,
              mediaList: [],
            };
          }
          mediaRenderingData[mediaType][metaKey].mediaList.push({
            url: url,
            title: title,
          });
        });
      }
    }
  });

  return m(
    ".media-list",
    Object.keys(mediaRenderingData).map(function (dataKey) {
      return m(
        ".media-type-" + dataKey,
        Object.keys(mediaRenderingData[dataKey]).map(function (mediaTitleKey) {
          let mediaSet = mediaRenderingData[dataKey][mediaTitleKey];

          return m(".media-set", [
            m(".media-set-title", mediaSet.title),
            m(
              ".media-set-list",
              mediaSet.mediaList.map(function (media, index) {
                switch (dataKey) {
                  case "image":
                    return m(".media-image", [
                      m(
                        ".image-wrap.fullscreenable-image[title=" + media.title + "]",
                        {
                          onclick: function (e) {
                            this.classList.toggle("fullscreen");
                            this.getElementsByTagName(
                              "img"
                            )[0].classList.toggle("clickable");
                            e.preventDefault();
                            e.stopPropagation();
                          },
                        },
                        m("img.clickable[src=" + media.url + "][alt=" + media.title + "]")
                      ),
                      m(".title", media.title),
                    ]);
                    break;
                  case "sound":
                    return m(".media-sound", [
                      m("audio[controls=controls]", [
                        m("source[src=" + media.url + "]"),
                      ]),
                      m(".title", media.title),
                    ]);
                    break;
                  case "video":
                    console.log("Not implemented"); //TODO-FUTURE implement
                    break;
                  default:
                    console.log("Not recognized media type");
                    break;
                }
              })
            ),
          ]);
        })
      );
    })
  );
}

function TabMap(tabData, taxon, taxonName) {
  let mapsRenderingData = {};

  //content
  Object.keys(Checklist.getDataMeta("maps")).forEach(function (metaKey) {
    let meta = Checklist.getDataMeta("maps")[metaKey];
    if (meta.datatype == "map") {
      let mapData = taxon.d[metaKey];
      let mapType = meta.type;
      let mapTitle = meta.title;
      let mapUrl = meta.source;

      if (mapData == null || mapData == undefined) {
        mapData = "";
      }

      let url = "";
      if (mapUrl == "") {
        url = mapData;
      } else {
        url = resolveTemplate(mapUrl, mapData);
      }

      if (mapData == "") {
        return null;
      }

      if (!mapsRenderingData.hasOwnProperty(mapType)) {
        mapsRenderingData[mapType] = {};
      }
      if (!mapsRenderingData[mapType].hasOwnProperty(metaKey)) {
        mapsRenderingData[mapType][metaKey] = {
          title: mapTitle,
          mediaList: [],
        };
      }
      mapsRenderingData[mapType][metaKey].mediaList.push({
        url: url,
        title: mapTitle,
        regions: mapData,
        metaKey: metaKey,
      });
    }
  });

  return m(
    ".media-list",
    Object.keys(mapsRenderingData).map(function (dataKey) {
      return m(
        ".media-type-" + dataKey,
        Object.keys(mapsRenderingData[dataKey]).map(function (mediaTitleKey) {
          let mediaSet = mapsRenderingData[dataKey][mediaTitleKey];

          let processedMediaSet = mediaSet.mediaList.map(function (media) {
            switch (dataKey) {
              case "image":
                return m(".media-image", [
                  m(
                    ".image-wrap.fullscreenable-image",
                    {
                      onclick: function (e) {
                        this.classList.toggle("fullscreen");
                        this.getElementsByTagName("img")[0].classList.toggle(
                          "clickable"
                        );
                        e.preventDefault();
                        e.stopPropagation();
                      },
                    },
                    m("img.clickable[src=" + media.url + "]")
                  ),
                  m(".title", media.title),
                ]);
                break;
              case "link":
                return m(".map-link", [
                  m("span", _t("show_map")),
                  m("a[href=" + media.url + "][target=_blank]", media.title),
                ]);
                break;
              case "regions":
                let presentRegionsMeta = [];
                let presentRegionsMetaSuffixes = [];

                // Work directly with object format
                if (typeof media.regions === "object" && media.regions !== null) {
                  const regionCodes = Object.keys(media.regions);

                  if (regionCodes.length == 0) {
                    return null;
                  }

                  []
                    .concat(
                      Checklist.getMapRegionsMeta(true),
                      Checklist.getMapRegionsMeta()
                    )
                    .forEach(function (mapRegionMeta) {
                      regionCodes.forEach(function (regionCode) {
                        const regionData = media.regions[regionCode];
                        const suffix = regionData.suffix || regionData.status || "";

                        if (
                          suffix == mapRegionMeta.suffix &&
                          presentRegionsMetaSuffixes.indexOf(mapRegionMeta.suffix) < 0
                        ) {
                          presentRegionsMetaSuffixes.push(mapRegionMeta.suffix);
                          presentRegionsMeta.push(mapRegionMeta);
                        }
                      });
                    });

                  // Convert to legacy format for colorSVGMap compatibility
                  let reformattedMediaRegions = "";
                  Object.keys(media.regions).forEach((regionCode) => {
                    const regionData = media.regions[regionCode];
                    const suffix = regionData.suffix || regionData.status || "";
                    reformattedMediaRegions += regionCode + ":" + suffix + " ";
                  });
                  const mapRegionsString = reformattedMediaRegions.trim();

                  window.setTimeout(function () {
                    let map = document.getElementById("map_" + media.metaKey);
                    colorSVGMap(
                      map,
                      getRegionColors(
                        mapRegionsString,
                        media.url.toLowerCase().endsWith("world.svg")
                      )
                    );
                  }, 50);

                  return m(".media-map", [
                    m(
                      ".image-wrap.clickable.fullscreenable-image",
                      {
                        onclick: function (e) {
                          this.classList.toggle("fullscreen");
                          this.classList.toggle("clickable");
                          e.preventDefault();
                          e.stopPropagation();
                        },
                      },
                      m(
                        "object#map_" +
                          media.metaKey +
                          "[style=pointer-events: none;][type=image/svg+xml][data=usercontent/maps/" +
                          media.url +
                          "]",
                        {
                          onload: function () {
                            colorSVGMap(
                              this,
                              getRegionColors(
                                mapRegionsString,
                                media.url.toLowerCase().endsWith("world.svg")
                              )
                            );
                          },
                        }
                      )
                    ),
                    media.regions
                      ? m(
                          ".legend",
                          Object.keys(presentRegionsMeta).length == 0
                            ? null
                            : Object.values(presentRegionsMeta).map(function (
                                regionMeta
                              ) {
                                return m(".legend-item", [
                                  m(
                                    ".map-fill[style=background-color: " +
                                      regionMeta.fill +
                                      "]"
                                  ),
                                  m(".map-legend-title", regionMeta.legend),
                                ]);
                              })
                        )
                      : null,
                    m(".title", media.title),
                  ]);
                } else {
                  return null;
                }
                break;
              default:
                console.log("Not recognized media type " + dataKey);
                break;
            }
          });

          if (processedMediaSet.every((item) => item === null)) {
            return null;
          }
          return m(".media-map-set", [m(".media-set-list", processedMediaSet)]);
        })
      );
    })
  );
}

function TabText(tabData, taxon, taxonName) {
  let mdIndex = "";
  let mdText = "";
  //content
  Object.keys(Checklist.getDataMeta("accompanyingText")).forEach(function (
    metaKey
  ) {
    let meta = Checklist.getDataMeta("accompanyingText")[metaKey];
    if (meta.datatype == "text") {
      if (tabData.indexOf(metaKey) >= 0 && taxon.d[metaKey].length > 0) {
        let itemText = taxon.d[metaKey];

        mdIndex +=
          "- <div class='index-head' onclick=\"document.getElementById('" +
          metaKey +
          "').scrollIntoView({behavior: 'smooth'}, true)\">" +
          meta.title +
          "</div>\n";

        mdText +=
          "<div class='accompanyingTextHeading'>" + meta.title + "</div>\n\n";
        mdText += itemText + "\n\n";
      }
    }
  });

  if (mdText.trim() == "") {
    return null;
  }

  //Excel may add \n string into values with newline, let's get rid of those
  mdText = mdText.replaceAll("\\n", "\n");

  let htmlText = DOMPurify.sanitize(marked.parse(mdText));

  htmlText =
    (mdIndex.length > 0 && tabData.length > 1
      ? marked.parse(mdIndex) + "\n\n"
      : "") + htmlText;

  htmlText = mdImagesClickableAndUsercontentRelative(htmlText);

  return m.trust(htmlText);
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

        if (!taxon.t.find((t) => restricted.includes(t.n.toLowerCase()))) {
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

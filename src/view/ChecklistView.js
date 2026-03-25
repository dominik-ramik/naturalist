import m from "mithril";

import {
  colorFromRatio,
  getIndexedColor,
  routeTo,
  sortByCustomOrder,
} from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { TaxonView } from "../view/TaxonView.js";
import { circlePacking } from "./charts/CirclePacking.js";
import { D3ChartView } from "./D3ChartView.js";
import { categoryChart } from "./charts/CategoryChart.js";
import { mapChart } from "./charts/MapChart.js";

export let ChecklistView = {
  itemsNumberStep: 50,
  totalItemsToShow: 0,
  lastQuery: "",
  displayMode: "", // either "" (display all) or name of any taxon level

  oninit: function () {
    ChecklistView.lastQuery = JSON.stringify(Checklist.queryKey());
    ChecklistView.totalItemsToShow = this.itemsNumberStep;
  },
  view: function () {
    if (!Checklist._isDataReady) {
      return m(".checklist");
    }

    let currentQuery = JSON.stringify(Checklist.queryKey());

    if (m.route.param("q") && m.route.param("q").length > 0) {
      currentQuery = decodeURI(m.route.param("q"));
    }

    if (currentQuery != ChecklistView.lastQuery) {
      let q = {};
      try {
        q = JSON.parse(currentQuery);
      } catch (ex) {
        console.error("Malformed url query");
        routeTo("/checklist", "");
      }

      Checklist.filter.setFromQuery(q);

      ChecklistView.totalItemsToShow = ChecklistView.itemsNumberStep;
      ChecklistView.lastQuery = currentQuery;
      window.setTimeout(function () {
        if (
          document.getElementsByClassName("listed-taxa") &&
          document.getElementsByClassName("listed-taxa").length > 0
        ) {
          document.getElementsByClassName("listed-taxa")[0].scrollTo(0, 0);
        }
      }, 100);
    }

    const allFilteredTaxa = Checklist.getTaxaForCurrentQuery();
    const visibleFilteredTaxa = filterOutSpecimenTaxa(allFilteredTaxa);
    const visibleFullChecklistTaxa = filterOutSpecimenTaxa(
      Checklist.getData().checklist
    );

    let clampedFilteredTaxa = visibleFilteredTaxa;

    let overflowing = 0;
    if (
      ChecklistView.displayMode == "" &&
      clampedFilteredTaxa.length > ChecklistView.totalItemsToShow
    ) {
      overflowing = clampedFilteredTaxa.length - ChecklistView.totalItemsToShow;
      clampedFilteredTaxa = clampedFilteredTaxa.slice(
        0,
        ChecklistView.totalItemsToShow
      );
    }

    let treeClampedFilteredTaxa = Checklist.treefiedTaxa(clampedFilteredTaxa);

    let specificChecklistView = null;

    switch (Settings.viewType()) {
      case "view_details":
        specificChecklistView = detailedTaxonView(
          treeClampedFilteredTaxa,
          overflowing
        );
        break;
      case "view_circle_pack":
        specificChecklistView = circlePackingView(
          visibleFullChecklistTaxa,
          visibleFilteredTaxa
        );
        break;
      case "view_category_density":
        specificChecklistView = categoryChartView(visibleFilteredTaxa);
        break;
      case "view_map":
        specificChecklistView = mapChart(
          visibleFilteredTaxa,
          visibleFullChecklistTaxa
        );
        break;
      default:
        console.error("Unknown view type: " + Settings.viewType());
        break;
    }

    return m(
      ".checklist[style=background: linear-gradient(45deg, " +
      Checklist.getThemeHsl("dark") +
      ", " +
      Checklist.getThemeHsl("light") +
      ");]",
      m(".checklist-inner-wrapper", [
        allFilteredTaxa.length == 0
          ? m(".nothing-found-wrapper", [
            m("h2", t("nothing_found_oops")),
            m("img.search-world[src=img/ui/checklist/search_world.svg]"),
            m(".nothing-found-message", t("nothing_found_checklist")),
            m(
              ".query",
              m.trust(Settings.pinnedSearches.getHumanNameForSearch())
            ),
          ])
          : m(".checklist-inner-wrapper", [
            Checklist._isDraft ? draftNotice() : null,
            !Checklist.filter.isEmpty() ? mobileFilterOnNotice() : null,
            !Checklist.filter.isEmpty() && !Settings.includeMatchChildren()
              ? hiddenChildTaxaNotice()
              : null,
            shouldHideSpecimensInView()
              ? hiddenSpecimensNotice()
              : null,
            Settings.viewType() === "view_details" &&
              ChecklistView.displayMode != ""
              ? temporaryFilterNotice()
              : null,
            specificChecklistView,
          ]),
      ])
    );
  },
};

function shouldHideSpecimensInView() {
  return Checklist.hasSpecimens() && !Settings.includeSpecimensInView();
}

function filterOutSpecimenTaxa(taxa) {
  if (!shouldHideSpecimensInView()) {
    return taxa;
  }

  const specimenMetaIndex = Checklist.getSpecimenMetaIndex();

  return taxa.filter(function (taxon) {
    return (
      taxon.t?.[specimenMetaIndex] === null ||
      taxon.t?.[specimenMetaIndex] === undefined
    );
  });
}

function restoreChildTaxa() {
  Settings.includeMatchChildren(true);
  Checklist.filter._queryResultCache = {};
}

function restoreSpecimens() {
  Settings.includeSpecimensInView(true);
}

function categoryChartView(filteredTaxa) {
  return categoryChart(filteredTaxa);
}

function detailedTaxonView(treeTaxa, overflowing) {
  const includeSpecimensInView = Settings.includeSpecimensInView();
  const specimenMetaIndex = Checklist.getSpecimenMetaIndex();
  const visibleTopLevelTaxa = Object.keys(treeTaxa.children).filter(
    function (taxonLevel) {
      return (
        includeSpecimensInView ||
        treeTaxa.children[taxonLevel].taxonMetaIndex !== specimenMetaIndex
      );
    }
  );

  return m(".listed-taxa", [
    visibleTopLevelTaxa.map(function (taxonLevel) {
      return m(TaxonView, {
        parents: [],
        taxonKey: taxonLevel,
        taxonTree: treeTaxa.children[taxonLevel],
        currentTaxonLevel: treeTaxa.children[taxonLevel].taxonMetaIndex,
        displayMode: ChecklistView.displayMode,
      });
    }),
    overflowing > 0
      ? m(
        ".show-more-items",
        {
          onclick: function () {
            ChecklistView.totalItemsToShow += ChecklistView.itemsNumberStep;
          },
        },
        t(
          "next_items_checklist",
          overflowing < ChecklistView.itemsNumberStep
            ? overflowing
            : ChecklistView.itemsNumberStep
        )
      )
      : null,
  ]);
}

function checklistDataForD3(node, level) {
  if (level === undefined) {
    level = 0;
  }

  if (!node.children || Object.keys(node.children).length === 0) {
    return [];
  } else {
    const specimenMetaIndex = Checklist.getSpecimenMetaIndex();
    const specimenGroupName =
      Checklist.getNameOfTaxonLevel(specimenMetaIndex) || "Specimen";

    let children = [];
    let specimenChildren = [];

    Object.keys(node.children).forEach((key) => {
      const childNode = {
        name: key,
        children: checklistDataForD3(node.children[key], level + 1),
        data: node.children[key].data,
        taxon: node.children[key].taxon,
        taxonMetaIndex: node.children[key].taxonMetaIndex,
      };

      if (node.children[key].taxonMetaIndex === specimenMetaIndex) {
        specimenChildren.push(childNode);
      } else {
        children.push(childNode);
      }
    });

    if (specimenChildren.length > 0) {
      children.push({
        name: specimenGroupName,
        children: specimenChildren,
        taxon: null,
        data: {},
        taxonMetaIndex: specimenMetaIndex,
        isSyntheticSpecimenGroup: true,
      });
    }

    if (level == 0) {
      return {
        name: "◯",
        children: children,
      };
    } else {
      return children;
    }
  }
}

function assignLeavesCount(node, allMatchingData) {
  if (!node.children || node.children.length === 0) {
    let isMatch = allMatchingData.find(
      (taxon) =>
        taxon.t[taxon.t.length - 1].name == node.taxon.name &&
        taxon.t[taxon.t.length - 1].authority == node.taxon.authority
    );

    node.value = 1;
    node.totalLeafCount = 1;
    node.matchingLeafCount = isMatch ? 1 : 0;
    return {
      totalLeafCount: node.totalLeafCount,
      matchingLeafCount: node.matchingLeafCount,
    };
  }

  let leavesCount = {
    totalLeafCount: 0,
    matchingLeafCount: 0,
  };

  for (const child of node.children) {
    let assignedCount = assignLeavesCount(child, allMatchingData);
    leavesCount.totalLeafCount += assignedCount.totalLeafCount;
    leavesCount.matchingLeafCount += assignedCount.matchingLeafCount;
  }

  node.totalLeafCount = leavesCount.totalLeafCount;
  node.matchingLeafCount = leavesCount.matchingLeafCount;
  return leavesCount;
}

let cachedData = null;
let oldQueryKey = "";

function circlePackingView(allTaxa, matchingTaxa) {
  if (allTaxa.length === 0) {
    return m(".listed-taxa");
  }

  return m(D3ChartView, {
    id: "d3test",
    chart: circlePacking,
    options: () => {
      let shouldUpdate = false;
      const cacheKey = JSON.stringify({
        queryKey: Checklist.queryKey(),
        includeSpecimensInView: Settings.includeSpecimensInView(),
      });

      if (cachedData == null || cacheKey != oldQueryKey) {
        oldQueryKey = cacheKey;
        cachedData = checklistDataForD3(Checklist.treefiedTaxa(allTaxa));
        assignLeavesCount(cachedData, matchingTaxa);
        shouldUpdate = true;
      }

      return {
        shouldUpdate: shouldUpdate,
        dataSource: cachedData,
        colorInterpolation: colorFromRatio,
        fontFamily: "Regular",
        maxDataLevelsDisplayed:
          Checklist._data.versions[Checklist.getCurrentLanguage()]
            .stackingCirclesDepth || 4,
      };
    },
  });
}

let Notice = {
  view: function (vnode) {
    return m(
      ".temporary-notice" + (vnode.attrs.additionalClasses === undefined ? "" : "." + vnode.attrs.additionalClasses),
      {
        onclick: vnode.attrs.action,
      },
      [
        m(".notice", vnode.attrs.notice),
        vnode.attrs.additionalButton === undefined
          ? null
          : m(
            "button.show-all",
            {
              onclick: vnode.attrs.additionalButton.action,
            },
            [
              m(
                "img.notice-icon[src=img/ui/menu/" +
                vnode.attrs.additionalButton.icon +
                ".svg]"
              ),
              vnode.attrs.additionalButton.text,
            ]
          ),
      ]
    );
  },
};

function mobileFilterOnNotice() {
  return m(Notice, {
    additionalClasses: ".mobile-filter-on",
    action: function () {
      ChecklistView.displayMode = "";
    },
    notice: m.trust(
      tf(
        "mobile_filter_notice",
        [Settings.pinnedSearches.getHumanNameForSearch()],
        true
      )
    ),
  });
}

function draftNotice() {
  return m(Notice, {
    action: function () {
      ChecklistView.displayMode = "";
    },
    notice: t("draft_notice"),
    additionalButton: {
      action: function () {
        routeTo("/manage/review");
      },
      icon: "manage",
      text: t("temporary_draft_goto_manage"),
    },
  });
}

function temporaryFilterNotice() {
  return m(Notice, {
    action: function () {
      ChecklistView.displayMode = "";
    },
    notice: m.trust(
      t("temporary_filter", [
        Checklist.getTaxaMeta()[ChecklistView.displayMode].name,
      ])
    ),
    additionalButton: {
      action: function () {
        ChecklistView.displayMode = "";
      },
      icon: "filter_list_off",
      text: t("temporary_filter_show_all"),
    },
  });
}

function hiddenChildTaxaNotice() {
  return m(Notice, {
    action: function () {
      restoreChildTaxa();
    },
    notice: t("temporary_filter_children"),
    additionalButton: {
      action: function () {
        restoreChildTaxa();
      },
      icon: "filter_list_off",
      text: t("temporary_filter_show_children"),
    },
  });
}

function hiddenSpecimensNotice() {
  const showAllInfo = Settings.viewType() === "view_details";

  return m(Notice, {
    action: function () {
      restoreSpecimens();
    },
    notice: m.trust(t("temporary_filter_specimens")),
    additionalButton: {
      action: function () {
        restoreSpecimens();
      },
      icon: "filter_list_off",
      text: showAllInfo
        ? t("temporary_filter_show_all")
        : t("temporary_filter_show_specimens"),
    },
  });
}

export let ButtonGroup = {
  view: function (vnode) {
    return m(".button-group-wrapper", [
      m("span.button-group-label", vnode.attrs.label),
      m(".button-group", vnode.attrs.buttons),
    ]);
  },
};

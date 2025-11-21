import m from "mithril";

import {
  colorFromRatio,
  getIndexedColor,
  routeTo,
  sortByCustomOrder,
} from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { _t, _tf } from "../model/I18n.js";
import { TaxonView } from "../view/TaxonView.js";
import { AppLayoutView } from "./AppLayoutView.js";
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
    let display =
      AppLayoutView.mobile() && AppLayoutView.display != "checklist"
        ? "display: none; "
        : "";

    if (!Checklist._isDataReady) {
      return m(".checklist[style=" + display + "]");
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

    let clampedFilteredTaxa = allFilteredTaxa;

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
        specificChecklistView = circlePackingView();
        break;
      case "view_category_density":
        specificChecklistView = categoryChartView(allFilteredTaxa);
        break;
      case "view_map":
        specificChecklistView = mapChart(allFilteredTaxa);
        break;
      default:
        console.error("Unknown view type: " + Settings.viewType());
        break;
    }

    return m(
      ".checklist[style=" +
      display +
      "background: linear-gradient(45deg, " +
      Checklist.getThemeHsl("dark") +
      ", " +
      Checklist.getThemeHsl("light") +
      ");]",
      m(".checklist-inner-wrapper", [
        clampedFilteredTaxa.length == 0
          ? m(".nothing-found-wrapper", [
            m("h2", _t("nothing_found_oops")),
            m("img.search-world[src=img/ui/checklist/search_world.svg]"),
            m(".nothing-found-message", _t("nothing_found_checklist")),
            m(
              ".query",
              m.trust(Settings.pinnedSearches.getHumanNameForSearch())
            ),
          ])
          : m(".checklist-inner-wrapper", [
            AppLayoutView.mobile() && !Checklist.filter.isEmpty()
              ? mobileFilterOnNotice()
              : null,
            Checklist._isDraft ? draftNotice() : null,
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

function categoryChartView(filteredTaxa) {
  return categoryChart(filteredTaxa);
}

function detailedTaxonView(treeTaxa, overflowing) {
  return m(".listed-taxa", [
    Object.keys(treeTaxa.children).map(function (taxonLevel) {
      return m(TaxonView, {
        parents: [],
        taxonKey: taxonLevel,
        taxonTree: treeTaxa.children[taxonLevel],
        currentTaxonLevel: 0,
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
        _t(
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
    let children = Object.keys(node.children).map((key) => {
      return {
        name: key,
        children: checklistDataForD3(node.children[key], level + 1),
        data: node.children[key].data,
        taxon: node.children[key].taxon,
      };
    });

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

function circlePackingView() {
  return m(D3ChartView, {
    id: "d3test",
    chart: circlePacking,
    options: () => {
      let shouldUpdate = false;
      if (cachedData == null || Checklist.queryKey() != oldQueryKey) {
        console.log("recalc");
        oldQueryKey = Checklist.queryKey();
        cachedData = checklistDataForD3(Checklist.treefiedTaxa());
        assignLeavesCount(cachedData, Checklist.getTaxaForCurrentQuery());
        shouldUpdate = true;
        console.log(cachedData);
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
      ".temporary-notice",
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

function draftNotice() {
  return m(Notice, {
    action: function () {
      ChecklistView.displayMode = "";
    },
    notice: _t("draft_notice"),
    additionalButton: {
      action: function () {
        routeTo("/manage");
      },
      icon: "manage",
      text: _t("temporary_draft_goto_manage"),
    },
  });
}

function mobileFilterOnNotice() {
  return m(Notice, {
    action: function () {
      ChecklistView.displayMode = "";
    },
    notice: m.trust(
      _tf(
        "mobile_filter_notice",
        [Settings.pinnedSearches.getHumanNameForSearch()],
        true
      )
    ),
  });
}

function temporaryFilterNotice() {
  return m(Notice, {
    action: function () {
      ChecklistView.displayMode = "";
    },
    notice: m.trust(
      _t("temporary_filter", [
        Checklist.getTaxaMeta()[ChecklistView.displayMode].name,
      ])
    ),
    additionalButton: {
      action: function () {
        ChecklistView.displayMode = "";
      },
      icon: "filter_list_off",
      text: _t("temporary_filter_show_all"),
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

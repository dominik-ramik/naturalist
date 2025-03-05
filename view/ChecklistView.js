import { routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { _t } from "../model/I18n.js";
import { Settings } from "../model/Settings.js";
import { TaxonView } from "../view/TaxonView.js";
import { AppLayoutView } from "./AppLayoutView.js";

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

    let allResultingTaxa = Checklist.getTaxaForCurrentQuery();

    let overflowing = 0;
    if (
      ChecklistView.displayMode == "" &&
      allResultingTaxa.length > ChecklistView.totalItemsToShow
    ) {
      overflowing = allResultingTaxa.length - ChecklistView.totalItemsToShow;
      allResultingTaxa = allResultingTaxa.slice(
        0,
        ChecklistView.totalItemsToShow
      );
    }

    let treeTaxa = Checklist.treefiedTaxa(allResultingTaxa);

    let specificChecklistView = null;

    switch (Settings.viewType()) {
      case "view_details":
        specificChecklistView = detailedTaxonView(treeTaxa, overflowing);
        break;
      case "view_hierarchy":
        specificChecklistView = hierarchyView(treeTaxa, allResultingTaxa);
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
        allResultingTaxa.length == 0
          ? m(".nothing-found-wrapper", [
              m("h2", _t("nothing_found_oops")),
              m("img.search-world[src=img/ui/checklist/search_world.svg]"),
              m(".nothing-found-message", _t("nothing_found_checklist")),
              m(
                ".query",
                m.trust(
                  Settings.pinnedSearches.getHumanNameForPinnedItem(
                    JSON.parse(Checklist.queryKey())
                  )
                )
              ),
            ])
          : m(".checklist-inner-wrapper", [
              Checklist._isDraft ? draftNotice() : null,
              ChecklistView.displayMode != "" ? temporaryFilterNotice() : null,
              specificChecklistView,
            ]),
      ])
    );
  },
};

function detailedTaxonView(treeTaxa, overflowing) {
  return m(".listed-taxa", [
    Object.keys(treeTaxa.children).map(function (taxonLevel) {
      return m(TaxonView, {
        parents: [],
        taxonKey: taxonLevel,
        taxonTree: treeTaxa.children[taxonLevel],
        currentLevel: 0,
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

function hierarchyView(treeTaxa, allResultingTaxa) {
  let data = {
    name: "◯",
    children: [],
  };

  const maxDepth = Object.keys(Checklist.getTaxaMeta()).indexOf(
    ChecklistView.displayMode
  );

  for (const taxon of allResultingTaxa) {
    let currentDataItem = data;
    let depth = 0;
    for (const taxonLevel of taxon.t) {
      if (!currentDataItem.children) {
        currentDataItem.children = [];
      }

      let child = currentDataItem.children.find((i) => i.name == taxonLevel.n);
      if (child === undefined) {
        child = { name: taxonLevel.n, value: 1 };
        currentDataItem.children.push(child);
      }

      currentDataItem = child;

      if (maxDepth == depth) {
        break;
      }
      depth++;
    }
  }

  console.log(data);
  return m("div", "");
}

function draftNotice() {
  return m(
    ".temporary-notice",
    {
      onclick: function () {
        ChecklistView.displayMode = "";
      },
    },
    [
      m(".notice", _t("draft_notice")),
      m(
        "button.show-all",
        {
          onclick: function () {
            routeTo("/manage");
          },
        },
        [
          m("img.notice-icon[src=img/ui/menu/manage.svg]"),
          _t("temporary_draft_goto_manage"),
        ]
      ),
    ]
  );
}

function temporaryFilterNotice() {
  return m(
    ".temporary-notice",
    {
      onclick: function () {
        ChecklistView.displayMode = "";
      },
    },
    [
      m(
        ".notice",
        m.trust(
          _t("temporary_filter", [
            Checklist.getTaxaMeta()[ChecklistView.displayMode].name,
          ])
        )
      ),
      m("button.show-all", [
        m("img.notice-icon[src=img/ui/menu/filter_list_off.svg]"),
        _t("temporary_filter_show_all"),
      ]),
    ]
  );
}

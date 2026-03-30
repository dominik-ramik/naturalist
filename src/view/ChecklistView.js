import m from "mithril";
import "./ChecklistView.css";

import { routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { getCurrentTool } from "./analysisTools/index.js";

export let ChecklistView = {
  oninit: function () {
    if (!Checklist.hasSpecimens() && Settings.analyticalIntent() !== "#T") {
      Settings.analyticalIntent("#T");
    }

    ChecklistView.lastQuery = JSON.stringify(Checklist.queryKey());
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
    const filteredTaxa    = filterOutSpecimenTaxa(allFilteredTaxa);
    const allTaxa         = filterOutSpecimenTaxa(Checklist.getData().checklist);


    const specificView = getCurrentTool()
      ? getCurrentTool().render({ filteredTaxa, allTaxa, queryKey: ChecklistView.lastQuery })
      : null;

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
              specificView,
            ]),
      ])
    );
  },
};

// ─── Scope / specimen filter ───────────────────────────────────────────────
// Kept here because it is a view-layer routing concern that runs before
// dispatching to any tool. The "getCurrentTool().getTaxaAlongsideSpecimens" carve-out exists because
// ChecklistTree needs parent taxa to build the tree even in specimen mode.

function filterOutSpecimenTaxa(taxa) {
  const specimenMetaIndex = Checklist.getSpecimenMetaIndex();
  const intent   = Settings.analyticalIntent();
  
  let scoped = taxa;

  if (intent === "#T") {
    scoped = scoped.filter(function (taxon) {
      return (
        taxon.t?.[specimenMetaIndex] === null ||
        taxon.t?.[specimenMetaIndex] === undefined
      );
    });
  } else if (intent === "#S") {
    if (!getCurrentTool().getTaxaAlongsideSpecimens) {
      scoped = scoped.filter(function (taxon) {
        return (
          taxon.t?.[specimenMetaIndex] !== null &&
          taxon.t?.[specimenMetaIndex] !== undefined
        );
      });
    }
  }

  return scoped;
}

// ─── Notices ───────────────────────────────────────────────────────────────

let Notice = {
  view: function (vnode) {
    return m(
      ".temporary-notice" +
        (vnode.attrs.additionalClasses === undefined
          ? ""
          : "." + vnode.attrs.additionalClasses),
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
      Settings.checklistDisplayLevel("");
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
      Settings.checklistDisplayLevel("");
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

export let ButtonGroup = {
  view: function (vnode) {
    return m(".button-group-wrapper", [
      m("span.button-group-label", vnode.attrs.label),
      m(".button-group", vnode.attrs.buttons),
    ]);
  },
};

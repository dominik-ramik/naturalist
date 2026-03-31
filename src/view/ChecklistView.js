import m from "mithril";
import "./ChecklistView.css";

import { routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { getCurrentTool } from "./analysisTools/index.js";
import { describeNonDefaultParams, resetAllToDefaults } from "./shared/ToolParams.js";

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

    if (currentQuery !== ChecklistView.lastQuery) {
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
        const listed = document.getElementsByClassName("listed-taxa");
        if (listed && listed.length > 0) listed[0].scrollTo(0, 0);
      }, 100);
    }

    const allFilteredTaxa = Checklist.getTaxaForCurrentQuery();
    const filteredTaxa    = filterOutSpecimenTaxa(allFilteredTaxa);
    const allTaxa         = filterOutSpecimenTaxa(Checklist.getData().checklist);

    const tool = getCurrentTool();
    const specificView = tool
      ? tool.render({ filteredTaxa, allTaxa, queryKey: ChecklistView.lastQuery })
      : null;

    return m(
      ".checklist[style=background: linear-gradient(45deg, " +
        Checklist.getThemeHsl("dark") + ", " +
        Checklist.getThemeHsl("light") + ");]",
      m(".checklist-inner-wrapper", [
        allFilteredTaxa.length === 0
          ? m(".nothing-found-wrapper", [
              m("h2", t("nothing_found_oops")),
              m("img.search-world[src=img/ui/checklist/search_world.svg]"),
              m(".nothing-found-message", t("nothing_found_checklist")),
              m(".query", m.trust(Settings.pinnedSearches.getHumanNameForSearch())),
            ])
          : m(".checklist-inner-wrapper", [
              Checklist._isDraft ? draftNotice() : null,
              !Checklist.filter.isEmpty() ? mobileFilterOnNotice() : null,
              // Show the non-default params notice whenever the active tool has
              // params that deviate from their declared defaults.
              tool ? modifiedParamsNotice(tool) : null,
              specificView,
            ]),
      ])
    );
  },
};

// ─── Scope / specimen filter ──────────────────────────────────────────────────

function filterOutSpecimenTaxa(taxa) {
  const specimenMetaIndex = Checklist.getSpecimenMetaIndex();
  const intent = Settings.analyticalIntent();

  let scoped = taxa;

  if (intent === "#T") {
    scoped = scoped.filter(taxon =>
      taxon.t?.[specimenMetaIndex] === null ||
      taxon.t?.[specimenMetaIndex] === undefined
    );
  } else if (intent === "#S") {
    if (!getCurrentTool()?.getTaxaAlongsideSpecimens) {
      scoped = scoped.filter(taxon =>
        taxon.t?.[specimenMetaIndex] !== null &&
        taxon.t?.[specimenMetaIndex] !== undefined
      );
    }
  }

  return scoped;
}

// ─── Non-default params notice ────────────────────────────────────────────────
//
// Appears when the active tool has one or more parameters set to a non-default
// value, signalling to the user that the view is "customised".  A "Reset"
// button returns all params to their declared defaults in one click.
//
// Visual contract: .params-modified-notice uses amber/warning tones to
// distinguish it from the blue filter notice and the red draft notice.
// Suggested CSS (add to ChecklistView.css):
//
//   .params-modified-notice {
//     background: #fef3c7;  /* amber-100 */
//     border-left: 3px solid #f59e0b; /* amber-400 */
//     color: #78350f; /* amber-900 */
//   }
//   .params-modified-notice .notice-reset-btn {
//     background: transparent;
//     border: 1px solid currentColor;
//     border-radius: 4px;
//     cursor: pointer;
//     font-size: 0.8em;
//     margin-left: 0.5em;
//     padding: 2px 8px;
//     white-space: nowrap;
//   }

function modifiedParamsNotice(tool) {
  if (!tool.parameters?.length) return null;

  const scope       = Settings.analyticalIntent() || "#T";
  const descriptions = describeNonDefaultParams(tool.parameters, scope);

  if (descriptions.length === 0) return null;

  const summaryText = descriptions.join(" · ");

  return m(".temporary-notice.params-modified-notice", [
    m(".notice", [
      m("strong", "Modified view: "),
      summaryText,
    ]),
    m("button.notice-reset-btn", {
      onclick: (e) => {
        e.stopPropagation();
        resetAllToDefaults(tool.parameters);
      },
    }, "↺ Reset to defaults"),
  ]);
}

// ─── Existing notices (unchanged) ────────────────────────────────────────────

let Notice = {
  view: function (vnode) {
    return m(
      ".temporary-notice" +
        (vnode.attrs.additionalClasses === undefined
          ? ""
          : "." + vnode.attrs.additionalClasses),
      { onclick: vnode.attrs.action },
      [
        m(".notice", vnode.attrs.notice),
        vnode.attrs.additionalButton === undefined
          ? null
          : m("button.show-all", { onclick: vnode.attrs.additionalButton.action }, [
              m(
                "img.notice-icon[src=img/ui/menu/" +
                  vnode.attrs.additionalButton.icon + ".svg]"
              ),
              vnode.attrs.additionalButton.text,
            ]),
      ]
    );
  },
};

function mobileFilterOnNotice() {
  return m(Notice, {
    additionalClasses: ".mobile-filter-on",
    action: function () { Settings.checklistDisplayLevel(""); },
    notice: m.trust(
      tf("mobile_filter_notice", [Settings.pinnedSearches.getHumanNameForSearch()], true)
    ),
  });
}

function draftNotice() {
  return m(Notice, {
    action: function () { Settings.checklistDisplayLevel(""); },
    notice: t("draft_notice"),
    additionalButton: {
      action: function () { routeTo("/manage/review"); },
      icon:   "manage",
      text:   t("temporary_draft_goto_manage"),
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
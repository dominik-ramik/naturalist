import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import "./ChecklistView.css";

import { routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { getCurrentTool } from "./analysisTools/index.js";
import { describeNonDefaultParams, resetAllToDefaults } from "./shared/ToolParams.js";
import { ANALYTICAL_INTENT_OCCURRENCE, ANALYTICAL_INTENT_TAXA } from "../model/nlDataStructureSheets.js";

registerMessages(selfKey, {
  en: {
    nothing_found_oops: "Oops!",
    nothing_found_checklist: "We searched the world for you, but found nothing that matches your query",
    mobile_filter_notice: "Showing only taxa where {0}",
    temporary_draft_goto_manage: "Manage",
    draft_notice: "You are viewing a draft version of the project only visible to you. Click on Manage to manage the data or refresh the page to show the current published data.",
  },
  fr: {
    nothing_found_oops: "Oups !",
    nothing_found_checklist: "Nous avons cherché dans le monde pour vous, mais nous n'avons trouvé aucun résultat correspondant à votre requête",
    mobile_filter_notice: "Affichage uniquement des taxons où {0}",
    temporary_draft_goto_manage: "Gérer",
    draft_notice: "Vous visualisez une version brouillon du projet, uniquement visible par vous. Cliquez sur Gérer pour gérer les données ou rafraîchissez la page pour afficher les données publiées actuelles.",
  }
});

export let ChecklistView = {
  oninit: function () {
    if (!Checklist.hasOccurrences() && Settings.analyticalIntent() !== ANALYTICAL_INTENT_TAXA) {
      Settings.analyticalIntent(ANALYTICAL_INTENT_TAXA);
    }
    ChecklistView.lastQuery = JSON.stringify(Checklist.queryKey());
    ChecklistView._syncFilterFromRoute();
  },

  onbeforeupdate: function () {
    ChecklistView._syncFilterFromRoute();
  },

  // Applies URL query params to the filter model.  Extracted from view() so
  // that state mutations never happen while Mithril is building the vnode tree.
  _syncFilterFromRoute: function () {
    if (!Checklist._isDataReady) return;

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
  },

  view: function () {
    if (!Checklist._isDataReady) {
      return m(".checklist");
    }

    const allFilteredTaxa = Checklist.getTaxaForCurrentQuery();
    const filteredTaxa = filterOutOccurrenceTaxa(allFilteredTaxa);
    const allTaxa = filterOutOccurrenceTaxa(Checklist.getData().checklist);
    const datasetRevision = Checklist.getDataRevision();

    const tool = getCurrentTool();
    const specificView = tool
      ? tool.render({
        filteredTaxa,
        allTaxa,
        queryKey: ChecklistView.lastQuery,
        datasetRevision,
      })
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

// ─── Scope / occurrence filter ──────────────────────────────────────────────────

function filterOutOccurrenceTaxa(taxa) {
  const occurrenceMetaIndex = Checklist.getOccurrenceMetaIndex();
  const intent = Settings.analyticalIntent();

  let scoped = taxa;

  if (intent === ANALYTICAL_INTENT_TAXA) {
    scoped = scoped.filter(taxon =>
      taxon.t?.[occurrenceMetaIndex] === null ||
      taxon.t?.[occurrenceMetaIndex] === undefined
    );
  } else if (intent === ANALYTICAL_INTENT_OCCURRENCE) {
    if (!getCurrentTool()?.getTaxaAlongsideOccurrences) {
      scoped = scoped.filter(taxon =>
        taxon.t?.[occurrenceMetaIndex] !== null &&
        taxon.t?.[occurrenceMetaIndex] !== undefined
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

  const scope = Settings.analyticalIntent() || ANALYTICAL_INTENT_TAXA;
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
    additionalClasses: "draft-notice",
    action: function () { Settings.checklistDisplayLevel(""); },
    notice: t("draft_notice"),
    additionalButton: {
      action: function () { routeTo("/manage/review"); },
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

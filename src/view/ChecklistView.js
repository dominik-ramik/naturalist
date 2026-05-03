import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import "./ChecklistView.css";

import { routeTo, updateRouteParams, isInDemoMode } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { getCurrentTool } from "./analysisTools/index.js";
import { describeNonDefaultParams, resetAllToDefaults } from "./shared/ToolParams.js";
import { ANALYTICAL_INTENT_OCCURRENCE, ANALYTICAL_INTENT_TAXA } from "../model/nlDataStructureSheets.js";
import { collapsePaneAndDismissKeyboard } from "../components/MobileInteraction.js";

registerMessages(selfKey, {
  en: {
    nothing_found_oops: "Fall came too early?",
    nothing_found_checklist: "This taxonomic tree branch has no leaves",
    nothing_found_message: "No matches found for query",
    nothing_found_message_hint: "Try broadening your query or adjusting your filters",
    mobile_filter_notice: "Showing only taxa where {0}",
    temporary_draft_goto_manage: "Manage",
    draft_notice: "You are viewing a draft version of the project only visible to you. Click on Manage to manage the data or refresh the page to show the current published data.",
    welcome_headline_tagline: "The flexible biodiversity data publishing platform",
    welcome_tagline: "Publish <strong>checklists</strong>, curate <strong>collections</strong>, and explore your data through filters, search, and analysis tools <strong>built for discovery</strong> — all from a single spreadsheet.",
    welcome_blessing: "May your taxonomic tree grow to the sky.",
    demo_mode_badge: "Demo",
    demo_mode_notice: "This is a demo instance - load an example to see <b>NaturaList</b> in action.",
    demo_mode_btn: "Explore examples gallery",
    demo_mode_btn_main: "Open featured example",
  },
  fr: {
    nothing_found_oops: "Rien trouvé",
    nothing_found_checklist: "Cette branche de l'arbre taxonomique n'a pas de feuilles",
    nothing_found_message: "Aucun résultat trouvé pour la requête",
    nothing_found_message_hint: "Try broadening your query or adjusting your filters",
    mobile_filter_notice: "Affichage uniquement des taxons où {0}",
    temporary_draft_goto_manage: "Gérer",
    draft_notice: "Vous visualisez une version brouillon du projet, uniquement visible par vous. Cliquez sur Gérer pour gérer les données ou rafraîchissez la page pour afficher les données publiées actuelles.",
    welcome_headline: "Bienvenue sur NaturaList",
    welcome_headline_tagline: "La plateforme flexible de publication de données sur la biodiversité",
    welcome_tagline: "Publiez des <strong>listes de taxons</strong>, organisez des <strong>collections</strong>, analysez les données et explorez les espèces, motifs et caractéristiques, et construisez des <strong>clés d'identification</strong> - tout cela à partir d'une seule feuille de calcul.",
    welcome_blessing: "Que votre arbre taxonomique pousse jusqu'au ciel.",
    demo_mode_badge: "Démo",
    demo_mode_notice: "Il s'agit d'une instance de démonstration - chargez un exemple pour voir <b>NaturaList</b> en action.",
    demo_mode_btn: "Explorer la galerie d'exemples",
    demo_mode_btn_main: "Ouvrir l'exemple phare",
  }
});

export let ChecklistView = {
  oninit: function () {
    ChecklistView.lastQuery = JSON.stringify(Checklist.queryKey());
    ChecklistView._syncFilterFromRoute();
    ChecklistView._syncIntentToDataset();
  },

  onbeforeupdate: function () {
    ChecklistView._syncFilterFromRoute();
    ChecklistView._syncIntentToDataset();
  },

  /**
   * Ensures the analytical intent stored in Settings is compatible with the
   * shape of the loaded dataset. Called from oninit and onbeforeupdate — always
   * before Mithril builds the vnode tree — so no state mutations happen during
   * render.
   *
   * Uses Checklist.availableIntents() as the single source of truth. If the
   * current intent is not in the available list, we redirect to the first
   * available intent and keep the URL in sync via updateRouteParams().
   *
   * This is intentionally separate from requestIntentChange() (user-driven) and
   * validateActiveToolState() (tool-availability concern).
   */
  _syncIntentToDataset: function () {
    if (!Checklist._isDataReady) return;

    const intents = Checklist.availableIntents();
    const intent = Settings.analyticalIntent();

    if (!intents.includes(intent)) {
      Settings.analyticalIntent(intents[0] ?? ANALYTICAL_INTENT_TAXA);
      updateRouteParams();
    }
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
    // In view(), replace the early-return guard:
    if (!Checklist._isDataReady) {
      return m(
        ".checklist",
        m(".welcome-wrapper", [
          m(".fresh-install-welcome", [
            // Demo-mode notice — visible only when served from a /demo/ subfolder
            ...(isInDemoMode ? [
              m(".demo-notice", [
                m("span.demo-notice-badge", t("demo_mode_badge")),
                m("p.demo-notice-text", m.trust(t("demo_mode_notice"))),
                m("a.demo-notice-btn[href=../examples]", t("demo_mode_btn")),
                //m("a.demo-notice-btn[href=../examples/pmp]", t("demo_mode_btn_main")), // TODO add example
              ]),
              m("hr.welcome-divider"),
            ] : []),
            // Category stamp — sets context before the brand name lands
            // Primary greeting with brand name
            m("h1.welcome-title", [
              "Welcome to ", m("span.brand-name", "NaturaList"),
            ]),
            m("p.welcome-subtitle", t("welcome_headline_tagline")),
            // Visual break between identity block and capability copy
            m("hr.welcome-divider"),
            // Feature summary — key actions bolded in the i18n string via <strong>
            m("p.welcome-body", m.trust(t("welcome_tagline"))),
            // Poetic sign-off — flanking rules mark it as decorative, not content
            m(".welcome-closing-wrapper", [
              m("span.welcome-closing", t("welcome_blessing")),
            ]),
          ]),
          m(".welcome-illustration", [
            m("img[src=img/icon_maskable.svg]")
          ]),
        ])
      );
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
      m(".checklist-inner-wrapper", {
        oncreate: function (vnode) {
          vnode.dom.addEventListener(
            "scroll",
            collapsePaneAndDismissKeyboard,
            { capture: true, passive: true }
          );
        },
        onremove: function (vnode) {
          vnode.dom.removeEventListener(
            "scroll",
            collapsePaneAndDismissKeyboard,
            { capture: true }
          );
        },
      }, [
        allFilteredTaxa.length === 0
          ? m(".nothing-found-wrapper", [
            m("p.nothing-found-eyebrow", t("nothing_found_oops")),
            m("h2.nothing-found-heading", t("nothing_found_checklist")),
            m("img.search-world[src=img/ui/checklist/nothing-found.svg]"),
            m("p.nothing-found-message", [
              t("nothing_found_message"),
              " ", m("span.query", m.trust(Settings.pinnedSearches.getHumanNameForSearch()))
            ]),
            m("p.nothing-found-message", t("nothing_found_message_hint")),
          ])
          : m(".checklist-results-wrapper", [
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
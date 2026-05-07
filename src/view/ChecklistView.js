import m from "mithril";
import {  t, tf } from 'virtual:i18n-self';
import "./ChecklistView.css";

import { routeTo, updateRouteParams, isInDemoMode } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { CacheManager } from "../model/CacheManager.js";
import { getCurrentTool } from "./analysisTools/index.js";
import { describeNonDefaultParams, resetAllToDefaults } from "./shared/ToolParams.js";
import { ANALYTICAL_INTENT_OCCURRENCE, ANALYTICAL_INTENT_TAXA } from "../model/DataStructure.js";
import { collapsePaneAndDismissKeyboard } from "../components/MobileInteraction.js";
import { Icon } from "../components/Icon.js";
import { mdiCog, mdiCogOutline } from "@mdi/js";

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
   * shape of the loaded dataset. Called from oninit and onbeforeupdate - always
   * before Mithril builds the vnode tree - so no state mutations happen during
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
            // Demo-mode notice - visible only when served from a /demo/ subfolder
            ...(isInDemoMode ? [
              m(".demo-notice", [
                m("span.demo-notice-badge", t("demo_mode_badge")),
                m("p.demo-notice-text", m.trust(t("demo_mode_notice"))),
                m("a.demo-notice-btn[href=../examples]", t("demo_mode_btn")),
                //m("a.demo-notice-btn[href=../examples/pmp]", t("demo_mode_btn_main")), // TODO add example
              ]),
              m("hr.welcome-divider"),
            ] : []),
            // Category stamp - sets context before the brand name lands
            // Primary greeting with brand name
            m("h1.welcome-title", [
              "Welcome to ", m("span.brand-name", "NaturaList"),
            ]),
            m("p.welcome-subtitle", t("welcome_headline_tagline")),
            // Visual break between identity block and capability copy
            m("hr.welcome-divider"),
            // Feature summary - key actions bolded in the i18n string via <strong>
            m("p.welcome-body", m.trust(t("welcome_tagline"))),
            // Poetic sign-off - flanking rules mark it as decorative, not content
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
    const dataContextRevision = CacheManager.contextRevision();

    const tool = getCurrentTool();
    const specificView = tool
      ? tool.render({
        filteredTaxa,
        allTaxa,
        queryKey: ChecklistView.lastQuery,
        dataContextRevision,
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
            m("img.search-world[src=img/nothing-found.svg]"),
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
    const { accent, bg, text, btnHoverBg } = vnode.attrs;
    const style = {};
    if (accent)      style["--notice-accent"]       = accent;
    if (bg)         style["--notice-bg"]            = bg;
    if (text)       style["--notice-text"]          = text;
    if (btnHoverBg) style["--notice-btn-hover-bg"]  = btnHoverBg;
    return m(
      ".temporary-notice" +
      (vnode.attrs.additionalClasses === undefined
        ? ""
        : "." + vnode.attrs.additionalClasses),
      {
        onclick: vnode.attrs.action,
        style,
      },
      [
        m(".notice", vnode.attrs.notice),
        vnode.attrs.additionalButton === undefined
          ? null
          : m("button.show-all", { onclick: vnode.attrs.additionalButton.action }, [
            m(Icon, { path: vnode.attrs.additionalButton.icon, size: 18, color: vnode.attrs.accent }),
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
    accent:      "#d97706",
    bg:          "rgba(254, 243, 199, 0.92)",
    text:        "#78350f",
    btnHoverBg:  "rgba(217, 119, 6, 0.08)",
    action: function () { Settings.checklistDisplayLevel(""); },
    notice: t("draft_notice"),
    additionalButton: {
      action: function () { routeTo("/manage"); },
      icon: mdiCogOutline,
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

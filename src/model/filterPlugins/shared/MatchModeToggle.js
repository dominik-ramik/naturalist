/**
 * MatchModeToggle.js - progressive-disclosure Boolean-mode picker.
 */

import m from "mithril";
import { t, tf } from 'virtual:i18n-self';
import "./MatchModeToggle.css";



// ── Public mode constants (imported by every opt-in plugin) ───────────────────

export const MATCH_MODES = Object.freeze({
  ANY: "any",
  ALL: "all",
  EXCLUDE: "exclude",
});

const MODE_DESCRIPTORS = [
  {
    mode: MATCH_MODES.ANY,
    labelKey: "match_mode_any",
    subtitleKey: "match_mode_any_sub",
    summaryKey: "match_mode_any_summary",
    requiresAllFlag: false,
  },
  {
    mode: MATCH_MODES.ALL,
    labelKey: "match_mode_all",
    subtitleKey: "match_mode_all_sub",
    summaryKey: "match_mode_all_summary",
    requiresAllFlag: true,
  },
  {
    mode: MATCH_MODES.EXCLUDE,
    labelKey: "match_mode_exclude",
    subtitleKey: "match_mode_exclude_sub",
    summaryKey: "match_mode_exclude_summary",
    requiresAllFlag: false,
  },
];

// ── Helper: Icons ─────────────────────────────────────────────────────────────

const getModeIcon = (mode) => {
  if (mode === MATCH_MODES.ALL) {
    return m("svg.match-mode-icon", { viewBox: "0 0 24 24", "aria-hidden": "true" }, [
      m("path", { d: "M2 12l4 4 8-8", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }),
      m("path", { d: "M7 17l4 4 8-8", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" })
    ]);
  }
  if (mode === MATCH_MODES.EXCLUDE) {
    return m("svg.match-mode-icon", { viewBox: "0 0 24 24", "aria-hidden": "true" }, [
      m("circle", { cx: "12", cy: "12", r: "10", fill: "none", stroke: "currentColor", "stroke-width": "2" }),
      m("line", { x1: "4.93", y1: "4.93", x2: "19.07", y2: "19.07", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" })
    ]);
  }
  // ANY
  return m("svg.match-mode-icon", { viewBox: "0 0 24 24", "aria-hidden": "true" }, [
    m("path", { d: "M5 12l5 5L20 7", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" })
  ]);
};

// ── Component ─────────────────────────────────────────────────────────────────

export let MatchModeToggle = function () {
  let configuring = false;

  return {
    view(vnode) {
      const { filterDef, supportsMatchAll, onCommit } = vnode.attrs;
      const currentMode = filterDef.matchMode || MATCH_MODES.ANY;

      const available = MODE_DESCRIPTORS.filter(
        d => !d.requiresAllFlag || supportsMatchAll
      );

      const currentDesc = available.find(d => d.mode === currentMode) || available[0];

      // ── Default / summary view ─────────────────────────────────────────────
      if (!configuring) {
        return m(".match-mode-toggle", [
          m(".match-mode-summary-container", [
            m("span.match-mode-summary", { class: "mode-" + currentMode }, [
              getModeIcon(currentMode),
              m("span", t(currentDesc.summaryKey))
            ])
          ]),
          m("button.match-mode-change-btn", {
            type: "button",
            onclick(e) { e.stopPropagation(); configuring = true; },
          }, t("match_mode_change")),
        ]);
      }

      // ── Configuration / radio view ─────────────────────────────────────────
      return m(".match-mode-config", [
        available.map(desc =>
          m("label.match-mode-option", { key: desc.mode }, [
            m("input[type=radio][name=matchMode]", {
              checked: currentMode === desc.mode,
              onchange() {
                filterDef.matchMode = desc.mode;
                configuring = false;
                onCommit();
              },
            }),
            m(".match-mode-option-text", [
              m("span.match-mode-option-label", { class: "mode-label-" + desc.mode }, [
                getModeIcon(desc.mode),
                m("span", t(desc.labelKey))
              ]),
              m("span.match-mode-option-sub", t(desc.subtitleKey)),
            ]),
          ])
        ),
        m("button.match-mode-cancel-btn", {
          type: "button",
          onclick(e) { e.stopPropagation(); configuring = false; },
        }, t("match_mode_cancel")),
      ]);
    },
  };
};
/**
 * MatchModeToggle.js — progressive-disclosure Boolean-mode picker.
 *
 * Shared by filterPluginText, filterPluginMonths, and filterPluginMapregions.
 * Rendered at the top of any opt-in plugin's inner-dropdown-area.
 *
 * Props
 * ─────
 *   filterDef       {object}  mutable filter definition — matchMode is read/written
 *   supportsMatchAll {boolean} when false the "all" option is omitted
 *   onCommit        {Function} called (with no arguments) after a mode change
 */

import m from "mithril";
import "./MatchModeToggle.css";

// ── Public mode constants (imported by every opt-in plugin) ───────────────────

export const MATCH_MODES = Object.freeze({
  ANY:     "any",
  ALL:     "all",
  EXCLUDE: "exclude",
});

// Static descriptor table — drives both the config panel and the summary line.
const MODE_DESCRIPTORS = [
  {
    mode:            MATCH_MODES.ANY,
    labelKey:        "match_mode_any",
    subtitleKey:     "match_mode_any_sub",
    summaryKey:      "match_mode_any_summary",
    requiresAllFlag: false,
  },
  {
    mode:            MATCH_MODES.ALL,
    labelKey:        "match_mode_all",
    subtitleKey:     "match_mode_all_sub",
    summaryKey:      "match_mode_all_summary",
    requiresAllFlag: true,   // omitted when supportsMatchAll is false
  },
  {
    mode:            MATCH_MODES.EXCLUDE,
    labelKey:        "match_mode_exclude",
    subtitleKey:     "match_mode_exclude_sub",
    summaryKey:      "match_mode_exclude_summary",
    requiresAllFlag: false,
  },
];

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
          m("span.match-mode-summary", t(currentDesc.summaryKey)),
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
              checked:   currentMode === desc.mode,
              onchange() {
                filterDef.matchMode = desc.mode;
                configuring         = false;
                onCommit();
              },
            }),
            m(".match-mode-option-text", [
              m("span.match-mode-option-label", t(desc.labelKey)),
              m("span.match-mode-option-sub",   t(desc.subtitleKey)),
            ]),
          ])
        ),
        m("button.match-mode-cancel-btn", {
          type:    "button",
          onclick(e) { e.stopPropagation(); configuring = false; },
        }, t("match_mode_cancel")),
      ]);
    },
  };
};
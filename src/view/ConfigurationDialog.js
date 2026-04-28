/**
 * ConfigurationDialog.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin dialog shell. It knows nothing about individual analysis tools - it only
 * iterates over TOOL_LIST entries and renders whatever each tool declares.
 *
 * Tool behaviour, parameters, labels and icons live in each tool's own file.
 * This file stays frozen.
 */

import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { Settings } from "../model/Settings.js";
import { Checklist } from "../model/Checklist.js";
import {
  TOOL_LIST,
  ANALYTICAL_INTENTS,
  requestToolChange,
  requestIntentChange,
} from "./analysisTools/index.js";
import { renderParams } from "./shared/ToolParams.js";

import "./ConfigurationDialog.css";
import { ANALYTICAL_INTENT_OCCURRENCE, ANALYTICAL_INTENT_TAXA } from "../model/nlDataStructureSheets.js";

registerMessages(selfKey, {
  en: {
    done: "Done",
    data_scope: "Data scope",
  },
  fr: {
    done: "Terminé",
    data_scope: "Portée des données",
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DIALOG COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ConfigurationDialog = {
  isOpen: false,
  open:  () => { ConfigurationDialog.isOpen = true; },
  close: () => { ConfigurationDialog.isOpen = false; },

  view() {
    if (!ConfigurationDialog.isOpen) return null;

    const checklistData   = Checklist.getData();

    const currentViewId  = Settings.viewType() || TOOL_LIST[0].id;
    const selectedScope  = Settings.analyticalIntent() || ANALYTICAL_INTENT_TAXA;

    const activeTool             = TOOL_LIST.find(v => v.id === currentViewId) || TOOL_LIST[0];
    const activeToolAvailability = activeTool.getAvailability(Checklist.availableIntents(), checklistData);

    // Render active tool parameters using the ToolParams framework.
    // `parameters` is now a declarative array; renderParams filters by scope
    // and builds the appropriate FormControl vnode for each descriptor.
    const renderedParams = activeTool.parameters?.length
      ? renderParams(activeTool.parameters, selectedScope)
      : null;

    const hasRenderedParams = renderedParams?.length > 0;

    return m(".configuration-dialog-overlay", { onclick: ConfigurationDialog.close }, [
      m(".configuration-dialog", { onclick: e => e.stopPropagation() }, [

        // ── Header ────────────────────────────────────────────────────────────
        m(".configuration-dialog-header", [
          m("h3.configuration-dialog-title", "Configuration"),
        ]),

        // ── Analysis Tool ─────────────────────────────────────────────────────
        m(".configuration-section", [
          m(".configuration-section-label", "Analysis Tool"),
          m(".configuration-scope-segmented",
            TOOL_LIST.map(tool => {
              const availability = tool.getAvailability(Checklist.availableIntents(), checklistData);
              const isDisabled   = !availability.isAvailable;

              return m(
                "button.configuration-scope-btn" +
                (currentViewId === tool.id ? ".active" : "") +
                (isDisabled ? ".disabled" : ""),
                {
                  onclick: (e) => {
                    if (isDisabled) return;
                    requestToolChange(tool.id, checklistData);
                    e.redraw = false;
                  },
                },
                [
                  m("img.configuration-scope-img", { src: tool.iconPath.dark, alt: "" }),
                  m(".configuration-scope-card-text", [
                    m("span.configuration-scope-label", tool.label),
                    tool.info ? m("small.configuration-scope-info", tool.info) : null,
                    isDisabled
                      ? m("small.configuration-scope-disabled-reason", availability.toolDisabledReason)
                      : null,
                  ]),
                ]
              );
            })
          ),
        ]),

        // ── Data Scope (only when occurrences exist) ────────────────────────────
        Checklist.availableIntents().length > 1 && m(".configuration-section", [
          m(".configuration-section-label", t("data_scope")),
          m(".configuration-scope-segmented",
            ANALYTICAL_INTENTS.map(scope => {
              const isScopeDisabled =
                !activeToolAvailability.supportedIntents.includes(scope.id);

              return m(
                "button.configuration-scope-btn" +
                (selectedScope === scope.id ? ".active" : "") +
                (isScopeDisabled ? ".disabled" : ""),
                {
                  onclick: (e) => {
                    if (isScopeDisabled) return;
                    requestIntentChange(scope.id, checklistData);
                    e.redraw = false
                  },
                },
                [
                  m("img.configuration-scope-img", { src: scope.iconPath.dark, alt: "" }),
                  m(".configuration-scope-card-text", [
                    m("span.configuration-scope-label", scope.label),
                    scope.info ? m("small.configuration-scope-info", scope.info) : null,
                    isScopeDisabled
                      ? m("small.configuration-scope-disabled-reason",
                          activeToolAvailability.scopeDisabledReason(scope.id))
                      : null,
                  ]),
                ]
              );
            })
          ),
        ]),

        // ── Tool Parameters ───────────────────────────────────────────────────
        // Only rendered when the active tool declares parameters AND at least
        // one is visible for the current scope.
        hasRenderedParams && m(".configuration-section", [
          m(".configuration-section-label", `${activeTool.label} - Parameters`),
          m(".configuration-params-card", renderedParams),
        ]),

        // ── Footer ────────────────────────────────────────────────────────────
        m(".configuration-dialog-footer", [
          m("button.configuration-confirm-btn",
            { onclick: ConfigurationDialog.close },
            t("done")
          ),
        ]),

      ]),
    ]);
  },
};
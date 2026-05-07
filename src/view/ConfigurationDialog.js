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
import { t, tf } from 'virtual:i18n-self';
import { Settings } from "../model/Settings.js";
import { Checklist } from "../model/Checklist.js";
import {
  TOOL_LIST,
  requestToolChange,
  requestIntentChange,
} from "./analysisTools/index.js";
import { ANALYTICAL_INTENTS_UI } from "../components/analyticalIntentIcons.js";
import { Icon } from "../components/Icon.js";
import { renderParams } from "./shared/ToolParams.js";

import "./ConfigurationDialog.css";
import { ANALYTICAL_INTENT_OCCURRENCE, ANALYTICAL_INTENT_TAXA } from "../model/DataStructure.js";

// ─────────────────────────────────────────────────────────────────────────────
// DIALOG COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ConfigurationDialog = {
  isOpen: false,
  open: () => { ConfigurationDialog.isOpen = true; },
  close: () => { ConfigurationDialog.isOpen = false; },

  view() {
    if (!ConfigurationDialog.isOpen) return null;

    const checklistData = Checklist.getData();

    const currentViewId = Settings.viewType() || TOOL_LIST[0].id;
    const selectedScope = Settings.analyticalIntent() || ANALYTICAL_INTENT_TAXA;

    const activeTool = TOOL_LIST.find(v => v.id === currentViewId) || TOOL_LIST[0];
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
              const isDisabled = !availability.isAvailable;

              const isActive = tool.id === currentViewId;

              return m(
                "button.configuration-scope-btn" +
                (isActive ? ".active" : "") +
                (isDisabled ? ".disabled" : ""),
                {
                  onclick: (e) => {
                    if (isDisabled) return;
                    requestToolChange(tool.id, checklistData);
                    e.redraw = false;
                  },
                },
                [
                  //m("img.configuration-scope-img", { src: tool.iconPath, alt: "" }),
                  m(Icon, { path: tool.iconPath }),
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
            ANALYTICAL_INTENTS_UI.map(scope => {
              const isScopeDisabled =
                !activeToolAvailability.supportedIntents.includes(scope.id);

              const isActive = scope.id === selectedScope;

              return m(
                "button.configuration-scope-btn" +
                (isActive ? ".active" : "") +
                (isScopeDisabled ? ".disabled" : ""),
                {
                  onclick: (e) => {
                    if (isScopeDisabled) return;
                    requestIntentChange(scope.id, checklistData);
                    e.redraw = false
                  },
                },
                [
                  m(Icon, { path: scope.icon }),
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
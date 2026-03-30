/**
 * ConfigurationDialog.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin dialog shell. It knows nothing about individual analysis tools — it only
 * iterates over VIEW_REGISTRY entries supplied by the router index and renders
 * whatever each tool declares.
 *
 * To change tool behaviour, parameters, labels or icons: edit ViewRegistry.js
 * (or the tool's own file once you've split them out). This file stays frozen.
 */

import m from "mithril";
import { Settings } from "../model/Settings.js";
import { Checklist } from "../model/Checklist.js";
import { 
  TOOL_LIST, 
  SCOPE_CHOICES, 
  requestToolChange, 
  requestIntentChange 
} from "./analysisTools/index.js";

import "./ConfigurationDialog.css";

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE CONFIGURATION
// Scope is a dialog-level concern (not per-tool), so it stays here.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine which scope chip should appear active in the UI.
 */
const isScopeActiveForUI = (scopeId, persistedScope, toolId) => {
  if (persistedScope === scopeId) return true;  
  return false;
};


// ─────────────────────────────────────────────────────────────────────────────
// DIALOG COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ConfigurationDialog = {
  isOpen: false,
  open:  () => { ConfigurationDialog.isOpen = true; },
  close: () => { ConfigurationDialog.isOpen = false; },

  view() {
    if (!ConfigurationDialog.isOpen) return null;

    const hasSpecimens = Checklist.hasSpecimens();
    const availableIntents = hasSpecimens ? ["#T", "#S"] : ["#T"];
    const checklistData = Checklist.getData(); // Used to evaluate tool availability

    const currentViewId = Settings.viewType() || TOOL_LIST[0].id;
    const selectedScope = Settings.analyticalIntent() || "#T";

    const activeTool = TOOL_LIST.find(v => v.id === currentViewId) || TOOL_LIST[0];
    const activeToolAvailability = activeTool.getAvailability(availableIntents, checklistData);
    const toolParams = activeTool.parameters?.(selectedScope);

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
              const availability = tool.getAvailability(availableIntents, checklistData);
              const isDisabled = !availability.isAvailable;

              return m("button.configuration-scope-btn" + 
                (currentViewId === tool.id ? ".active" : "") +
                (isDisabled ? ".disabled" : ""),
              {
                // Removed 'title' attribute for mobile accessibility
                onclick: () => {
                  if (isDisabled) return;
                  requestToolChange(tool.id, checklistData);
                }
              }, [
                m("img.configuration-scope-img", { src: tool.iconPath.dark, alt: "" }),
                m(".configuration-scope-card-text", [
                  m("span.configuration-scope-label", tool.label),
                  tool.info ? m("small.configuration-scope-info", tool.info) : null,
                  // NEW: Render the disabled reason directly into the UI if unavailable
                  isDisabled ? m("small.configuration-scope-disabled-reason", availability.toolDisabledReason) : null
                ])
              ])
            })
          )
        ]),

        // ── Data Scope (only when specimens exist) ────────────────────────────
        hasSpecimens && m(".configuration-section", [
          m(".configuration-section-label", "Data Scope"),
          m(".configuration-scope-segmented",
            SCOPE_CHOICES.map(scope => {
              const isScopeDisabled = !activeToolAvailability.supportedIntents.includes(scope.id);

              return m("button.configuration-scope-btn" +
                  (selectedScope === scope.id ? ".active" : "") +
                  (isScopeDisabled ? ".disabled" : ""),
                {
                  // Removed 'title' attribute for mobile accessibility
                  onclick: () => {
                    if (isScopeDisabled) return;
                    requestIntentChange(scope.id, checklistData);
                  }
                },
                [
                  m("img.configuration-scope-img", { src: scope.iconPath.dark, alt: "" }),
                  m(".configuration-scope-card-text", [
                    m("span.configuration-scope-label", scope.label),
                    scope.info ? m("small.configuration-scope-info", scope.info) : null,
                    // NEW: Render the disabled reason directly into the UI if unavailable
                    isScopeDisabled ? m("small.configuration-scope-disabled-reason", activeToolAvailability.scopeDisabledReason(scope.id)) : null
                  ])
                ]
              )
            })
          )
        ]),

        // ── Tool Parameters (contextual — rendered only if the tool declares them) ──
        toolParams && m(".configuration-section", [
          m(".configuration-section-label",
            `${activeTool.label} — Parameters`
          ),
          m(".configuration-params-card", toolParams)
        ]),

        // ── Footer ────────────────────────────────────────────────────────────
        m(".configuration-dialog-footer", [
          m("button.configuration-confirm-btn",
            { onclick: ConfigurationDialog.close },
            "Done"
          )
        ]),

      ])
    ]);
  }
};
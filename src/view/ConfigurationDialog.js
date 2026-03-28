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
import { VIEW_REGISTRY } from "./ViewRegistry.js";


// ─────────────────────────────────────────────────────────────────────────────
// SCOPE CONFIGURATION
// Scope is a dialog-level concern (not per-tool), so it stays here.
// ─────────────────────────────────────────────────────────────────────────────

const SCOPE_CHOICES = [
  {
    id: "#T",
    label: "Taxa",
    iconPath: "./img/ui/checklist/taxonomy.svg",
    info: "Taxon-level analyses."
  },
  {
    id: "#S",
    label: "Specimens",
    iconPath: "./img/ui/checklist/tag.svg",
    info: "Specimen-focused record detail."
  },
];

/**
 * Map a user-chosen scope id to the value that should be persisted, given the
 * currently active tool.  Checklist in Specimen mode stores "#M" (mixed) so
 * the app can render taxa + specimens together.
 */
const persistScopeForTool = (scopeId, toolId) => {
  if (toolId === "view_details" && scopeId === "#S") return "#M";
  return scopeId;
};

/**
 * Determine which scope chip should appear active in the UI.
 * If persisted value is "#M" and we're on the Checklist tool, highlight the
 * Specimens button so the user sees their selection reflected.
 */
const isScopeActiveForUI = (scopeId, persistedScope, toolId) => {
  if (persistedScope === scopeId) return true;
  if (persistedScope === "#M" && scopeId === "#S" && toolId === "view_details") return true;
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

    const hasSpecimens  = Checklist.hasSpecimens();
    const currentViewId = Settings.viewType() || VIEW_REGISTRY[0].id;
    const selectedScope = Settings.analyticalIntent() || "#T";
    const activeTool    = VIEW_REGISTRY.find(v => v.id === currentViewId) || VIEW_REGISTRY[0];
    const toolParams    = activeTool.parameters?.(selectedScope);

    return m(".configuration-dialog-overlay", { onclick: ConfigurationDialog.close }, [
      m(".configuration-dialog", { onclick: e => e.stopPropagation() }, [

        // ── Header ────────────────────────────────────────────────────────────
        m(".configuration-dialog-header", [
          m("h3.configuration-dialog-title", "Configuration"),
        ]),

        // ── Analysis Tool ─────────────────────────────────────────────────────
        m(".configuration-section", [
          m(".configuration-section-label", "Analysis Tool"),
          m(".configuration-tool-grid",
            VIEW_REGISTRY.map(tool =>
              m("button.configuration-tool-card" + (currentViewId === tool.id ? ".active" : ""), {
                onclick: () => Settings.viewType(tool.id)
              }, [
                m("img.configuration-tool-img", { src: tool.iconPath, alt: "" }),
                m(".configuration-tool-card-text", [
                  m("span.configuration-tool-label", tool.label),
                  m("small.configuration-tool-info",  tool.info),
                ])
              ])
            )
          )
        ]),

        // ── Data Scope (only when specimens exist) ────────────────────────────
        hasSpecimens && m(".configuration-section", [
          m(".configuration-section-label", "Data Scope"),
          m(".configuration-scope-segmented",
            SCOPE_CHOICES.map(scope =>
              m("button.configuration-scope-btn" +
                  (isScopeActiveForUI(scope.id, selectedScope, currentViewId) ? ".active" : ""),
                {
                  onclick: () =>
                    Settings.analyticalIntent(persistScopeForTool(scope.id, currentViewId))
                },
                [
                  m("img.configuration-scope-img", { src: scope.iconPath, alt: "" }),
                  m("span.configuration-scope-label", scope.label),
                ]
              )
            )
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
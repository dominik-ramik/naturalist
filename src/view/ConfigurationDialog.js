import m from "mithril";
import { Settings } from "../model/Settings.js";
import { Checklist } from "../model/Checklist.js";
import { ChecklistView } from "./ChecklistView.js";

const SCOPE_LABELS = { "#T": "Taxa", "#S": "Specimens", "#M": "Full Catalog" };

/** * 1. PROXY API (Commit Logic)
 * Central gatekeeper for all setting updates.
 */
const commit = (accessor, value) => {
  // Automatically cast numeric strings to Numbers (for CirclePack depth, etc.)
  const finalValue = (typeof value === "string" && !isNaN(value) && value !== "")
    ? parseInt(value)
    : value;

  accessor(finalValue);
  // Redraw is triggered automatically by Mithril after the event handler.
};

/** * 2. MODULAR PARAMETER COMPONENTS (KISS & DRY)
 */

const SelectSelector = {
  view: ({ attrs }) => {
    const { label, accessor, values } = attrs;
    return m("label.configuration-select-label", [
      label,
      m("select.configuration-select", {
        onchange: e => commit(accessor, e.target.value)
      }, (values || []).map(v => m("option", {
        value: v,
        selected: accessor() == v
      }, v === "" ? "All taxon levels" : v)))
    ]);
  }
};

const ChecklistToggle = {
  view: ({ attrs }) => {
    const { label, accessor } = attrs;
    return m("label.configuration-checkbox", [
      m("input[type=checkbox]", {
        checked: accessor(),
        onchange: () => commit(accessor, !accessor())
      }),
      label
    ]);
  }
};

const TaxonLevelSelector = {
  view: () => {
    const specimenIndex = Checklist.getSpecimenMetaIndex();
    const levels = Object.keys(Checklist.getTaxaMeta() || {}).filter((_, i) => i !== specimenIndex);
    const current = Settings.checklistDisplayLevel() || ChecklistView.displayMode || "";

    return m(SelectSelector, {
      label: "Limit checklist to taxon level:",
      accessor: (val) => {
        if (val === undefined) return current;
        Settings.checklistDisplayLevel(val);
        ChecklistView.displayMode = val;
      },
      values: ["", ...levels]
    });
  }
};

const showTaxonMetadataToggle = m(ChecklistToggle, { label: "Show taxon metadata", accessor: Settings.checklistShowTaxonMeta })

/**
 * 3. REGISTRY OF TOOL OPTIONS
 */
const VIEW_CHOICES = [
  {
    id: "view_details",
    label: "Checklist",
    iconPath: "./img/ui/menu/view_details.svg",
    info: "Browse the complete catalog and detailed records.",
    parameters: (scope) => [
      m(TaxonLevelSelector),
      ...(scope === "#T" ? [
        m(ChecklistToggle, { label: "Hide taxa without specimens", accessor: Settings.checklistPruneEmpty }),
        showTaxonMetadataToggle,
        m(ChecklistToggle, { label: "Show terminal taxa only", accessor: Settings.checklistShowTerminalOnly }),
        m(ChecklistToggle, { label: "Include children in search matches", accessor: Settings.checklistIncludeChildren }),
      ] : [
        m(ChecklistToggle, { label: "Show specimen metadata", accessor: Settings.checklistShowSpecimenMeta }),
        showTaxonMetadataToggle,
        m(ChecklistToggle, { label: "Hide taxa without specimens", accessor: Settings.checklistPruneEmpty }),
      ])
    ]
  },
  {
    id: "view_circle_pack",
    label: "Proportional Stacking",
    iconPath: "./img/ui/menu/view_circle_pack.svg",
    info: "Visualise relative abundances and proportions.",
    parameters: () => [
      m(".configuration-parameter-item", [
        m(SelectSelector, {
          label: "Maximum depth of levels displayed:",
          accessor: (val) => {
            if (val === undefined) return Settings.circlePackingMaxLevels();
            Settings.circlePackingMaxLevels(val);
          },
          values: [3, 4, 5, 6, 7]
        })
      ]),
      m(ChecklistToggle, { label: "Include children in search matches", accessor: Settings.checklistIncludeChildren })
    ]
  },
  {
    id: "view_category_density",
    label: "Cross-Tab Matrix",
    iconPath: "./img/ui/menu/view_category_density.svg",
    info: "Generate cross-tabulation and density statistics."
  },
  {
    id: "view_map",
    label: "Geospatial Map",
    iconPath: "./img/ui/menu/view_map.svg",
    info: "Spatial exploration and mapping of localities."
  },
];

const SCOPE_CHOICES = [
  { id: "#T", label: "Taxa", iconPath: "./img/ui/checklist/taxonomy.svg", info: "Taxon-level analyses." },
  { id: "#S", label: "Specimens", iconPath: "./img/ui/checklist/tag.svg", info: "Specimen-focused record detail." },
];

// Map a user-chosen scope to the value that should be persisted depending on
// the currently active analysis tool.
const persistScopeForTool = (scopeId, toolId) => {
  // When Checklist (view_details) is active, choosing Specimens should
  // persist as mixed-mode `#M` so the app can show taxa+specimens appropriately.
  if (toolId === "view_details" && scopeId === "#S") return "#M";
  return scopeId;
};

// Determine whether a scope button should appear active in the UI. If the
// persisted value is `#M` and we're on the Checklist tool, show the Specimens
// button as active so the user sees their choice reflected.
const isScopeActiveForUI = (scopeId, persistedScope, toolId) => {
  if (persistedScope === scopeId) return true;
  if (persistedScope === "#M" && scopeId === "#S" && toolId === "view_details") return true;
  return false;
};

/**
 * 4. MAIN DIALOG COMPONENT
 */
export const ConfigurationDialog = {
  isOpen: false,
  open: () => ConfigurationDialog.isOpen = true,
  close: () => ConfigurationDialog.isOpen = false,

  view() {
    if (!ConfigurationDialog.isOpen) return null;

    // 1. Data Availability Logic
    const hasSpecimens = Checklist.hasSpecimens();

    // 3. State Determination
    const currentViewId = Settings.viewType() || "view_details";
    const selectedScope = Settings.analyticalIntent() || "#T";
    const activeTool = VIEW_CHOICES.find(v => v.id === currentViewId) || VIEW_CHOICES[0];
    const toolParams = activeTool.parameters?.(selectedScope);

    return m(".configuration-dialog-overlay", { onclick: ConfigurationDialog.close }, [
      m(".configuration-dialog", { onclick: e => e.stopPropagation() }, [
        m(".configuration-dialog-header", [
          m("h3", "Configuration"),
        ]),

        // Section: Analysis Tool (The "How")
        m(".configuration-section", [
          m("h4", "Analysis Tool (The \"How\")"),
          m(".configuration-tool-grid", VIEW_CHOICES.map(v =>
            m("button.configuration-tool-card", {
              class: currentViewId === v.id ? "active" : "",
              onclick: () => commit(Settings.viewType, v.id)
            }, [
              m("img.configuration-tool-img", { src: v.iconPath }),
              m("span.configuration-tool-label", v.label),
              m("small", v.info)
            ])
          ))
        ]),

        // Section: Data Scope (The "What")
        hasSpecimens && m(".configuration-section", [
          m("h4", "Data Scope (The \"What\")"),
          m(".configuration-scope-grid", SCOPE_CHOICES.map(s =>
            m("button.configuration-scope-btn", {
              class: isScopeActiveForUI(s.id, selectedScope, currentViewId) ? "active" : "",
              onclick: () => commit(Settings.analyticalIntent, persistScopeForTool(s.id, currentViewId))
            }, [
              m("div", [
                m("img.configuration-scope-img", { src: s.iconPath }),
                m("span.configuration-scope-label", s.label),
              ]),
              m("small", s.info)
            ])
          ))
        ]),

        // Section: Modular Tool Parameters (Contextual)
        toolParams && m(".configuration-section", [
          m("h4", `${activeTool.label} Parameters (${SCOPE_LABELS[selectedScope] || "Global"})`),
          toolParams
        ]),

        m(".configuration-dialog-footer", [
          m("button.configuration-confirm-btn", { onclick: ConfigurationDialog.close }, "Confirm")
        ])
      ])
    ]);
  }
};
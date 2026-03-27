import m from "mithril";
import { Settings } from "../model/Settings.js";
import { Checklist } from "../model/Checklist.js";
import { ChecklistView } from "./ChecklistView.js";

const SCOPE_LABELS = { "#T": "Taxa", "#S": "Specimens", "#M": "Full Catalog" };

/** * Modular Parameter Components
 */

const SelectSelector = (label, accessor, values) => m("label.configuration-select-label", [
  label,
  m("select.configuration-select", {
    onchange: e => accessor(e.target.value)
  }, values.map(v => m("option", { value: v, selected: accessor() == v }, v)))
]);

const ChecklistToggle = (label, accessor) => m("label.configuration-checkbox", [
  m("input[type=checkbox]", {
    checked: accessor(),
    onchange: () => accessor(!accessor())
  }),
  label
]);

const TaxonLevelSelector = {
  view: () => {
    const specimenIndex = Checklist.getSpecimenMetaIndex();
    const levels = Object.keys(Checklist.getTaxaMeta() || {}).filter((_, i) => i !== specimenIndex);
    const current = Settings.checklistDisplayLevel() || ChecklistView.displayMode || "";

    return m(SelectSelector,
      "Limit checklist to taxon level:",
      (val) => {
        if (val === undefined) return current;
        Settings.checklistDisplayLevel(val);
        ChecklistView.displayMode = val;
      },
      ["", ...levels] // Logic for labels handled inside if needed, or passed as objects
    );
  }
};

const chkIncludeChildren = ChecklistToggle("Include children in search matches", Settings.checklistIncludeChildren);

/**
 * Registry of Tool Options.
 * The 'parameters' function allows contextual UI for any analysis tool.
 */
const VIEW_CHOICES = [
  {
    id: "view_details",
    label: "Checklist",
    iconPath: "./img/ui/menu/view_details.svg",
    info: "Browse the complete catalog and detailed records.",
    parameters: (scope) => scope !== "#M" && [
      m(TaxonLevelSelector),
      ...(scope === "#T" ? [
        ChecklistToggle("Hide taxa without specimens", Settings.checklistPruneEmpty),
        ChecklistToggle("Show taxon metadata", Settings.checklistShowTaxonMeta),
        ChecklistToggle("Show terminal taxa only", Settings.checklistShowTerminalOnly),
        chkIncludeChildren,
      ] : [
        ChecklistToggle("Show specimen metadata", Settings.checklistShowSpecimenMeta),
        ChecklistToggle("Hide taxa without specimens", Settings.checklistPruneEmpty),
      ])
    ]
  },
  {
    id: "view_circle_pack",
    label: "Proportional Stacking",
    iconPath: "./img/ui/menu/view_circle_pack.svg",
    info: "Visualise relative abundances and proportions.",
    parameters: () => [m(".configuration-parameter-item", [
      SelectSelector("Maximum depth of levels displayed:", Settings.circlePackingMaxLevels, [1, 2, 3, 4, 5, 6])
    ]), chkIncludeChildren]
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

export const ConfigurationDialog = {
  isOpen: false,
  open: () => ConfigurationDialog.isOpen = true,
  close: () => ConfigurationDialog.isOpen = false,

  view() {
    if (!ConfigurationDialog.isOpen) return null;

    // 1. Data Availability Logic
    const hasSpecimens = Checklist.hasSpecimens(); //

    // 2. Enforcement: Force "Taxa" if no specimens are present
    if (!hasSpecimens && Settings.analyticalIntent() !== "#T") {
      Settings.analyticalIntent("#T");
    }

    // 3. State Determination (Defaults to Checklist/Taxa)
    const currentViewId = Settings.viewType() || "view_details";
    const selectedScope = Settings.analyticalIntent() || "#T";
    const activeTool = VIEW_CHOICES.find(v => v.id === currentViewId) || VIEW_CHOICES[0];
    const toolParams = activeTool.parameters?.(selectedScope);

    return m(".configuration-dialog-overlay", { onclick: ConfigurationDialog.close }, [
      m(".configuration-dialog", { onclick: e => e.stopPropagation() }, [
        m(".configuration-dialog-header", [
          m("h3", "Configuration"),
          m("button", { onclick: ConfigurationDialog.close }, "×"),
        ]),

        // Section: Analysis Tool
        m(".configuration-section", [
          m("h4", "Analysis Tool (The \"How\")"),
          m(".configuration-tool-grid", VIEW_CHOICES.map(v =>
            m("button.configuration-tool-card", {
              class: currentViewId === v.id ? "active" : "",
              onclick: () => Settings.viewType(v.id)
            }, [
              m("img.configuration-tool-img", { src: v.iconPath }),
              m("span.configuration-tool-label", v.label),
              m("small", v.info)
            ])
          ))
        ]),

        // Section: Data Scope - HIDDEN if no specimens exist
        hasSpecimens && m(".configuration-section", [
          m("h4", "Data Scope (The \"What\")"),
          m(".configuration-scope-grid", SCOPE_CHOICES.map(s =>
            m("button.configuration-scope-btn", {
              class: selectedScope === s.id ? "active" : "",
              onclick: () => Settings.analyticalIntent(s.id)
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
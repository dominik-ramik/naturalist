import m from "mithril";
import { Settings } from "../model/Settings.js";
import { Checklist } from "../model/Checklist.js";
import { ChecklistView } from "./ChecklistView.js";

// Icons are represented as { provider: 'material'|'mdi', name: '<icon-name>' }
// Replace the placeholders with actual SVGs in img/icons/<provider>/<name>.svg
const VIEW_CHOICES = [
  { id: "view_details", icon: { provider: "material", name: "format_list_bulleted" }, iconPath: "./img/ui/menu/view_details.svg", label: "Checklist" },
  { id: "view_circle_pack", icon: { provider: "material", name: "bubble_chart" }, iconPath: "./img/ui/menu/view_circle_pack.svg", label: "Proportional Stacking" },
  { id: "view_category_density", icon: { provider: "material", name: "table_chart" }, iconPath: "./img/ui/menu/view_category_density.svg", label: "Cross-Tab Matrix" },
  { id: "view_map", icon: { provider: "material", name: "map" }, iconPath: "./img/ui/menu/view_map.svg", label: "Geospatial Map" },
];

const SCOPE_CHOICES = [
  {
    id: "#T",
    icon: { provider: "material", name: "local_florist" },
    iconPath: "./img/ui/checklist/taxonomy.svg",
    label: "Taxa Only",
    info: "Best for biological classification.",
  },
  {
    id: "#S",
    icon: { provider: "material", name: "science" },
    iconPath: "./img/ui/checklist/tag-dark.svg",
    label: "Specimens Only",
    info: "Best for collection/inventory audit.",
  },
];

function scopeLabel(scope) {
  if (scope === "#S") return "Specimens";
  if (scope === "#T") return "Taxa";
  return "Full Catalog";
}

function currentViewLabel(viewType) {
  const item = VIEW_CHOICES.find((v) => v.id === viewType);
  return item ? item.label : "Checklist";
}

function enforceScopeForView(targetViewType) {
  Settings.viewType(targetViewType);
  if (targetViewType !== "view_details" && Settings.analyticalIntent() === "#M") {
    Settings.analyticalIntent("#T");
  }
}

function previewText() {
  const view = Settings.viewType();
  const scope = Settings.analyticalIntent();
  if (view === "view_map" && scope === "#S") {
    return "Mapping exact physical collection points derived strictly from specimen data.";
  }
  if (view === "view_category_density" && scope === "#T") {
    return "Generating statistics based on taxonomic metadata (e.g., habitat by family).";
  }
  if (view === "view_details" && scope === "#M") {
    return "Browsing the complete catalog: every taxon and its attached physical records.";
  }
  return `Current setup: ${currentViewLabel(view)} using ${scopeLabel(scope)} scope.`;
}

export const ConfigurationDialog = {
  isOpen: false,
  open() {
    ConfigurationDialog.isOpen = true;
  },
  close() {
    ConfigurationDialog.isOpen = false;
  },
  view() {
    if (!ConfigurationDialog.isOpen) return null;

    const currentView = Settings.viewType();
    const selectedScope = Settings.analyticalIntent();
    const specimenIndex = Checklist.getSpecimenMetaIndex();
    // Build taxon level options excluding specimen level
    const taxonLevelKeys = Object.keys(Checklist.getTaxaMeta() || {}).filter((k, idx) => idx !== specimenIndex);
    const taxonLevelOptions = [""].concat(taxonLevelKeys);
    const isChecklist = currentView === "view_details";

    return m(".configuration-dialog-overlay", { onclick: () => ConfigurationDialog.close() }, [
      m(".configuration-dialog", { onclick: (e) => e.stopPropagation() }, [
        m(".configuration-dialog-header", [
          m("h3", "Configuration"),
          m("button", { onclick: () => ConfigurationDialog.close() }, "×"),
        ]),

        m(".configuration-section", [
          m("h4", "Analysis Tool (The \"How\")"),
          m(".configuration-tool-grid",
            VIEW_CHOICES.map((choice) =>
              m(
                "button.configuration-tool-card" +
                  (currentView === choice.id ? ".active" : ""),
                {
                  onclick: () => enforceScopeForView(choice.id),
                },
                [
                  choice.iconPath
                    ? m("img.configuration-tool-img[src=" + choice.iconPath + "]")
                    : m("span.icon", { "data-icon-provider": choice.icon.provider, "data-icon-name": choice.icon.name }),
                  m("span.configuration-tool-label", choice.label),
                ]
              )
            )
          ),
        ]),

        m(".configuration-section", [
          m("h4", "Data Scope (The \"What\")"),
          m(".configuration-scope-grid",
            SCOPE_CHOICES.map((choice) => {
              const disabled = false;
              return m(
                "button.configuration-scope-btn" +
                  (Settings.analyticalIntent() === choice.id ? ".active" : "") +
                  (disabled ? ".disabled" : ""),
                {
                  disabled,
                  onclick: () => {
                    if (!disabled) {
                      Settings.analyticalIntent(choice.id);
                    }
                  },
                },
                [
                  m("div", [
                    choice.iconPath
                      ? m("img.configuration-scope-img[src=" + choice.iconPath + "]")
                      : m("span.icon", { "data-icon-provider": choice.icon.provider, "data-icon-name": choice.icon.name }),
                    m("span.configuration-scope-label", choice.label),
                  ]),
                  m("small", choice.info),
                ]
              );
            })
          ),
        ]),

        isChecklist
          ? (function () {
              // Render only contextually-valid checklist parameters depending on selected scope
              if (selectedScope === "#T" || selectedScope === "#S") {
                // Show taxon-level selector for both Taxa and Specimens analytical intents
                return m(".configuration-section", [
                  m("h4", selectedScope === "#T" ? "Checklist Parameters (Taxa)" : "Checklist Parameters (Specimens)"),
                  // Taxon level selector (native select) - selecting sets display mode
                  (function () {
                    let currentLevel = Settings.checklistDisplayLevel();
                    if ((!currentLevel || currentLevel === "") && ChecklistView.displayMode) {
                      currentLevel = ChecklistView.displayMode;
                    }

                    return m(
                      "label.configuration-select-label",
                      [
                        "Limit checklist to taxon level:",
                        m(
                          "select.configuration-select",
                          {
                            onchange: function (e) {
                              const key = e.target.value;
                              Settings.checklistDisplayLevel(key);
                              ChecklistView.displayMode = key;
                              m.redraw();
                            },
                          },
                          taxonLevelOptions.map(function (key) {
                            const name = key === "" ? "All taxon levels" : Checklist.getNameOfTaxonLevel(key) || key;
                            return m("option", { value: key, selected: currentLevel === key }, name);
                          })
                        ),
                      ]
                    );
                  })(),

                  // Scope-specific toggles
                  selectedScope === "#T"
                    ? [
                        checklistToggle("Hide taxa without specimens", Settings.checklistPruneEmpty, null),
                        checklistToggle("Show taxon metadata", Settings.checklistShowTaxonMeta, null),
                        checklistToggle("Show terminal taxa only (Hide intermediate ranks)", Settings.checklistShowTerminalOnly, null),
                        checklistToggle("Include children in search matches", Settings.checklistIncludeChildren, null),
                      ]
                    : [
                        checklistToggle("Show specimen records", Settings.checklistShowSpecimens, null),
                        checklistToggle("Show specimen metadata", Settings.checklistShowSpecimenMeta, null),
                        // Also allow hiding taxa without specimens when viewing specimens
                        checklistToggle("Hide taxa without specimens", Settings.checklistPruneEmpty, null),
                      ],
                ]);
              } else {
                // Fallback: don't show parameters
                return null;
              }
            })()
          : null,

        m(".configuration-section.outcome-preview", [
          m("h4", "Outcome Preview"),
          m("p", previewText()),
        ]),
      ]),
    ]);
  },
};


function checklistToggle(label, accessor, disabled) {
  return m("label.configuration-checkbox" + (disabled ? ".disabled" : ""), [
    m("input[type=checkbox]", {
      disabled: !!disabled,
      checked: accessor(),
      onchange: () => accessor(!accessor()),
    }),
    label,
  ]);
}


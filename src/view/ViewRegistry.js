/**
 * ViewRegistry.js
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ROUTER INDEX for analysis-tool configurations.
 *
 * HOW TO ADD A NEW TOOL
 * ─────────────────────
 * 1. Create your tool file (e.g. MyNewView.js).
 * 2. In that file, export a config object conforming to the ToolConfig shape
 *    described below, importing SelectParam / ToggleParam as needed.
 * 3. Import it here and push it into VIEW_REGISTRY.
 * 4. ConfigurationDialog.js needs zero changes.
 *
 * ToolConfig shape
 * ────────────────
 * {
 *   id:         string,           // unique key stored in Settings.viewType()
 *   label:      string,           // human-readable name shown in the dialog & indicator
 *   iconPath:   object,           // path to the tool's SVG icon with light and dark variant
 *   info:       string,           // one-line description shown in the dialog card
 *   parameters: (scope) => [...], // optional — returns array of Mithril vnodes
 *                                 // called with the current scope id ("#T"|"#S")
 * }
 */

import m from "mithril";
import { Checklist } from "../model/Checklist.js";
import { ChecklistView } from "./ChecklistView.js";
import { Settings } from "../model/Settings.js";


// ─────────────────────────────────────────────────────────────────────────────
// SHARED PARAMETER COMPONENTS
// Export these so individual tool files can import and use them to build their
// own `parameters` functions without depending on ConfigurationDialog.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A labelled <select> backed by an accessor function.
 *
 * attrs:
 *   label    — string shown above the select
 *   accessor — getter/setter: accessor() reads, accessor(val) writes
 *   values   — array of option values (strings or numbers)
 */
export const SelectParam = {
  view: ({ attrs }) => {
    const { label, accessor, values } = attrs;
    return m("label.configuration-select-label", [
      label,
      m("select.configuration-select", {
        onchange: e => {
          const raw = e.target.value;
          // Auto-cast numeric strings (e.g. CirclePack depth values)
          const final = (typeof raw === "string" && raw !== "" && !isNaN(raw))
            ? parseInt(raw, 10)
            : raw;
          accessor(final);
        }
      }, (values || []).map(v =>
        m("option", { value: v, selected: accessor() == v },
          v === "" ? "All taxon levels" : v
        )
      ))
    ]);
  }
};

/**
 * A checkbox toggle backed by an accessor function.
 *
 * attrs:
 *   label    — string shown next to the checkbox
 *   accessor — getter/setter: accessor() reads, accessor(val) writes
 */
export const ToggleParam = {
  view: ({ attrs }) => {
    const { label, accessor } = attrs;
    return m("label.configuration-checkbox", [
      m("input[type=checkbox]", {
        checked: accessor(),
        onchange: () => accessor(!accessor())
      }),
      label
    ]);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Data scope choices (kept in the registry so dialog stays thin)
// These are UI-level metadata only: id, label, iconPath, info
// ─────────────────────────────────────────────────────────────────────────────
export const SCOPE_CHOICES = [
  {
    id: "#T",
    label: "Taxa",
    iconPath: {
      light: "./img/ui/checklist/taxonomy-light.svg",
      dark: "./img/ui/checklist/taxonomy.svg",
    },
    info: "Taxon-level analyses."
  },
  {
    id: "#S",
    label: "Specimens",
    iconPath: {
      light: "./img/ui/checklist/tag-light.svg",
      dark: "./img/ui/checklist/tag.svg",
    },
    info: "Specimen-focused record detail."
  },
];


// ─────────────────────────────────────────────────────────────────────────────
// TOOL CONFIGS
// Each object below will eventually live in its own analysis-tool file and be
// imported here. They are kept inline for now to avoid scattering changes
// before the tool files are ready to own their config.
// ─────────────────────────────────────────────────────────────────────────────

const ChecklistToolConfig = {
  id: "view_details",
  label: "Checklist",
  iconPath: {
    light: "./img/ui/menu/view_details-light.svg",
    dark: "./img/ui/menu/view_details.svg",
  },
  info: "Browse the complete catalog and detailed records.",

  parameters: (scope) => {
    // Derive available taxon levels dynamically from the loaded checklist
    const specimenIndex = Checklist.getSpecimenMetaIndex();
    const levels = Object.keys(Checklist.getTaxaMeta() || {})
      .filter((_, i) => i !== specimenIndex);
    const currentLevel = Settings.checklistDisplayLevel() || ChecklistView.displayMode || "";

    const taxonLevelSelector = m(SelectParam, {
      label: "Limit checklist to taxon level:",
      accessor: (val) => {
        if (val === undefined) return currentLevel;
        Settings.checklistDisplayLevel(val);
        ChecklistView.displayMode = val;
      },
      values: ["", ...levels]
    });

    const showTaxonMeta = m(ToggleParam, {
      label: "Show taxon metadata",
      accessor: Settings.checklistShowTaxonMeta
    });

    if (scope === "#T") {
      return [
        taxonLevelSelector,
        m(ToggleParam, { label: "Hide taxa without specimens", accessor: Settings.checklistPruneEmpty }),
        showTaxonMeta,
        m(ToggleParam, { label: "Show terminal taxa only",       accessor: Settings.checklistShowTerminalOnly }),
        m(ToggleParam, { label: "Include children in search matches", accessor: Settings.checklistIncludeChildren }),
      ];
    }

    // Specimen / Full-Catalog scope
    return [
      taxonLevelSelector,
      m(ToggleParam, { label: "Show specimen metadata", accessor: Settings.checklistShowSpecimenMeta }),
      showTaxonMeta,
      m(ToggleParam, { label: "Hide taxa without specimens", accessor: Settings.checklistPruneEmpty }),
    ];
  }
};


const CirclePackToolConfig = {
  id: "view_circle_pack",
  label: "Proportional Stacking",
  iconPath: {
    light: "./img/ui/menu/view_circle_pack-light.svg",
    dark: "./img/ui/menu/view_circle_pack.svg",
  },
  info: "Visualise relative abundances and proportions.",

  parameters: () => [
    m(SelectParam, {
      label: "Maximum depth of levels displayed:",
      accessor: (val) => {
        if (val === undefined) return Settings.circlePackingMaxLevels();
        Settings.circlePackingMaxLevels(val);
      },
      values: [3, 4, 5, 6, 7]
    }),
    m(ToggleParam, {
      label: "Include children in search matches",
      accessor: Settings.checklistIncludeChildren
    })
  ]
};


const CrossTabToolConfig = {
  id: "view_category_density",
  label: "Cross-Tab Matrix",
  iconPath: {
    light: "./img/ui/menu/view_category_density-light.svg",
    dark: "./img/ui/menu/view_category_density.svg",
  },
  info: "Generate cross-tabulation and density statistics.",
  // parameters: undefined — no dialog params yet
};


const MapToolConfig = {
  id: "view_map",
  label: "Geospatial Map",
  iconPath: {
    light: "./img/ui/menu/view_map-light.svg",
    dark: "./img/ui/menu/view_map.svg",
  },
  info: "Spatial exploration and mapping of localities.",
  // parameters: undefined — no dialog params yet
};


// ─────────────────────────────────────────────────────────────────────────────
// THE REGISTRY — the single source of truth consumed by ConfigurationDialog
// and MenuStripView. Order here determines display order in the dialog.
// ─────────────────────────────────────────────────────────────────────────────

export const VIEW_REGISTRY = [
  ChecklistToolConfig,
  CirclePackToolConfig,
  CrossTabToolConfig,
  MapToolConfig,
];
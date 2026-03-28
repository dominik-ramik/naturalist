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
    info: "Analyze data diversity and distribution at the taxonomic level"
  },
  {
    id: "#S",
    label: "Specimens",
    iconPath: {
      light: "./img/ui/checklist/tag-light.svg",
      dark: "./img/ui/checklist/tag.svg",
    },
    info: "Analyze the data at the resolution of individual specimens"
  },
];


// ─────────────────────────────────────────────────────────────────────────────
// TOOL CONFIGS
// Each object below will eventually live in its own analysis-tool file and be
// imported here. They are kept inline for now to avoid scattering changes
// before the tool files are ready to own their config.
// ─────────────────────────────────────────────────────────────────────────────

const ChecklistToolConfig = {
  id: "view_checklist",
  label: "Taxonomic tree",
  iconPath: {
    light: "./img/ui/menu/view_checklist-light.svg",
    dark: "./img/ui/menu/view_checklist.svg",
  },
  info: "Browse your data as a taxonomic tree, applying filters to easily isolate the exact records you need",

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

    const showTaxaWithoutSpecimens = m(ToggleParam, { label: "Show taxa without specimens", accessor: Settings.checklistPruneEmpty })

    const showTaxonMeta = m(ToggleParam, {
      label: "Show taxon metadata",
      accessor: Settings.checklistShowTaxonMeta
    });

    const showTerminalTaxaOnly = m(ToggleParam, { label: "Show terminal taxa only",       accessor: Settings.checklistShowTerminalOnly });

    const includeChildrenInMatches = m(ToggleParam, { label: "Include children in search matches", accessor: Settings.checklistIncludeChildren });

    let options = [];

    options.push(taxonLevelSelector);
    if (Checklist.hasSpecimens()) {
      options.push(showTaxonMeta);
    }

    if(scope === "#S") {
      options.push( m(ToggleParam, { label: "Show specimen metadata", accessor: Settings.checklistShowSpecimenMeta }));
    }

    if (Checklist.hasSpecimens()) {
      options.push(includeChildrenInMatches);
      options.push(showTaxaWithoutSpecimens);
      options.push(showTerminalTaxaOnly);
    }

    return options;
  }
};


const CirclePackToolConfig = {
  id: "view_circle_pack",
  label: "Hierarchy bubbles",
  iconPath: {
    light: "./img/ui/menu/view_circle_pack-light.svg",
    dark: "./img/ui/menu/view_circle_pack.svg",
  },
  info: "Visualize the relative volume of nested taxonomic groups, using color to instantly spot where filter matches are concentrated",

  parameters: () => [
    m(SelectParam, {
      label: "Maximum depth of levels displayed:",
      accessor: (val) => {
        if (val === undefined) return Settings.circlePackingMaxLevels();
        Settings.circlePackingMaxLevels(val);
      },
      values: [3, 4, 5, 6, 7]
    }),
  ]
};


const CrossTabToolConfig = {
  id: "view_category_density",
  label: "Trait Matrix",
  iconPath: {
    light: "./img/ui/menu/view_category_density-light.svg",
    dark: "./img/ui/menu/view_category_density.svg",
  },
  info: "Evaluate the breakdown of your data by chosen traits and apply filters to focus the comparison on specific records",
  // parameters: undefined — no dialog params yet
};


const MapToolConfig = {
  id: "view_map",
  label: "Regional Distribution",
  iconPath: {
    light: "./img/ui/menu/view_map-light.svg",
    dark: "./img/ui/menu/view_map.svg",
  },
  info: "Visualize the regional distribution of your data, using filters to map exactly where specific records are concentrated",
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
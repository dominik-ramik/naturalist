import { config as taxonomicTree } from "./TaxonomicTree.js";
import { config as hierarchyBubbles    } from "./HierarchyBubbles.js";
import { config as traitMatrix } from "./TraitMatrix.js";
import { config as regionalDistribution      } from "./RegionalDistribution.js";

import { Settings } from "../../model/Settings.js";

export { SCOPE_CHOICES } from "./scopes.js";

/**
 * Ordered list of tool configs — controls display order in
 * ConfigurationDialog and MenuStripView.
 */
export const TOOL_LIST = [
  taxonomicTree,
  hierarchyBubbles,
  traitMatrix,
  regionalDistribution,
];

export const DEFAULT_TOOL = taxonomicTree.id; // fallback if Settings.viewType() is invalid

export function getCurrentTool() {
  const viewType = Settings.viewType();
  return TOOL_REGISTRY[viewType] || DEFAULT_TOOL;
}

/**
 * Keyed map of tool configs — O(1) lookup by Settings.viewType()
 * used inside ChecklistView.
 */
export const TOOL_REGISTRY = Object.fromEntries(
  TOOL_LIST.map(cfg => [cfg.id, cfg])
);

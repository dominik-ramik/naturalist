import { config as taxonomicTree } from "./TaxonomicTree.js";
import { config as hierarchyBubbles    } from "./HierarchyBubbles.js";
import { config as traitMatrix } from "./TraitMatrix.js";
import { config as regionalDistribution      } from "./RegionalDistribution.js";

import { Settings } from "../../model/Settings.js";
import { Checklist } from "../../model/Checklist.js";

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
].map(validateToolConfig);

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

/**
 * Validates an analysis tool configuration object.
 * Throws an error and logs to the console if the config is invalid.
 * * @param {Object} config The exported config object from a tool plugin
 * @returns {Object} The validated config object
 */
export function validateToolConfig(config) {
  if (!config || typeof config !== "object") {
    const msg = "Tool validation failed: Config export is missing or not an object.";
    console.error(msg, config);
    throw new Error(msg);
  }

  const errors = [];
  const { id, label, iconPath, info, getTaxaAlongsideSpecimens, render, parameters, getAvailability } = config;

  // 1. Required Strings
  if (typeof id !== "string" || !id.trim()) errors.push("Missing or invalid 'id' (expected non-empty string).");
  if (typeof label !== "string" || !label.trim()) errors.push("Missing or invalid 'label' (expected non-empty string).");
  if (typeof info !== "string") errors.push("Missing or invalid 'info' (expected string).");

  // 2. Required Objects/Booleans
  if (typeof getTaxaAlongsideSpecimens !== "boolean") {
    errors.push("Missing or invalid 'getTaxaAlongsideSpecimens' (expected boolean).");
  }
  if (!iconPath || typeof iconPath !== "object" || typeof iconPath.light !== "string" || typeof iconPath.dark !== "string") {
    errors.push("Missing or invalid 'iconPath' (expected object with 'light' and 'dark' string paths).");
  }

  // 3. Required Functions
  if (typeof render !== "function") errors.push("Missing or invalid 'render' (expected function).");
  if (typeof getAvailability !== "function") errors.push("Missing or invalid 'getAvailability' (expected function).");

  // 4. Optional Functions
  if (parameters !== undefined && typeof parameters !== "function") {
    errors.push("Invalid 'parameters' (expected function if declared).");
  }

  // 5. Throw and log if errors exist
  if (errors.length > 0) {
    const errorMsg = `Tool validation failed for plugin '${id || "UNKNOWN"}':\n  - ${errors.join("\n  - ")}`;
    console.error(errorMsg, config);
    console.log("TODO uncomment the following line to throw an error and prevent loading of invalid tool configs:");
    // throw new Error(errorMsg);
  }

  return config;
}

/**
 * Validates the currently selected analysis tool and analytical intent 
 * against the provided checklist data. Mutates Settings to safe defaults if invalid.
 */
export function validateActiveToolState(checklistData) {
  const allIntents = Checklist.hasSpecimens() ? ["#T", "#S"] : ["#T"];
  let currentToolId = Settings.viewType() || DEFAULT_TOOL;
  let currentIntent = Settings.analyticalIntent() || "#T";

  let activeTool = TOOL_REGISTRY[currentToolId] || TOOL_REGISTRY[DEFAULT_TOOL];
  let availability = activeTool.getAvailability(allIntents, checklistData);

  // 1. If the tool itself is completely dead for this dataset, fallback to default tool
  if (!availability.isAvailable) {
    currentToolId = DEFAULT_TOOL;
    Settings.viewType(currentToolId);
    
    // Re-evaluate availability for the new default tool
    activeTool = TOOL_REGISTRY[currentToolId];
    availability = activeTool.getAvailability(allIntents, checklistData);
  }

  // 2. If the tool is valid, but the current intent (Taxa/Specimens) is not supported by it
  if (!availability.supportedIntents.includes(currentIntent)) {
    // Fallback to the first intent this tool *does* support
    Settings.analyticalIntent(availability.supportedIntents[0]);
  }
}

/**
 * Safely attempts to change the active analysis tool.
 * If the tool is valid, it sets it. It then checks if the current 
 * analytical intent is supported by this new tool; if not, it auto-switches 
 * to the first supported intent.
 */
export function requestToolChange(toolId, checklistData) {
  const allIntents = Checklist.hasSpecimens() ? ["#T", "#S"] : ["#T"];
  const requestedTool = TOOL_REGISTRY[toolId];
  
  if (!requestedTool) return; // Ignore unknown tools

  const availability = requestedTool.getAvailability(allIntents, checklistData);

  if (availability.isAvailable) {
    Settings.viewType(toolId); // Commit the tool change
    
    // Validate the intent against the newly selected tool
    const currentIntent = Settings.analyticalIntent() || "#T";
    if (!availability.supportedIntents.includes(currentIntent)) {
      Settings.analyticalIntent(availability.supportedIntents[0]); // Auto-fallback
    }
  } else {
    console.warn(`Tool ${toolId} is not available for this dataset.`);
  }
}

/**
 * Safely attempts to change the analytical intent (Taxa/Specimens).
 * It validates if the CURRENTLY ACTIVE tool supports the requested intent 
 * before committing the change.
 */
export function requestIntentChange(intentId, checklistData) {
  const allIntents = Checklist.hasSpecimens() ? ["#T", "#S"] : ["#T"];
  let currentToolId = Settings.viewType() || DEFAULT_TOOL;
  let activeTool = TOOL_REGISTRY[currentToolId] || TOOL_REGISTRY[DEFAULT_TOOL];

  const availability = activeTool.getAvailability(allIntents, checklistData);

  if (availability.supportedIntents.includes(intentId)) {
    Settings.analyticalIntent(intentId); // Commit the intent change
  } else {
    console.warn(`Intent ${intentId} is not supported by the current tool ${currentToolId}.`);
  }
}
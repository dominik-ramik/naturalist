import { config as taxonomicTree        } from "./TaxonomicTree.js";
import { config as hierarchyBubbles    } from "./HierarchyBubbles.js";
import { config as traitMatrix         } from "./TraitMatrix.js";
import { config as regionalDistribution } from "./RegionalDistribution.js";

import { Settings } from "../../model/Settings.js";
import { Checklist } from "../../model/Checklist.js";
import { updateRouteParams } from "../../components/Utils.js";

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
  return TOOL_REGISTRY[viewType] || TOOL_REGISTRY[DEFAULT_TOOL];
}

/**
 * Keyed map of tool configs — O(1) lookup by Settings.viewType().
 */
export const TOOL_REGISTRY = Object.fromEntries(
  TOOL_LIST.map(cfg => [cfg.id, cfg])
);

/**
 * Validates an analysis tool configuration object.
 * Throws (or warns) if the config is malformed.
 *
 * @param {Object} config  The exported config object from a tool plugin
 * @returns {Object}       The validated config object
 */
export function validateToolConfig(config) {
  if (!config || typeof config !== "object") {
    const msg = "Tool validation failed: Config export is missing or not an object.";
    console.error(msg, config);
    throw new Error(msg);
  }

  const errors = [];
  const {
    id, label, iconPath, info,
    getTaxaAlongsideSpecimens,
    render, parameters, getAvailability,
  } = config;

  // 1. Required strings
  if (typeof id !== "string" || !id.trim())
    errors.push("Missing or invalid 'id' (expected non-empty string).");
  if (typeof label !== "string" || !label.trim())
    errors.push("Missing or invalid 'label' (expected non-empty string).");
  if (typeof info !== "string")
    errors.push("Missing or invalid 'info' (expected string).");

  // 2. Required objects / booleans
  if (typeof getTaxaAlongsideSpecimens !== "boolean")
    errors.push("Missing or invalid 'getTaxaAlongsideSpecimens' (expected boolean).");
  if (!iconPath || typeof iconPath !== "object" ||
      typeof iconPath.light !== "string" || typeof iconPath.dark !== "string")
    errors.push("Missing or invalid 'iconPath' (expected object with 'light' and 'dark' string paths).");

  // 3. Required functions
  if (typeof render !== "function")
    errors.push("Missing or invalid 'render' (expected function).");
  if (typeof getAvailability !== "function")
    errors.push("Missing or invalid 'getAvailability' (expected function).");

  // 4. Optional parameters — must be an array of descriptor objects when present.
  //    Each descriptor is validated for the fields the ToolParams framework depends on.
  if (parameters !== undefined) {
    if (!Array.isArray(parameters)) {
      errors.push(
        "Invalid 'parameters' (expected an array of param descriptors, or omit the field entirely)."
      );
    } else {
      parameters.forEach((p, i) => {
        const prefix = `parameters[${i}] (id: "${p?.id ?? "?"}")`;

        if (!p || typeof p !== "object")
          errors.push(`${prefix}: must be an object.`);
        if (typeof p.id !== "string" || !p.id.trim())
          errors.push(`${prefix}: missing or invalid 'id' (expected non-empty string).`);
        if (typeof p.label !== "string" || !p.label.trim())
          errors.push(`${prefix}: missing or invalid 'label' (expected non-empty string).`);
        if (p.default === undefined)
          errors.push(`${prefix}: missing 'default' — every param must declare an explicit default value.`);
        if (typeof p.accessor !== "function")
          errors.push(`${prefix}: missing or invalid 'accessor' (expected getter/setter function).`);

        // Params without a custom render must declare a known type
        if (typeof p.render !== "function") {
          if (!["toggle", "select"].includes(p.type))
            errors.push(`${prefix}: invalid 'type' "${p.type}" — expected "toggle" or "select", or provide a custom 'render' function.`);
          if (p.type === "select" && p.values === undefined)
            errors.push(`${prefix}: 'values' is required for select params (array or factory function).`);
        }

        // Optional fields type-check
        if (p.condition !== undefined && typeof p.condition !== "function")
          errors.push(`${prefix}: 'condition' must be a function if provided.`);
        if (p.render !== undefined && typeof p.render !== "function")
          errors.push(`${prefix}: 'render' must be a function if provided.`);
      });
    }
  }

  // 5. Report errors
  if (errors.length > 0) {
    const errorMsg =
      `Tool validation failed for plugin '${id || "UNKNOWN"}':\n  - ${errors.join("\n  - ")}`;
    console.error(errorMsg, config);
    console.log(
      "TODO: uncomment the throw below to prevent loading of invalid tool configs."
    );
    // throw new Error(errorMsg);
  }

  return config;
}

/**
 * Validates the currently selected tool and analytical intent against the
 * provided checklist data.  Mutates Settings to safe defaults if invalid.
 */
export function validateActiveToolState(checklistData) {
  const allIntents   = Checklist.hasSpecimens() ? ["#T", "#S"] : ["#T"];
  let currentToolId  = Settings.viewType() || DEFAULT_TOOL;
  let currentIntent  = Settings.analyticalIntent() || "#T";

  let activeTool    = TOOL_REGISTRY[currentToolId];

  // Unknown tool ID → fall back to default
  if (!activeTool) {
    currentToolId = DEFAULT_TOOL;
    Settings.viewType(currentToolId);
    activeTool = TOOL_REGISTRY[currentToolId];
  }

  let availability  = activeTool.getAvailability(allIntents, checklistData);

  // 1. Tool itself is dead for this dataset → fall back to default
  if (!availability.isAvailable) {
    currentToolId = DEFAULT_TOOL;
    Settings.viewType(currentToolId);
    activeTool   = TOOL_REGISTRY[currentToolId];
    availability = activeTool.getAvailability(allIntents, checklistData);
  }

  // 2. Intent not supported by the (possibly updated) tool → fall back to first valid intent
  if (!availability.supportedIntents.includes(currentIntent)) {
    Settings.analyticalIntent(availability.supportedIntents[0]);
  }
}

/**
 * Safely changes the active analysis tool.
 * Auto-switches analytical intent if the new tool does not support the current one.
 */
export function requestToolChange(toolId, checklistData) {
  const allIntents     = Checklist.hasSpecimens() ? ["#T", "#S"] : ["#T"];
  const requestedTool  = TOOL_REGISTRY[toolId];

  if (!requestedTool) return; // Unknown tool — ignore

  const availability = requestedTool.getAvailability(allIntents, checklistData);

  if (availability.isAvailable) {
    Settings.viewType(toolId);

    const currentIntent = Settings.analyticalIntent() || "#T";
    if (!availability.supportedIntents.includes(currentIntent)) {
      Settings.analyticalIntent(availability.supportedIntents[0]);
    }

    updateRouteParams();
  } else {
    console.warn(`Tool ${toolId} is not available for this dataset.`);
  }
}

/**
 * Safely changes the analytical intent (Taxa / Specimens).
 * Validates that the currently active tool supports the requested intent.
 */
export function requestIntentChange(intentId, checklistData) {
  const allIntents   = Checklist.hasSpecimens() ? ["#T", "#S"] : ["#T"];
  const currentToolId = Settings.viewType() || DEFAULT_TOOL;
  const activeTool   = TOOL_REGISTRY[currentToolId] || TOOL_REGISTRY[DEFAULT_TOOL];

  const availability = activeTool.getAvailability(allIntents, checklistData);

  if (availability.supportedIntents.includes(intentId)) {
    Settings.analyticalIntent(intentId);
    updateRouteParams();
  } else {
    console.warn(
      `Intent ${intentId} is not supported by the current tool ${currentToolId}.`
    );
  }
}
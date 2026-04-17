/**
 * filterPlugins/index.js - plugin registry + interface validator.
 *
 * Resolves the correct filter plugin for a given filterDef by looking up the
 * `filterPlugin` property that each CustomType declares on itself.
 *
 * The lookup chain is:
 *   filterDef.type  →  dataCustomTypes[type]  →  .filterPlugin  →  plugin object
 *
 * CustomTypes that declare `filterPlugin: null` explicitly have no filter UI.
 * CustomTypes that omit `filterPlugin` are treated as `null` (no filter UI).
 * CustomTypes that provide a plugin object must implement the full contract below.
 */

import { dataCustomTypes } from "../customTypes/index.js";

// ── Required contract ─────────────────────────────────────────────────────────

/**
 * Every filterPlugin object must implement ALL of these methods.
 * `finalizeAccumulation` is optional - only range types that maintain
 * globalMin/Max need it; Filter.js calls it with optional chaining.
 */
const REQUIRED_METHODS = [
  // UI layer
  "isActive",               // (fd) → boolean
  "getCount",               // (fd) → number
  "getUnit",                // (dataPath) → string|null
  "renderDropdown",         // (attrs) → VNode
  "getCrumbs",              // (fd, ctx) → CrumbDescriptor[]
  "clearCrumb",             // (fd, ctx, descriptor) → void
  // Filter lifecycle layer
  "createFilterDef",        // (type?) → object   - initial filterDef shape
  "clearFilter",            // (fd) → void        - reset to no-selection
  "clearPossible",          // (fd) → void        - reset possible values
  "accumulatePossible",     // (fd, rawValue, leafValues) → void
  "serializeToQuery",       // (fd) → object|null
  "deserializeFromQuery",   // (fd, queryValue) → void
  "matches",                // (fd, rawValue, leafValues) → boolean
  "describeSerializedValue",// (dataPath, serialized, opts) → string
];

// ── Validation (runs once at module init) ─────────────────────────────────────

function validateFilterPlugins() {
  Object.entries(dataCustomTypes).forEach(([dataType, customType]) => {
    const plugin = customType.filterPlugin;

    // null / undefined = intentionally no filter UI - valid
    if (!plugin) return;

    // Must be a plain object, not a primitive
    if (typeof plugin !== "object") {
      console.error(`filterPlugin for CustomType '${dataType}' must be an object, got ${typeof plugin}`);
      return;
    }

    const missing = REQUIRED_METHODS.filter(m => typeof plugin[m] !== "function");
    if (missing.length > 0) {
      console.error(
        `filterPlugin for CustomType '${dataType}' is missing required method(s): ${missing.join(", ")}`
      );
    }
  });
}

validateFilterPlugins();

// ── Registry lookup ───────────────────────────────────────────────────────────

/**
 * Returns the filterPlugin for a live filterDef, or null if the type has no plugin.
 * @param {{ type: string }} filterDef
 * @returns {object|null}
 */
export function getFilterPlugin(filterDef) {
  return dataCustomTypes[filterDef?.type]?.filterPlugin ?? null;
}
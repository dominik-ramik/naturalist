/*

Adding a new tool with params in any of the analysisTools

parameters: [
  {
    id:       "myToggle",
    label:    "Show extra info",
    type:     "toggle",
    default:  false,
    accessor: Settings.myToggleSetting,
  },
  {
    id:       "mySelect",
    label:    "Display mode",
    type:     "select",
    default:  "compact",
    accessor: Settings.mySelectSetting,
    values:   ["compact | Compact", "full | Full detail"],
    condition: (scope) => scope === "#S",  // only in specimen mode
  },
]

*/

/**
 * shared/ToolParams.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Framework for declarative tool parameter descriptors.
 *
 * Tools declare a `parameters` array of param objects.  This module handles:
 *   - Rendering param controls in ConfigurationDialog
 *   - Detecting which active params deviate from their declared defaults
 *   - Resetting all params back to their defaults
 *
 * ─── Param descriptor shape ──────────────────────────────────────────────────
 *
 *   {
 *     id:        string            — unique within the tool
 *     label:     string            — human-readable; shown in the non-default notice
 *     type:      "toggle"|"select" — drives automatic rendering via FormControls
 *     default:   any | () => any   — default value, or a zero-arg fn for dynamic defaults
 *     accessor:  fn                — getter/setter: accessor() reads, accessor(v) writes
 *
 *     // select only:
 *     values:    (string|number)[] | () => (string|number)[]
 *                                  — supports "value|Label" split format (see SelectParam)
 *
 *     // optional:
 *     condition: (scope: string) => bool
 *                                  — if present, param is only active when this returns true;
 *                                     undefined / absent = always active
 *     render:    () => vnode       — escape hatch for custom UI;
 *                                     REQUIRED alongside condition + this if type is omitted
 *   }
 *
 * ─── Notes ───────────────────────────────────────────────────────────────────
 *
 *  • `resetAllToDefaults` resets *all* params (including conditionally hidden ones)
 *    so that switching scope always starts from a guaranteed clean slate.
 *
 *  • The `default` field is the source of truth.  Do not rely on a Settings
 *    initial value being correct — declare it explicitly here.
 */

import m from "mithril";
import { SelectParam, ToggleParam } from "./FormControls.js";

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Resolve a plain value or a zero-arg factory function. */
function resolve(v) {
  return typeof v === "function" ? v() : v;
}

/**
 * Returns a human-readable description of the current value for a param.
 * Used in the non-default notice to give quick context without opening the dialog.
 *
 * Select params look up the matching label in the values list.
 * Toggle params return "on" / "off".
 * Custom-render params with no type fall back to an empty string.
 */
function describeCurrentValue(p) {
  if (p.type === "toggle") {
    return p.accessor() ? "on" : "off";
  }
  if (p.type === "select") {
    const current  = p.accessor();
    const allValues = resolve(p.values) || [];
    for (const v of allValues) {
      // Mirror the "value|Label" split logic used by SelectParam
      const parts    = typeof v === "string" ? v.split("|").map(x => x.trim()) : [String(v)];
      const optValue = parts[0];
      const optLabel = parts[1] || parts[0];
      // Loose equality intentional: SelectParam stores numbers as strings
      // eslint-disable-next-line eqeqeq
      if (optValue == current) return optLabel || String(current);
    }
    return String(current);
  }
  return "";
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the subset of param descriptors whose condition passes for `scope`.
 * Params without a `condition` field are always included.
 *
 * @param {Object[]} paramDefs  — the tool's `parameters` array
 * @param {string}   scope      — e.g. "#T" or "#S"
 * @returns {Object[]}
 */
export function getActiveParams(paramDefs, scope) {
  if (!paramDefs?.length) return [];
  return paramDefs.filter(p => !p.condition || p.condition(scope));
}

/**
 * Returns the active params that are currently set to a non-default value.
 * Drive the visibility of the non-default notice in ChecklistView.
 *
 * @param {Object[]} paramDefs
 * @param {string}   scope
 * @returns {Object[]}
 */
export function getNonDefaultParams(paramDefs, scope) {
  return getActiveParams(paramDefs, scope).filter(p => {
    const current = p.accessor();
    const def     = resolve(p.default);
    // eslint-disable-next-line eqeqeq
    return current != def;            // loose: handles number/string mismatches from storage
  });
}

/**
 * Resets EVERY param in the list to its declared default.
 *
 * Intentionally resets hidden/conditional params too — scope switches should
 * never carry over stale non-default state silently.
 *
 * @param {Object[]} paramDefs
 */
export function resetAllToDefaults(paramDefs) {
  (paramDefs || []).forEach(p => {
    p.accessor(resolve(p.default));
  });
}

/**
 * Renders mithril vnodes for the active params in the given scope.
 * Used by ConfigurationDialog to populate the "Parameters" section.
 *
 * @param {Object[]} paramDefs
 * @param {string}   scope
 * @returns {import("mithril").Vnode[]}
 */
export function renderParams(paramDefs, scope) {
  return getActiveParams(paramDefs, scope).map(renderSingleParam);
}

/**
 * Builds a descriptive summary of every non-default active param.
 * Returns an array of strings like ["Show specimen metadata: on", "Taxon level: Genus"].
 * Useful for constructing the notice text.
 *
 * @param {Object[]} paramDefs
 * @param {string}   scope
 * @returns {string[]}
 */
export function describeNonDefaultParams(paramDefs, scope) {
  return getNonDefaultParams(paramDefs, scope).map(p => {
    const desc = describeCurrentValue(p);
    return desc ? `${p.label}: ${desc}` : p.label;
  });
}

// ─── Internal rendering ──────────────────────────────────────────────────────

function renderSingleParam(p) {
  // Escape hatch: tool supplies its own renderer
  if (typeof p.render === "function") return p.render();

  if (p.type === "toggle") {
    return m(ToggleParam, { label: p.label, accessor: p.accessor });
  }

  if (p.type === "select") {
    return m(SelectParam, {
      label:    p.label,
      accessor: p.accessor,
      values:   resolve(p.values) || [],
    });
  }

  console.warn(`ToolParams: unknown param type "${p.type}" for param id "${p.id}".`);
  return null;
}
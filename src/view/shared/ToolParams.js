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
 *     id:        string            - unique within the tool
 *     label:     string            - human-readable; shown in the non-default notice
 *     type:      "toggle"|"select" - drives automatic rendering via FormControls
 *     default:   any | () => any   - default value, or a zero-arg fn for dynamic defaults
 *     accessor:  fn                - getter/setter: accessor() reads, accessor(v) writes
 *
 *     // select only:
 *     values:    (string|number)[] | () => (string|number)[]
 *                                  - supports "value|Label" split format (see SelectParam)
 *
 *     // optional:
 *     condition: (scope: string) => bool
 *                                  - param is only active when this returns true;
 *                                     undefined / absent = always active
 *
 *     notify:    boolean           - default true; set false to opt out of the non-default
 *                                     notice entirely. Use for pure rendering preferences
 *                                     (zoom levels, display depths) that don't alter *which*
 *                                     data is shown, only *how* it looks.
 *                                     The param is still rendered in the dialog and still
 *                                     resets on resetAllToDefaults().
 *
 *     render:    () => vnode       - escape hatch for custom UI;
 *                                     supply instead of type/values if needed
 *   }
 *
 * ─── Notes ───────────────────────────────────────────────────────────────────
 *
 *  • resetAllToDefaults resets *all* params (including conditional and notify:false ones)
 *    so scope switches start from a guaranteed clean slate.
 *
 *  • The `default` field is the source of truth. Do not rely on a Settings
 *    initial value being correct - declare it explicitly here.
 *
 *  • notify: false means the param never appears in the non-default notice,
 *    but is still rendered in the dialog and reset by resetAllToDefaults().
 *    Think: "this is a display preference, not a data filter."
 */

import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { SelectParam, ToggleParam } from "./FormControls.js";

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Resolve a plain value or a zero-arg factory function. */
function resolve(v) {
  return typeof v === "function" ? v() : v;
}

/**
 * Returns a human-readable description of the current value for a param.
 * Used in the non-default notice to give quick context without opening the dialog.
 */
function describeCurrentValue(p) {
  if (p.type === "toggle") {
    return p.accessor() ? "on" : "off";
  }
  if (p.type === "select") {
    const current   = p.accessor();
    const allValues = resolve(p.values) || [];
    for (const v of allValues) {
      const parts    = typeof v === "string" ? v.split("|").map(x => x.trim()) : [String(v)];
      const optValue = parts[0];
      const optLabel = parts[1] || parts[0];
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
 */
export function getActiveParams(paramDefs, scope) {
  if (!paramDefs?.length) return [];
  return paramDefs.filter(p => !p.condition || p.condition(scope));
}

/**
 * Returns active params that deviate from their declared default AND have not
 * opted out of notification via notify: false.
 * Drives the visibility of the non-default notice in ChecklistView.
 */
export function getNonDefaultParams(paramDefs, scope) {
  return getActiveParams(paramDefs, scope).filter(p => {
    if (p.notify === false) return false;   // explicit opt-out
    const current = p.accessor();
    const def     = resolve(p.default);
    // eslint-disable-next-line eqeqeq
    return current != def;                  // loose: tolerates number/string storage mismatches
  });
}

/**
 * Resets EVERY param to its declared default - including conditional and
 * notify:false params. Scope switches should never leave stale state behind.
 */
export function resetAllToDefaults(paramDefs) {
  (paramDefs || []).forEach(p => {
    p.accessor(resolve(p.default));
  });
}

/**
 * Renders mithril vnodes for the active params in the given scope.
 * Used by ConfigurationDialog to populate the "Parameters" section.
 */
export function renderParams(paramDefs, scope) {
  return getActiveParams(paramDefs, scope).map(renderSingleParam);
}

/**
 * Builds a descriptive summary of every non-default, notifiable, active param.
 * Returns strings like ["Show occurrence metadata: on", "Taxon level: Genus"].
 */
export function describeNonDefaultParams(paramDefs, scope) {
  return getNonDefaultParams(paramDefs, scope).map(p => {
    const desc = describeCurrentValue(p);
    return desc ? `${p.label}: ${desc}` : p.label;
  });
}

// ─── Internal rendering ──────────────────────────────────────────────────────

function renderSingleParam(p) {
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
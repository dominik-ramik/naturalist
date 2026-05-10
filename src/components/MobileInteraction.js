// Single source of truth for the "user interacted with the checklist on mobile"
// side-effect: collapse the filter pane and dismiss the soft keyboard.
//
// Usage:
//   import { collapsePaneAndDismissKeyboard } from "../MobileInteraction.js";
//   onscroll: collapsePaneAndDismissKeyboard   // pass by reference - no wrapper needed

import m from "mithril";
import { InteractionAreaView } from "../view/InteractionAreaView.js";
import { Settings } from "../model/Settings.js";

/**
 * Call this on any interaction (scroll, tap) inside ChecklistView children
 * to reliably hide the mobile filter pane and dismiss the soft keyboard.
 *
 * Guard: no-ops when the pane is already collapsed, so it is safe to attach
 * as a raw onscroll handler without incurring a redraw on every scroll tick.
 */
export function collapsePaneAndDismissKeyboard() {
  const active = document.activeElement;

  // If the pane is already collapsed and the user is focused inside the filter
  // pane (e.g. actively typing in the search box), a spurious scroll event
  // caused by the mobile keyboard resizing the viewport must not steal focus.
  const activeIsInFilterPane = active && active !== document.body
    && active.closest('.interaction-area') !== null;

  if (!InteractionAreaView.isExpanded && activeIsInFilterPane) {
    return;
  }

  // For all other cases, blur the active element to dismiss the soft keyboard.
  if (active && active !== document.body) {
    active.blur();
  }

  // Only touch Mithril state (and pay for a redraw) when actually needed.
  if (!InteractionAreaView.isExpanded) return;

  InteractionAreaView.isExpanded = false;
  Settings.mobileFiltersPaneCollapsed(true);
  m.redraw();
}
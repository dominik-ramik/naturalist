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
  // Unconditionally blur - cheap, and the surest way to hide the soft keyboard
  // regardless of which element currently holds focus.
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }

  // Only touch Mithril state (and pay for a redraw) when actually needed.
  if (!InteractionAreaView.isExpanded) return;

  InteractionAreaView.isExpanded = false;
  Settings.mobileFiltersPaneCollapsed(true);
  m.redraw();
}
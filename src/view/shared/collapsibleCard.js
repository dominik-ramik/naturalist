import m from 'mithril';
import './CollapsibleCard.css';

/**
 * CollapsibleCard – shared collapsible config card.
 *
 * Renders a card with a clickable header that toggles a collapsible body.
 * Follows the RegionalDistribution collapsible card pattern (preferred UI).
 *
 * attrs:
 *   title          string        Title shown in the header (expanded state).
 *   collapsed      boolean       Current collapsed state (controlled externally).
 *   onToggle       function      Called when the header is clicked.
 *   canCollapse    boolean       Default true. When false the card is always
 *                                expanded with no toggle affordance.
 *   summary        vnode|null    Content shown *instead of* the title when the
 *                                card is collapsed. Useful for summary chips.
 *   headerActions  vnode|null    Extra content placed in the header between the
 *                                title and the toggle indicator (expanded state
 *                                only). Buttons here should call e.stopPropagation()
 *                                if they must not trigger the header toggle.
 *   footer         vnode|null    Always-visible content placed below the body
 *                                (e.g. a verb/description sentence).
 *   bodyClass      string|null   Additional CSS class added to the body wrapper,
 *                                used by consumers to control their own layout.
 *
 * children: body content (shown when not collapsed).
 */
export const CollapsibleCard = {
  view({ attrs, children }) {
    const {
      title,
      collapsed,
      onToggle,
      canCollapse = true,
      summary = null,
      headerActions = null,
      footer = null,
      bodyClass = null,
    } = attrs;

    // Body is visible when expanded, or when the card cannot collapse.
    const isExpanded = !collapsed || !canCollapse;

    // Header modifier drives cursor / hover styles.
    //   no modifier  → not collapsible (no cursor affordance)
    //   --expanded   → collapsible, currently open
    //   --collapsed  → collapsible, currently closed
    const headerMod = !canCollapse
      ? ''
      : (collapsed ? '.collapsible-card-header--collapsed' : '.collapsible-card-header--expanded');

    const headerAttrs = canCollapse ? { onclick: onToggle } : {};

    // When collapsed and a summary is provided, show it in place of the title.
    const showSummary = !isExpanded && summary != null;

    const headerContent = [
      showSummary
        ? summary
        : m('span.collapsible-card-title', title),

      // Extra actions are shown only in the expanded state.
      isExpanded ? headerActions : null,

      // Toggle indicator (▲ / ▼) only when collapsible.
      canCollapse
        ? m('span.collapsible-card-toggle', collapsed ? '▼' : '▲')
        : null,
    ];

    return m('.collapsible-card', [
      m('.collapsible-card-header' + headerMod, headerAttrs, headerContent),
      isExpanded
        ? m('.collapsible-card-body' + (bodyClass ? '.' + bodyClass : ''), children)
        : null,
      footer != null ? m('.collapsible-card-footer', footer) : null,
    ]);
  },
};

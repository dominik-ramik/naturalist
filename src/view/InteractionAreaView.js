import m from "mithril";

import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
// DELETE: import { AppLayoutView } from "./AppLayoutView.js";

export let InteractionAreaView = {
  isExpanded: Settings.mobileFiltersPaneCollapsed(),

  view: function (vnode) {
    const expandedClass = InteractionAreaView.isExpanded ? "expanded" : "collapsed";

    const isSearchRoute = m.route.get().startsWith("/checklist");

    return m(
      ".interaction-area" + "." + expandedClass,
      {
        style: // Keep background gradient only
          "background: linear-gradient(313deg, " +
          Checklist.getThemeHsl("dark") +
          ", " +
          Checklist.getThemeHsl("light") +
          ");",
      },

      isSearchRoute
        ? renderSearchView(vnode)
        : renderGenericView(vnode)
    );
  },
};

function renderGenericView(vnode) {
  return [
    m(".interaction-area-generic-wrapper", [
      vnode.children,
    ]),
  ]
}

function renderSearchView(vnode) {
  return [
    [
      m(".interaction-area-branding-wrapper", [
        vnode.children,
      ]),
    ],
    m(".branding", t("powered_by_nl")),
    !Checklist.getProjectHowToCite() ||
      Checklist.getProjectHowToCite().trim() == ""
      ? null
      : m(
        ".desktop-cite",
        m("div", [
          m("b[style=margin-right: 0.75em;]", t("how_to_cite")),
          m(
            "span[style=user-select: all]",
            Checklist.getProjectHowToCite()
          ),
        ])
      )
  ];
}

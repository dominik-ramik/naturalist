import m from "mithril";

import { Checklist } from "../model/Checklist.js";
import { _t } from "../model/I18n.js";
import { FilterCrumbsView } from "./FilterCrumbsView.js";
// DELETE: import { AppLayoutView } from "./AppLayoutView.js";

export let InteractionAreaView = {
  isExpanded: false,

  view: function (vnode) {
    const expandedClass = InteractionAreaView.isExpanded ? "expanded" : "collapsed";

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
      [
        // DELETE: mobile-header-wrapper and the toggle button
        m(".interaction-area-branding-wrapper", [
          vnode.children,
          // Branding

        ]),
      ],
      m(".branding", _t("powered_by_nl")),

      // Citation
      !Checklist.getProjectHowToCite() ||
        Checklist.getProjectHowToCite().trim() == ""
        ? null
        : m(
          ".desktop-cite",
          m("div", [
            m("b[style=margin-right: 0.75em;]", _t("how_to_cite")),
            m(
              "span[style=user-select: all]",
              Checklist.getProjectHowToCite()
            ),
          ])
        ),
    );
  },
};
import { Checklist } from "../model/Checklist.js";
import { _t } from "../model/I18n.js";
import { AppLayoutView } from "./AppLayoutView.js";

export let InteractionAreaView = {
  view: function (vnode) {
    let display =
      AppLayoutView.mobile() && AppLayoutView.display != "details"
        ? "display: none; "
        : "";

    return m(
      ".interaction-area[style=" +
        display +
        "background: linear-gradient(313deg, " +
        Checklist.getThemeHsl("dark") +
        ", " +
        Checklist.getThemeHsl("light") +
        ");]",
      [
        m("div[style=flex-grow: 1]", [
          m(".interaction-area-branding-wrapper", [vnode.children]),
          AppLayoutView.mobile() ? null : m(".branding", _t("powered_by_nl")),
        ]),
        AppLayoutView.mobile() ||
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
      ]
    );
  },
};

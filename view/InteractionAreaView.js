import { Checklist } from "../model/Checklist.js";
import { _t } from "../model/I18n.js";
import { AppLayoutView } from "./AppLayoutView.js";

export let InteractionAreaView = {
    view: function(vnode) {
        let display = AppLayoutView.mobile() && AppLayoutView.display != "details" ? "display: none; " : "";

        return m(".interaction-area[style=" + display + "background: linear-gradient(313deg, " + Checklist.getThemeHsl("dark") + ", " + Checklist.getThemeHsl("light") + ");]", [
            m(".interaction-area-branding-wrapper", [
                vnode.children,
            ]),
            AppLayoutView.mobile() ? null : m(".branding", _t("powered_by_nl")),
            //AppLayoutView.mobile() ? null : m(".brandingss", "Plunkett, G.M., T.R. Ranker, C. Sam, M.J. Balick, and D.M. Ramík. 2022. Vanuatu's Plant List: An Interactive Checklist of the Vascular Plants of Vanuatu. checklist.pvnh.net [continuously updated]."),
        ]);
    }
}
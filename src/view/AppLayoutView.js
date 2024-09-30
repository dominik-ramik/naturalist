import { MenuStripView } from "./MenuStripView.js";
import { ChecklistView } from "./ChecklistView.js";
import { InteractionAreaView } from "./InteractionAreaView.js";
import { Checklist } from "../model/Checklist.js";
import { routeTo } from "../components/Utils.js";
import { _t } from "../model/I18n.js";

export let AppLayoutView = {
    mode: "desktop",
    display: "checklist",

    mobile: function() {
        return AppLayoutView.mode === "mobile";
    },

    view: function(vnode) {

        let resultsNumber = Checklist.getTaxaForCurrentQuery().length;

        return m(".app." + AppLayoutView.mode, [
            m(MenuStripView),
            m(".app-content", [
                m(ChecklistView),
                m(InteractionAreaView, vnode.children),
                AppLayoutView.mobile() && (AppLayoutView.display == "checklist") ? m(FloatingButton, {
                    icon: "search",
                    label: _t("float_search"),
                    onclick: function() {
                        routeTo("/search");
                    }
                }) : null,
                AppLayoutView.mobile() && m.route.get().startsWith("/search") ? m(FloatingButton, {
                    icon: "results",
                    disabled: resultsNumber == 0,
                    label: _t("float_results", [resultsNumber]),
                    onclick: function() {
                        routeTo("/checklist");
                    }
                }) : null,
            ]),
            m(Toast),
            m(".assets-preload[style=display: none;]", Checklist.getPreloadableAssets().map(function(asset) {
                return m("img[src=" + asset + "]");
            }))
        ])
    },

    toast: function(text, options) {
        Toast.show(text, options);
        m.redraw();
    }
}

let FloatingButton = {
    view: function(vnode) {
        return m(".floating-button" + (vnode.attrs.disabled ? ".disabled" : ""), {
            onclick: function() {
                if (!vnode.attrs.disabled) {
                    vnode.attrs.onclick();
                }
            }
        }, [
            m("img[src=img/ui/checklist/" + vnode.attrs.icon + ".svg]"),
            m(".label", vnode.attrs.label)
        ])
    }
}

export let Toast = {
    visible: false,
    icon: null,
    message: "",
    permanent: false,
    whenClosed: null,

    show: function(text, options) {
        Toast.message = text;

        Toast.permanent = options && options.showPermanently ? options.showPermanently : false;
        Toast.whenClosed = options && options.whenClosed ? options.whenClosed : null;
        Toast.icon = options && options.icon ? options.whenClosed : null;

        Toast.visible = true;

        if (!Toast.permanent) {
            setTimeout(function() {
                Toast.hide();
                m.redraw();
            }, 3000);
        }

        m.redraw();
    },
    hide: function() {
        Toast.visible = false;
        if (Toast.whenClosed) {
            Toast.whenClosed();
        }
    },

    view: function(vnode) {
        return Toast.visible ? m("div#snack-wrap", [
            m("div#snackbar", {
                onclick: function() {
                    Toast.hide();
                }
            }, [
                m("span", Toast.message),
                Toast.permanent ? m("span", "X") : null,
            ])
        ]) : null;
    }
}
import { MenuStripView } from "./MenuStripView.js";
import { ChecklistView } from "./ChecklistView.js";
import { InteractionAreaView } from "./InteractionAreaView.js";
import { Checklist } from "../model/Checklist.js";
import { routeTo } from "../components/Utils.js";
import { _t } from "../model/I18n.js";

export let AppLayoutView = {
    mode: "desktop",
    display: "checklist",

    mobile: function () {
        return AppLayoutView.mode === "mobile";
    },

    view: function (vnode) {

        let resultsNumber = Checklist.getTaxaForCurrentQuery().length;

        return m(".app." + AppLayoutView.mode, [
            m(MenuStripView),
            m(".app-content", [
                m(ChecklistView),
                m(InteractionAreaView, vnode.children),
                m(FloatingContainer,
                    AppLayoutView.mobile() && (AppLayoutView.display == "checklist") ? m(FloatingSearch) : null,
                    AppLayoutView.mobile() && m.route.get().startsWith("/search") ? m(RoundedButton, {
                        icon: "results",
                        disabled: resultsNumber == 0,
                        label: _t("float_results", [resultsNumber]),
                        onclick: function () {
                            routeTo("/checklist");
                        }
                    }) : null,
                )
            ]),
            m(Toast),
        ])
    },

    toast: function (text, options) {
        Toast.show(text, options);
        m.redraw();
    }
}

let FloatingContainer = {
    view: function (vnode) {
        return m(".floating-search-container",
            vnode.children)
    }
}

let FloatingSearch = {
    view: function (vnode) {
        return [
            m(RoundedButton, {
                icon: "filter",
                label: _t("float_filter"),
                onclick: function () {
                    routeTo("/search");
                }
            }),
            m(".floating-search[style=flex-grow: 1; margin-left: 1em;]", m(SearchBoxImmediate)),
        ]
    }
}

let SearchBoxImmediate = {
    typingTimer: null,
    view: function () {
        return m(".round-envelope", m(".search-box[style=flex-grow: 1;]",
            m("input[id=free-text][autocomplete=off][type=search][placeholder=" + _t("free_text_search") + "][value=" + Checklist.filter.text + "]", {
                oninput: function (e) {
                    Checklist.filter.text = this.value;
                    routeTo("checklist")
                }
            })
        ));
    }
}

let RoundedButton = {
    view: function (vnode) {
        return m(".round-envelope", m(".rounded-button" + (vnode.attrs.disabled ? ".disabled" : ""), {
            onclick: function () {
                if (!vnode.attrs.disabled) {
                    vnode.attrs.onclick();
                }
            }
        }, [
            m("img[src=img/ui/checklist/" + vnode.attrs.icon + ".svg]"),
            m(".label", vnode.attrs.label)
        ]))
    }
}

export let Toast = {
    visible: false,
    icon: null,
    message: "",
    permanent: false,
    whenClosed: null,

    show: function (text, options) {
        Toast.message = text;

        Toast.permanent = options && options.showPermanently ? options.showPermanently : false;
        Toast.whenClosed = options && options.whenClosed ? options.whenClosed : null;
        Toast.icon = options && options.icon ? options.whenClosed : null;

        Toast.visible = true;

        if (!Toast.permanent) {
            setTimeout(function () {
                Toast.hide();
                m.redraw();
            }, 3000);
        }

        m.redraw();
    },
    hide: function () {
        Toast.visible = false;
        if (Toast.whenClosed) {
            Toast.whenClosed();
        }
    },

    view: function (vnode) {
        return Toast.visible ? m("div#snack-wrap", [
            m("div#snackbar", {
                onclick: function () {
                    Toast.hide();
                }
            }, [
                m("span", Toast.message),
                Toast.permanent ? m("span", "X") : null,
            ])
        ]) : null;
    }
}
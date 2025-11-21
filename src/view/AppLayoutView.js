import m from "mithril"

import { MenuStripView } from "./MenuStripView.js";
import { ChecklistView } from "./ChecklistView.js";
import { InteractionAreaView } from "./InteractionAreaView.js";
import { Checklist } from "../model/Checklist.js";
import { routeTo } from "../components/Utils.js";
import { _t } from "../model/I18n.js";
import { Filter } from "../model/Filter.js";

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
        //m.redraw();
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
                style: "padding: 0px;",
                onclick: function () {
                    routeTo("/search");
                }
            }),
            m(".floating-search[style=flex-grow: 1; padding: 0px;]", m(SearchBoxImmediate)),
            
            Filter.numberOfActive() > 0 ? m(RoundedButton, {
                icon: "filter-clear",
                badge: Filter.numberOfActive(),
                onclick: function () {
                    Filter.clear();
                    Filter.commit();
                    routeTo("/checklist");
                }
            }) : null,
        ]
    }
}

let SearchBoxImmediate = {
    typingTimer: null,
    view: function () {
        return m(".round-envelope", m(".search-box[style=flex-grow: 1; padding: 0px;]",
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
        return m(".round-envelope", m(".rounded-button" + (vnode.attrs.label ? "" : "-notext") + (vnode.attrs.disabled ? ".disabled" : ""), {
            onclick: function () {
                if (!vnode.attrs.disabled) {
                    vnode.attrs.onclick();
                }
            }
        }, [
            m(".image-wrapper",
                [
                    m("img[src=img/ui/checklist/" + vnode.attrs.icon + ".svg]"),
                    vnode.attrs.badge ? m(".round-button-badge", vnode.attrs.badge) : null,
                ]
            ),
            m(".label", vnode.attrs.label),
        ]))
    }
}

export let Toast = {
    visible: false,
    message: "",
    icon: null,
    permanent: false,
    whenClosed: null,
    
    // New properties for the action button and timer management
    actionLabel: null,
    actionCallback: null,
    timeoutID: null,

    show: function (text, options = {}) {
        // 1. Clear existing timer to prevent a previous toast from hiding the new one
        if (Toast.timeoutID) {
            clearTimeout(Toast.timeoutID);
            Toast.timeoutID = null;
        }

        // 2. Set Basic Props
        Toast.message = text;
        Toast.permanent = options.showPermanently || false;
        Toast.whenClosed = options.whenClosed || null;
        Toast.icon = options.icon || null; // Fixed bug: previously assigned options.whenClosed

        // 3. Set Action Button Props
        Toast.actionLabel = options.actionLabel || null;
        Toast.actionCallback = options.actionCallback || null;

        Toast.visible = true;

        // 4. Handle Timeout logic
        if (!Toast.permanent) {
            // Use manual timeout if provided, otherwise default to 3000
            const duration = options.timeout || 3000;
            
            Toast.timeoutID = setTimeout(function () {
                Toast.hide();
                m.redraw();
            }, duration);
        }

        m.redraw();
    },

    hide: function () {
        // Clear timer if hidden manually to be safe
        if (Toast.timeoutID) {
            clearTimeout(Toast.timeoutID);
            Toast.timeoutID = null;
        }

        Toast.visible = false;
        
        if (Toast.whenClosed) {
            Toast.whenClosed();
        }
    },

    view: function (vnode) {
        if (!Toast.visible) return null;

        return m("div#snack-wrap", [
            m("div#snackbar", {
                onclick: function () {
                    // Only hide on background click if not permanent? 
                    // Or always hide? Preserving your original logic (always hide).
                    Toast.hide();
                },
                style: "display:flex;align-items:center;justify-content:space-between;max-width:32em;margin-left:auto;margin-right:auto;"
            }, [
                // Message Text
                m("span", {
                    style: "flex:1 1 auto;overflow-wrap:break-word;"
                }, Toast.message),

                // --- NEW: Action Button ---
                (Toast.actionLabel && Toast.actionCallback) 
                    ? m("button", {
                        style: "flex:0 0 auto; margin: 0 0.5em; background: transparent; border: none; color: #4dabf5; font-weight: bold; cursor: pointer; text-transform: uppercase;",
                        onclick: function(e) {
                            e.stopPropagation(); // Prevent triggering the container's hide
                            Toast.actionCallback();
                            Toast.hide(); // Assuming action dismisses toast
                        }
                    }, Toast.actionLabel)
                    : null,

                // Close Button (X) - Only if permanent
                Toast.permanent
                    ? m("button", {
                        style: "flex:0 0 auto;color:white;margin-left:0.75em;padding:0.15em 0.5em;min-width:1.8em;min-height:1.8em;line-height:1.2em;font-size:1.2em;border:none;background:transparent;cursor:pointer;border-radius:0.2em;vertical-align:middle;display:inline-block;",
                        onclick: function (e) {
                            e.stopPropagation();
                            Toast.hide();
                        }
                    }, "✕")
                    : null
            ])
        ]);
    }
};
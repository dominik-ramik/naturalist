import m from "mithril"

import { MenuStripView } from "./MenuStripView.js";
import { ChecklistView } from "./ChecklistView.js";
import { InteractionAreaView } from "./InteractionAreaView.js";

export let AppLayoutView = {
    display: "checklist",

    view: function (vnode) {

        //let resultsNumber = Checklist.getTaxaForCurrentQuery().length;

        return m(".app", [
            m(MenuStripView),
            m(".app-content", [
                m(ChecklistView),
                m(InteractionAreaView, vnode.children),                
            ]),
            m(Toast),
        ])
    },

    toast: function (text, options) {
        Toast.show(text, options);
        //m.redraw();
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
        Toast.icon = options.icon || null; 

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
                    // Clicking the toast body (background) generally hides it
                    // unless it's an interactive permanent toast, but consistent UX is to dismiss.
                    Toast.hide();
                }
            }, [
                // Message Text
                m("span.toast-message", Toast.message),

                // --- NEW: Action Button ---
                (Toast.actionLabel && Toast.actionCallback) 
                    ? m("button.toast-action", {
                        onclick: function(e) {
                            e.stopPropagation(); // Prevent triggering the container's hide
                            Toast.actionCallback();
                            Toast.hide(); // Assuming action dismisses toast
                        }
                    }, Toast.actionLabel)
                    : null,

                // Close Button (X) - Only if permanent
                Toast.permanent
                    ? m("button.toast-close", {
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
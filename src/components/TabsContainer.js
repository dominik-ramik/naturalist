import m from "mithril";

import "./TabsContainer.css";
import { Icon } from "./Icon";

export let TabsContainer = {


    view: function (vnode) {

        let tabs = vnode.attrs.tabs;
        const tabNames = Object.keys(tabs);
        if (tabs === null || tabNames.length == 0) {
            return null;
        }

        // When a parent provides activeTab (route-driven), it is the sole source
        // of truth. When no parent drives the selection (no callback), fall back
        // to local state so the component works standalone.
        const externalTab = vnode.attrs.activeTab;
        const currentTab = (externalTab && tabNames.includes(externalTab))
            ? externalTab
            : (vnode.state.selectedTab && tabNames.includes(vnode.state.selectedTab))
                ? vnode.state.selectedTab
                : tabNames[0];

        return m(".tabs-container", [
            m(".tabs-container-buttons", [
                tabNames.map(function (key) {
                    let tab = tabs[key];
                    return m("button.tabs-container-tab-button" + (key == currentTab ? ".tabs-container-active-tab-button" : ""), {
                        onclick: function (e) {
                            if (tab.onTabActivatedCallback) {
                                // The callback calls m.route.set which will drive
                                // the next render. Suppress the event auto-redraw
                                // so only one render cycle occurs instead of two.
                                e.redraw = false;
                                tab.onTabActivatedCallback();
                            } else {
                                // No route-based navigation: use local state so
                                // the normal event auto-redraw updates the UI.
                                vnode.state.selectedTab = key;
                            }
                        }
                    }, [
                        tab.icon ? 
                        m(Icon, { path: tab.icon })
                        : null,
                        m(".tabs-container-tab-button-title", tab.title),
                    ])
                })
            ]),
            m(".tabs-container-content.tabs-container-content-" + currentTab, [
                tabs[currentTab].tabData
            ]),
        ]);
    }
}

export function TabsContainerTab(tabData, icon, title, onTabActivatedCallback) {
    this.icon = icon;
    this.title = title;
    this.onTabActivatedCallback = onTabActivatedCallback;
    this.tabData = tabData;
}
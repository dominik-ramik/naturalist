import m from "mithril";

import "./TabsContainer.css";

export let TabsContainer = {
    selectedTab: null,

    oncreate: function(vnode) {
        TabsContainer.selectedTab = vnode.attrs.activeTab;
    },

    view: function(vnode) {

        let tabs = vnode.attrs.tabs;
        const tabNames = Object.keys(tabs);
        if (tabs === null || tabNames.length == 0) {
            return null;
        }

        TabsContainer.selectedTab = vnode.attrs.activeTab;

        let currentTab = tabNames.indexOf(TabsContainer.selectedTab) < 0
            ? tabNames[0]
            : TabsContainer.selectedTab;

        return m(".tabs-container", [
            m(".tabs-container-buttons", [
                tabNames.map(function(key, index) {
                    let tab = tabs[key];
                    return m("button.tabs-container-tab-button" + (tabNames[index] == TabsContainer.selectedTab ? ".tabs-container-active-tab-button" : ""), {
                        onclick: function() {
                            TabsContainer.selectedTab = tabNames[index];
                            if (tab.onTabActivatedCallback) {
                                tab.onTabActivatedCallback();
                            }
                        }
                    }, [
                        tab.icon ? m("img.tabs-container-tab-button-icon[src=" + tab.icon + "]") : null,
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
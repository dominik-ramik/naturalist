export let TabsContainer = {
    selectedTab: null,

    oncreate: function(vnode) {
        TabsContainer.selectedTab = vnode.attrs.activeTab;
    },

    view: function(vnode) {

        let tabs = vnode.attrs.tabs;
        if (tabs === null || Object.keys(tabs).length == 0) {
            return null;
        }
        let tabNames = Object.keys(tabs);

        if (TabsContainer.selectedTab === null && vnode.attrs.activeTab !== null) {
            TabsContainer.selectedTab = vnode.attrs.activeTab;
        }

        let currentTab = "";
        if (Object.keys(tabs).indexOf(TabsContainer.selectedTab) < 0) {
            currentTab = Object.keys(tabs)[0];
        } else {
            currentTab = TabsContainer.selectedTab;
        }

        return m(".tabs-container", [
            m(".tabs-container-buttons", [
                Object.keys(tabs).map(function(key, index) {
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
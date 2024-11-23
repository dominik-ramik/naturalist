import { copyToClipboard, routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { ChecklistView } from "../view/ChecklistView.js";
import { _t } from "../model/I18n.js";
import { Settings } from "../model/Settings.js";
import { AppLayoutView } from "./AppLayoutView.js";

export let MenuStripView = {

    menuOpen: false,

    view: function() {
        //console.log("BUG!!! fix on desktop view - clicked on taxon parent in checklist");

        return m(".app-menu", [
            //"ADD persistent Filters below the menu that will allow filtering by search categoires (e.g. island or others) and will be sticky in the url",
            (m.route.get().startsWith("/checklist") || (m.route.get().startsWith("/search") && !AppLayoutView.mobile()) ? menuTopBar() : backButton()),
            this.menuOpen ? menuPanel() : null
        ]);
    }
}

function menuPanel() {
    return m(".menu-panel-wrapper", [
        m(".menu-panel", [
            m(".menu-hide-panel.clickable", {
                onclick: function() {
                    MenuStripView.menuOpen = !MenuStripView.menuOpen;
                }
            }, [
                m("img.menu-button-image[src=./img/ui/menu/arrow_back.svg]"),
                m(".menu-button-description", _t("menu")),
            ]),
            m(".menu-items", [
                m(MenuItem, {
                    onclick: function() {
                        MenuStripView.menuOpen = !MenuStripView.menuOpen;
                        routeTo("/about/checklist");
                    },
                    icon: "about",
                    title: _t("about_this")
                }),
                m(MenuDivider),
                Checklist.getAllLanguages().length > 1 ? m(MenuExpandable, { title: _t("languages") }, [
                    Checklist.getAllLanguages().map(function(lang) {
                        if (lang.code == Checklist.getCurrentLanguage()) {
                            return null; //skip this version
                        } else {
                            return m(MenuItem, {
                                onclick: function() {
                                    Settings.language(lang.code);
                                    routeTo("/checklist", "", lang.code);
                                    MenuStripView.menuOpen = false;
                                    location.reload(true);
                                },
                                title: lang.name,
                            })
                        }
                    })
                ]) : null,
                //Checklist.getAllLanguages().length > 1 ? m(MenuDivider) : null,
                m(MenuItem, {
                    onclick: function() {
                        MenuStripView.menuOpen = !MenuStripView.menuOpen;
                        routeTo("/manage");
                    },
                    icon: "manage",
                    title: _t("manage")
                }),
                m(MenuDivider),
                m(MenuItem, {
                    onclick: function() {
                        window.location = "./docs/";
                    },
                    icon: "./img/ui/menu/docs.svg",
                    title: _t("docs")
                }),
                m(MenuItem, {
                    onclick: function() {
                        MenuStripView.menuOpen = !MenuStripView.menuOpen;
                        routeTo("/about/app");
                    },
                    icon: "./img/icon_transparent_dark.svg",
                    title: _t("about_nl")
                }),
            ])
        ]),
        m(".menu-background", {
            onclick: function() {
                MenuStripView.menuOpen = !MenuStripView.menuOpen;
            }
        })
    ]);
}

let MenuItem = {
    view: function(vnode) {
        return m(".menu-item", {
            onclick: vnode.attrs.onclick
        }, [
            vnode.attrs.icon ? m("img.menu-item-img[src=" + (vnode.attrs.icon.startsWith(".") ? vnode.attrs.icon : "./img/ui/menu/" + vnode.attrs.icon + ".svg") + "]") : null,
            m(".menu-item-title", vnode.attrs.title),
        ]);
    }
}
let MenuLabel = {
    view: function(vnode) {
        return m(".menu-item.menu-label", [
            m(".menu-item-title", vnode.attrs.title),
        ]);
    }
}

let MenuDivider = {
    view: function(vnode) {
        return m(".menu-divider", m(".menu-divider-inner"));
    }
}

let MenuExpandable = function(initialVnode) {
    let open = true;

    return {
        view: function(vnode) {
            return m(".menu-expandable", m(".menu-expandable-wrapper", [
                m(".menu-item.expandable-main-button", {
                    onclick: function() {
                        //open = !open;
                    }
                }, [
                    m("img.menu-item-img[src=img/ui/menu/language.svg]"),
                    m(".menu-expandable-title", vnode.attrs.title),
                    //m("img.menu-expandable-expander[src=img/ui/menu/expand_" + (open ? "less" : "more") + ".svg]")

                ]),
                open ? m(".menu-group-items", [vnode.children]) : null
            ]));
        }
    }
}

function menuTopBar() {
    return [
        m(".menu-button.clickable", {
            onclick: function() {
                MenuStripView.menuOpen = !MenuStripView.menuOpen;
            }
        }, [
            m("img.menu-button-image[src=./img/ui/menu/menu.svg]"),
        ]),
        m(".menu-project-name", Checklist.getProjectName()),
        m(".menu-action-button", {
            onclick: function() {
                if (navigator.share) {
                    try {
                        navigator.share({
                            title: Checklist.getProjectName(),
                            text: '',
                            url: window.location.href
                        });
                    } catch (err) {
                        console.log(err);
                    }
                } else {
                    copyToClipboard(window.location.href);
                }
            }
        }, [
            m("img[src=./img/ui/menu/share.svg]"),
            AppLayoutView.mobile() ? null : m(".action-button-title", _t("share_url"))
        ]),
        m(ActionButtonWithMenu, {
            icon: "img/ui/menu/push_pin.svg",
            title: AppLayoutView.mobile() ? null : _t("pin_search"),
            forceWidth: "25em",
            items: [].concat(
                [Settings.pinnedSearches.isCurrentSearchPinned() ? null : { type: "button", state: "", title: _t("pin_this_search"), action: function() { Settings.pinnedSearches.addCurrent(); } }], [Settings.pinnedSearches.getAll().length == 0 ? null : { type: "divider" }],
                Settings.pinnedSearches.getAll().map(function(pinnedItem) {
                    return {
                        type: "button",
                        state: Checklist.queryKey() == JSON.stringify(pinnedItem) ? "inactive" : "",
                        title: m("div", m.trust(Settings.pinnedSearches.getHumanNameForPinnedItem(pinnedItem))),
                        action: function() {
                            Checklist.filter.setFromQuery(pinnedItem);
                        },
                        altActionIcon: "img/ui/menu/remove.svg",
                        altAction: function() {
                            Settings.pinnedSearches.remove(pinnedItem);
                        },
                    }
                })
            )
        }),
        m(ActionButtonWithMenu, {
            icon: "img/ui/menu/filter_list.svg",
            title: AppLayoutView.mobile() ? null : _t("filter_taxa_levels"),
            items: [].concat(
                [(ChecklistView.displayMode == "" ? null : { type: "button", title: _t("cancel_details_filter"), action: function() { ChecklistView.displayMode = ""; } })], [(ChecklistView.displayMode == "" ? null : { type: "divider" })],
                Object.keys(Checklist.getTaxaMeta()).map(function(taxonName) {
                    return {
                        type: "button",
                        title: Checklist.getTaxaMeta()[taxonName].name,
                        state: (ChecklistView.displayMode == taxonName ? "inactive" : ""),
                        action: function() {
                            ChecklistView.displayMode = taxonName;
                            ActionButtonWithMenu.open = false;
                        }
                    }
                }))
        })
    ];
}

function backButton() {
    return m(".menu-button.clickable", {
        onclick: function() {
            routeTo("/checklist");
        }
    }, Checklist._isDataReady ? [
        m("img.menu-button-image[src=./img/ui/menu/arrow_back.svg]"),
        m(".menu-button-description", AppLayoutView.mobile() ? _t("back_to_checklist") : _t("back_to_search"))
    ] : null);
}

let ActionButtonWithMenu = function(initialVnode) {
    let menuId = "";
    let open = false;

    function attachMenuClosingEventListener() {
        document.addEventListener('click', function(event) {
            let thisDropdown = document.getElementById(menuId);
            if (!thisDropdown) {
                return;
            }
            if (event.target == thisDropdown || thisDropdown.contains(event.target)) {
                return;
            }

            open = false;
            m.redraw();
        }, { once: true });
    }

    return {
        oninit: function(vnode) {
            menuId = "action_button_menu_" + (Math.random() + 1).toString(36).substring(2);
            attachMenuClosingEventListener();
        },
        onupdate: function() {
            attachMenuClosingEventListener();
        },
        view: function(vnode) {
            return m(".menu-action-button-with-menu-wrapper[id=" + menuId + "]", [
                m(".menu-action-button", {
                    onclick: function() {
                        open = !open;
                    }
                }, [
                    m("img[src=" + vnode.attrs.icon + "]"),
                    m(".action-button-title", vnode.attrs.title)
                ]),
                open ? m(".submenu" + (vnode.attrs.forceWidth ? "[style=width: " + vnode.attrs.forceWidth + "]" : ""), [vnode.attrs.items.map(function(item) {
                    if (!item) {
                        return null;
                    }

                    if (item.type == "divider") {
                        return m(MenuDivider);
                    }
                    if (item.type == "label") {
                        return m(MenuLabel, { title: item.title });
                    }

                    if (item.type == "button") {
                        return m(".multi-item-menu-button", [
                            m(".menu-item" + (item.state == "inactive" ? ".inactive" : ""), {
                                onclick: function(e) {
                                    if (item.state != "inactive") {
                                        item.action();
                                        open = false;
                                    }
                                }
                            }, [
                                m(".menu-item-title", item.title),
                            ]),
                            (item.altActionIcon ? m(".menu-item.alt-action-item", {
                                onclick: function(e) {
                                    item.altAction();
                                    e.stopPropagation();

                                }
                            }, m("img[src=" + item.altActionIcon + "]")) : null)
                        ]);
                    }
                })]) : null
            ]);
        }
    }
}
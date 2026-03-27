// SearchView.js
import m from "mithril";

import { FilterDropdown } from "../view/FilterDropdownView.js";
import { Checklist } from "../model/Checklist.js";
import { FilterCrumbsView } from "./FilterCrumbsView.js";
import { routeTo, shouldHide } from "../components/Utils.js";
import { InteractionAreaView } from "./InteractionAreaView.js";
import { Settings } from "../model/Settings.js";

const SEARCH_CATEGORY_SEPARATOR = "|";

export let SearchView = {

    view: function () {

        let taxaFilterDropdown = [];
        Object.keys(Checklist.filter.taxa).forEach(function (dataPath, index) {
            taxaFilterDropdown.push(m("li", m(FilterDropdown, { color: Checklist.filter.taxa[dataPath].color, title: Checklist.getNameOfTaxonLevel(dataPath), type: "taxa", dataPath: dataPath })));
        });

        let categorizedDataFilters = {};

        Object.keys(Checklist.filter.data).forEach(function (dataPath) {
            let category = "";
            let title = "";

            if (!Checklist.getDataMeta()[dataPath].searchCategory) {
                console.warn("Data path '" + dataPath + "' is missing 'searchCategory' metadata. It will be grouped under an empty category.");
                return;
            }

            if (Checklist.getDataMeta()[dataPath].searchCategory.includes(SEARCH_CATEGORY_SEPARATOR)) {
                category = Checklist.getDataMeta()[dataPath].searchCategory.split(SEARCH_CATEGORY_SEPARATOR)[0].trim();
                title = Checklist.getDataMeta()[dataPath].searchCategory.split(SEARCH_CATEGORY_SEPARATOR)[1].trim();
            } else {
                category = "";
                title = Checklist.getDataMeta()[dataPath].searchCategory;
            }

            categorizedDataFilters[category] = categorizedDataFilters[category] || [];
            categorizedDataFilters[category].push({ category, title, dataPath });
        });

        return m(".search", [
            // 1. Filter Groups Wrapper (Filters + Crumbs)
            m(".filter-groups-wrapper", [
                m("ul.filter-buttons.taxa-filter", taxaFilterDropdown),
                ...Object.keys(categorizedDataFilters).map(category => {
                    return m("div.data-filter-category", [
                        category == "" ? null : m("h4.search-category-group", category),
                        m("ul.filter-buttons.data-filter", categorizedDataFilters[category].map(item => m("li", m(FilterDropdown, { color: Checklist.filter.data[item.dataPath].color, title: item.title, type: "data", dataPath: item.dataPath }))))
                    ]);
                }),

                m(".view-options-bar", [
                    m("label.view-option", [
                        m("input[type=checkbox]", {
                            checked: Settings.checklistIncludeChildren(),
                            onchange: function () {
                                Settings.checklistIncludeChildren(!Settings.checklistIncludeChildren());
                                Checklist.filter._queryResultCache = {};
                                m.redraw();
                            }
                        }),
                        t("include_match_children")
                    ]),
                ]),
            ]),

            // 2. SearchBox with integrated toggle button (Now at the bottom)
            m(SearchBox, {
                isExpanded: InteractionAreaView.isExpanded,
                toggleHandler: () => {
                    InteractionAreaView.isExpanded = !InteractionAreaView.isExpanded;

                    Settings.mobileFiltersPaneCollapsed(InteractionAreaView.isExpanded);
                }
            }),
            m(FilterCrumbsView),
        ]);
    }
}

let SearchBox = {
    typingTimer: null,
    view: function (vnode) {
        const { isExpanded, toggleHandler } = vnode.attrs;

        // SearchBox is now a flex container (styled in CSS)
        return m(".search-box", [
            m("input[id=free-text][autocomplete=off][type=search][placeholder=" + tf("free_text_search", [Settings.SEARCH_OR_SEPARATOR], true) + "][value=" + Checklist.filter.text + "]", {
                oninput: function (e) {
                    const oldText = Checklist.filter.text;
                    const newText = e.target.value;

                    Checklist.filter.text = newText;

                    // Clear any existing timer
                    if (SearchBox.typingTimer) {
                        clearTimeout(SearchBox.typingTimer);
                        SearchBox.typingTimer = null;
                    }

                    // LOGIC: 
                    // 1. If starting a search (oldText was empty), commit immediately to establish URL state.
                    // 2. If clearing a search (newText is empty), commit immediately to reset view.
                    // 3. Otherwise (refining search), debounce to avoid flooding history.
                    if (oldText.length === 0 || newText.length === 0) {
                        Checklist.filter.commit();
                    } else {
                        SearchBox.typingTimer = setTimeout(function () {
                            Checklist.filter.commit();
                        }, 500);
                    }
                },
                onkeydown: function (e) {
                    if (e.key == "Enter") {
                        if (SearchBox.typingTimer) {
                            clearTimeout(SearchBox.typingTimer);
                            SearchBox.typingTimer = null;
                        }
                        Checklist.filter.commit();
                    }
                }
            }),

            m("button.filter-button.mobile-filter-toggle", {
                onclick: toggleHandler,
            }, [
                m("img.toggle-icon[src=img/ui/checklist/filter.svg]"),
                t("filters"),
                m("img.toggle-icon[src=img/ui/menu/" + (isExpanded ? "expand_more" : "expand_less") + ".svg]"),
            ]),
            !Checklist.filter.isEmpty() ? m("button.filter-button.mobile-clear-filters", {
                onclick: function () {
                    Checklist.filter.clear();
                    Checklist.filter.commit();
                },
            }, [
                m("img.toggle-icon[src=img/ui/search/clear_filter.svg]"),
                t("reset_filter_mobile"),
            ]) : null,
        ]);
    }
}
// SearchView.js
import m from "mithril";

import { FilterDropdown } from "../view/FilterDropdownView.js";
import { Checklist } from "../model/Checklist.js";
import { FilterCrumbsView } from "./FilterCrumbsView.js";
import { _t, _tf } from "../model/I18n.js";
import { routeTo, shouldHide } from "../components/Utils.js";
import { Filter } from "../model/Filter.js";
import { InteractionAreaView } from "./InteractionAreaView.js";
import { Settings } from "../model/Settings.js";

export let SearchView = {

    view: function () {

        let taxaFilterDropdown = [];
        Object.keys(Checklist.filter.taxa).forEach(function (dataPath, index) {
            taxaFilterDropdown.push(m("li", m(FilterDropdown, { color: Checklist.filter.taxa[dataPath].color, title: Checklist.getNameOfTaxonLevel(dataPath), type: "taxa", dataPath: dataPath })));
        });
        let dataFilterDropdown = [];

        dataFilterDropdown = Object.keys(Checklist.filter.data).map(function (dataPath, index) {

            if (shouldHide(dataPath, Checklist.getMetaForDataPath(dataPath).hidden, Checklist.filter.data, "filter")) {
                return null;
            }

            return m("li", m(FilterDropdown, { color: Checklist.filter.data[dataPath].color, title: Checklist.getDataMeta()[dataPath].searchCategory, type: "data", dataPath: dataPath }))
        })

        // FIX: Reverse order to put SearchBox BELOW filters and crumbs
        return m(".search", [
            // 1. Filter Groups Wrapper (Filters + Crumbs)
            m(".filter-groups-wrapper", [
                m("ul.filter-buttons.taxa-filter", taxaFilterDropdown),
                m("ul.filter-buttons.data-filter", dataFilterDropdown),
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
            m("input[id=free-text][autocomplete=off][type=search][placeholder=" + _tf("free_text_search", Settings.SEARCH_OR_SEPARATOR, true) + "][value=" + Checklist.filter.text + "]", {
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
                _t("filters"),
                m("img.toggle-icon[src=img/ui/menu/" + (isExpanded ? "expand_more" : "expand_less") + ".svg]"),
            ]),
            !Checklist.filter.isEmpty() ? m("button.filter-button.mobile-clear-filters", {
                onclick: function () {
                    Checklist.filter.clear();
                    Checklist.filter.commit();
                },
            }, [
                m("img.toggle-icon[src=img/ui/search/clear_filter.svg]"),
                _t("reset_filter_mobile"),
            ]) : null,
        ]);
    }
}
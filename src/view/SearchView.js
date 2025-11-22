// SearchView.js
import m from "mithril";

import { FilterDropdown } from "../view/FilterDropdownView.js";
import { Checklist } from "../model/Checklist.js";
import { FilterCrumbsView } from "./FilterCrumbsView.js";
import { _t } from "../model/I18n.js";
import { routeTo, shouldHide } from "../components/Utils.js";
import { Filter } from "../model/Filter.js";
import { InteractionAreaView } from "./InteractionAreaView.js";

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
                toggleHandler: () => (InteractionAreaView.isExpanded = !InteractionAreaView.isExpanded)
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
            m("input[id=free-text][autocomplete=off][type=search][placeholder=" + _t("free_text_search") + "][value=" + Checklist.filter.text + "]", {
                oninput: function (e) {
                    Checklist.filter.text = e.target.value;
                },
                onkeydown: function (e) {
                    if (e.key == "Enter") {
                        routeTo("/checklist");
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
                m("img.toggle-icon[src=img/ui/search/clear_filter_dark.svg]"),
                _t("reset_filter_mobile"),
            ]) : null,
        ]);
    }
}
import { FilterDropdown } from "../view/FilterDropdownView.js";
import { Checklist } from "../model/Checklist.js";
import { FilterCrumbsView } from "./FilterCrumbsView.js";
import { _t } from "../model/I18n.js";
import { routeTo } from "../components/Utils.js";

export let SearchView = {

    view: function() {

        let taxaFilterDropdown = [];
        Object.keys(Checklist.filter.taxa).forEach(function(dataPath, index) {
            taxaFilterDropdown.push(m("li", m(FilterDropdown, { color: Checklist.filter.taxa[dataPath].color, title: Checklist.getNameOfTaxonLevel(dataPath), type: "taxa", dataPath: dataPath })));
        });
        let dataFilterDropdown = [];
        Object.keys(Checklist.filter.data).forEach(function(dataPath, index) {
            dataFilterDropdown.push(m("li", m(FilterDropdown, { color: Checklist.filter.data[dataPath].color, title: Checklist.getDataMeta()[dataPath].searchCategory, type: "data", dataPath: dataPath })));
        });

        return m(".search", [
            m("ul.filter-buttons.taxa-filter", taxaFilterDropdown),
            m("ul.filter-buttons.data-filter", dataFilterDropdown),
            m(SearchBox),
            m(FilterCrumbsView),
        ]);
    }
}

let SearchBox = {
    typingTimer: null,
    view: function() {
        return m(".search-box",
            m("input[id=free-text][autocomplete=off][type=search][placeholder=" + _t("free_text_search") + "][value=" + Checklist.filter.text + "]", {
                oninput: function(e) {
                    Checklist.filter.text = this.value;
                    Checklist.filter.commit();
                },
                onkeydown: function(e) {
                    if (e.key == "Enter") {
                        routeTo("/checklist");
                    }
                }
            })
        );
    }
}
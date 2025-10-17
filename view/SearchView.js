import { FilterDropdown } from "../view/FilterDropdownView.js";
import { Checklist } from "../model/Checklist.js";
import { FilterCrumbsView } from "./FilterCrumbsView.js";
import { _t } from "../model/I18n.js";
import { routeTo, shouldHide } from "../components/Utils.js";
import { Filter } from "../model/Filter.js";

export let SearchView = {

    view: function() {

        let taxaFilterDropdown = [];
        Object.keys(Checklist.filter.taxa).forEach(function(dataPath, index) {
            taxaFilterDropdown.push(m("li", m(FilterDropdown, { color: Checklist.filter.taxa[dataPath].color, title: Checklist.getNameOfTaxonLevel(dataPath), type: "taxa", dataPath: dataPath })));
        });
        let dataFilterDropdown = [];

        dataFilterDropdown = Object.keys(Checklist.filter.data).map(function(dataPath, index) {

            if(shouldHide(dataPath, Checklist.getMetaForDataPath(dataPath).hidden, Checklist.filter.data, "filter")) {
                return null;
            }

            return m("li", m(FilterDropdown, { color: Checklist.filter.data[dataPath].color, title: Checklist.getDataMeta()[dataPath].searchCategory, type: "data", dataPath: dataPath }))
        })

        /*
        Old code which didn't get updated on filter visibility change ... can be dropped if not causing bugs
        Object.keys(Checklist.filter.data).forEach(function(dataPath, index) {

            if(shouldHide(dataPath, Checklist.getMetaForDataPath(dataPath).hidden, Checklist.filter.data)) {
                console.log("## Filter hidden", dataPath)
                return null;
            }

            dataFilterDropdown.push(m("li", m(FilterDropdown, { color: Checklist.filter.data[dataPath].color, title: Checklist.getDataMeta()[dataPath].searchCategory, type: "data", dataPath: dataPath })));
        });
        */

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
                    Checklist.filter.text = e.target.value;
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
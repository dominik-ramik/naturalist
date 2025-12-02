import m from "mithril";

import { getGradedColor } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { _t } from "../model/I18n.js";
import { Settings } from "../model/Settings.js";

export let FilterCrumbsView = {
    view: function() {
        let types = ["taxa", "data"];
        let crumbs = [];

        types.forEach(function(type) {
            Object.keys(Checklist.filter[type]).forEach(function(dataPath) {
                if (Checklist.filter[type][dataPath].type == "text" || Checklist.filter[type][dataPath].type == "map regions" || Checklist.filter[type][dataPath].type == "badge") {
                    Checklist.filter[type][dataPath].selected.forEach(function(selectedItem) {
                        if (Object.keys(Checklist.filter[type][dataPath].possible).indexOf(selectedItem) < 0) {
                            return;
                        }

                        let cat = "";
                        if (type == "taxa") {
                            cat = Checklist.getTaxaMeta()[dataPath].name;
                        }
                        if (type == "data") {
                            cat = Checklist.getMetaForDataPath(dataPath).searchCategory;
                        }

                        crumbs.push(m(Crumb, { type: type, category: cat, dataPath: dataPath, title: selectedItem, color: getGradedColor(type, "crumb") }));
                    });
                } else if (Checklist.filter[type][dataPath].type == "number") {
                    if (Checklist.filter[type][dataPath].numeric.operation != "") {

                        let thresholdJoiner = "numeric_filter_and";
                        if (Checklist.filter[type][dataPath].numeric.operation == "around") {
                            thresholdJoiner = "numeric_filter_plusminus";
                        }

                        let title = Checklist.filter.numericFilterToHumanReadable(dataPath, Checklist.filter[type][dataPath].numeric.operation, Checklist.filter[type][dataPath].numeric.threshold1, Checklist.filter[type][dataPath].numeric.threshold2, true);
                        crumbs.push(m(Crumb, { type: type, category: Checklist.getMetaForDataPath(dataPath).searchCategory, dataPath: dataPath, title: title, color: getGradedColor(type, "crumb") }));
                    };
                }
            });
        });


        if (Checklist.filter.text.length > 0) {
            let displayTitle = Checklist.filter.text;

            // Check if the search text contains the OR separator
            if (displayTitle.indexOf(Settings.SEARCH_OR_SEPARATOR) !== -1) {
                const parts = displayTitle.split(Settings.SEARCH_OR_SEPARATOR);
                displayTitle = parts.map(function(part, index) {
                    // If it is not the last item, append the OR text
                    if (index < parts.length - 1) {
                        // Return an array fragment containing the part and the separator
                        return [part, m("b", " " + _t("crumb_or") + " ")];
                    }
                    return part;
                });
            }

            crumbs.push(m(Crumb, { 
                type: "text", 
                category: _t("filter_cat_text"), 
                dataPath: "", 
                title: displayTitle, 
                color: getGradedColor("text", "crumb") 
            }));
        }

        return m(".filter-crumbs", [
            crumbs,
            crumbs.length > 0 ? [
                m(".reset-filter-spacer"),
                m(".crumb.reset-filter.clickable", {
                    onclick: function() {
                        Checklist.filter.clear();
                        Checklist.filter.commit();
                    }
                }, [
                    m(".crumb-text", [
                        m(".filter-value", _t("reset_filter")),
                    ]),
                    m("img[src=img/ui/search/clear_filter.svg]")
                ])
            ] : null,
        ]);
    }
}

let Crumb = {
    view: function(vnode) {
        return m(".crumb.clickable[style=background-color: " + vnode.attrs.color + "]", {
            onclick: function() {
                if (vnode.attrs.type == "text") {
                    Checklist.filter.text = "";
                    Checklist.filter.commit();
                } else {
                    if (Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].type == "text" || Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].type == "map regions" || Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].type == "badge") {
                        const index = Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].selected.indexOf(vnode.attrs.title);
                        if (index > -1) { // only splice array when item is found
                            Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].selected.splice(index, 1);
                            Checklist.filter.commit();
                        }
                    } else if (Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].type == "number") {
                        Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].numeric.operation = "";
                        Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].numeric.threshold1 = null;
                        Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].numeric.threshold2 = null;
                    }
                }
            }
        }, [
            m(".crumb-recycle-wrap", m("img.crumb-overlay-recycler[src=img/ui/search/clear_filter.svg]")),
            m(".crumb-text", [
                m("span.filter-category", vnode.attrs.category),
                m("span.filter-value", vnode.attrs.title),

            ])
        ]);
    }
}
import { getGradedColor } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { _t } from "../model/I18n.js";

export let FilterCrumbsView = {
    view: function() {
        let types = ["taxa", "data"];
        let crumbs = [];

        types.forEach(function(type) {
            Object.keys(Checklist.filter[type]).forEach(function(dataPath) {
                if (Checklist.filter[type][dataPath].type == "text") {
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

                        crumbs.push(m(Crumb, { type: type, category: cat, dataPath: dataPath, title: selectedItem, color: Checklist.filter[type][dataPath].color }));
                    });
                } else if (Checklist.filter[type][dataPath].type == "number") {
                    if (Checklist.filter[type][dataPath].numeric.operation != "") {

                        let thresholdJoiner = "numeric_filter_and";
                        if (Checklist.filter[type][dataPath].numeric.operation == "around") {
                            thresholdJoiner = "numeric_filter_plusminus";
                        }

                        let title = Checklist.filter.numericFilterToHumanReadable(dataPath, Checklist.filter[type][dataPath].numeric.operation, Checklist.filter[type][dataPath].numeric.threshold1, Checklist.filter[type][dataPath].numeric.threshold2, true);
                        crumbs.push(m(Crumb, { type: type, category: Checklist.getMetaForDataPath(dataPath).searchCategory, dataPath: dataPath, title: title, color: Checklist.filter[type][dataPath].color }));
                    };
                }
            });
        });


        if (Checklist.filter.text.length > 0) {

            crumbs.push(m(Crumb, { type: "text", category: _t("filter_cat_text"), dataPath: "", title: Checklist.filter.text, color: getGradedColor("text") }));
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
                    if (Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].type == "text") {
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
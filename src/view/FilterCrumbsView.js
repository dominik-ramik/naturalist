import dayjs from "dayjs";
import m from "mithril";
import "./FilterCrumbsView.css";

import { getGradedColor, getUnitFromTemplate, unitToHtml } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { groupMonthsIntoRanges, renderRangesString } from "../model/customTypes/ReaderMonths.js";

const selectableFilterTypes = ["text", "map regions", "badge"];
const rangeFilterTypes = ["number", "interval", "date"];

function formatDateValue(timestamp) {
    const dateObj = dayjs(timestamp);
    if (!dateObj.isValid()) {
        return timestamp?.toString?.() || "";
    }

    return dateObj.format(Checklist.getCurrentDateFormat());
}

function formatRangeValue(type, value) {
    if (type == "date") {
        return formatDateValue(value);
    }

    return value?.toLocaleString?.() || value?.toString?.() || "";
}

export let FilterCrumbsView = {
    view: function () {
        let types = ["taxa", "data"];
        let crumbs = [];

        types.forEach(function (type) {
            Object.keys(Checklist.filter[type]).forEach(function (dataPath) {

                if (Checklist.filter[type][dataPath].type === "months" && Checklist.filter[type][dataPath].selected.length > 0) {
                    let cat = "";
                    if (type == "taxa") {
                        cat = Checklist.getTaxaMeta()[dataPath].name;
                    }
                    if (type == "data") {
                        cat = Checklist.getMetaForDataPath(dataPath).searchCategory;
                    }

                    const title = renderRangesString(groupMonthsIntoRanges(Checklist.filter[type][dataPath].selected));

                    crumbs.push(m(Crumb, { type: type, category: cat, dataPath: dataPath, title: title, color: getGradedColor(type, "crumb") }));
                }

                if (selectableFilterTypes.includes(Checklist.filter[type][dataPath].type)) {
                    Checklist.filter[type][dataPath].selected.forEach(function (selectedItem) {
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

                        let title = selectedItem;
                        if (Checklist.filter[type][dataPath].type === "months") {
                            title = Checklist.filter.monthLabelForValue(selectedItem);
                        }

                        crumbs.push(m(Crumb, { type: type, category: cat, dataPath: dataPath, title: title, color: getGradedColor(type, "crumb") }));
                    });
                } else if (
                    ["number", "date"].includes(Checklist.filter[type][dataPath].type) &&
                    Checklist.filter[type][dataPath].numeric.operation == ""
                ) {
                    Checklist.filter[type][dataPath].selected.forEach(function (selectedItem) {
                        crumbs.push(m(Crumb, {
                            type: type,
                            category: Checklist.getMetaForDataPath(dataPath).searchCategory,
                            dataPath: dataPath,
                            title: formatRangeValue(Checklist.filter[type][dataPath].type, selectedItem),
                            rawValue: selectedItem,
                            color: getGradedColor(type, "crumb")
                        }));
                    });
                } else if (rangeFilterTypes.includes(Checklist.filter[type][dataPath].type)) {
                    if (Checklist.filter[type][dataPath].numeric.operation != "") {
                        const ftype = Checklist.filter[type][dataPath].type;
                        const op = Checklist.filter[type][dataPath].numeric.operation;
                        const t1 = Checklist.filter[type][dataPath].numeric.threshold1;
                        const t2 = Checklist.filter[type][dataPath].numeric.threshold2;
                        let title = ftype === "date"
                            ? Checklist.filter.dateFilterToHumanReadable(dataPath, op, t1, t2, undefined, undefined, true)
                            : ftype === "interval"
                                ? Checklist.filter.intervalFilterToHumanReadable(dataPath, op, t1, t2, undefined, undefined, true)
                                : Checklist.filter.numericFilterToHumanReadable(dataPath, op, t1, t2, undefined, undefined, true);
                        crumbs.push(m(Crumb, { type: type, category: Checklist.getMetaForDataPath(dataPath).searchCategory, dataPath: dataPath, title: title, color: getGradedColor(type, "crumb") }));
                    }
                }
            });
        });


        if (Checklist.filter.text.length > 0) {
            let displayTitle = Checklist.filter.text;

            // Check if the search text contains the OR separator
            if (displayTitle.indexOf(Settings.SEARCH_OR_SEPARATOR) !== -1) {
                const parts = displayTitle.split(Settings.SEARCH_OR_SEPARATOR);
                displayTitle = parts.map(function (part, index) {
                    // If it is not the last item, append the OR text
                    if (index < parts.length - 1) {
                        // Return an array fragment containing the part and the separator
                        return [part, m("b", " " + t("crumb_or") + " ")];
                    }
                    return part;
                });
            }

            crumbs.push(m(Crumb, {
                type: "text",
                category: t("filter_cat_text"),
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
                    onclick: function () {
                        Checklist.filter.clear();
                        Checklist.filter.commit();
                    }
                }, [
                    m(".crumb-text", [
                        m(".filter-value", t("reset_filter")),
                    ]),
                    m("img[src=img/ui/search/clear_filter.svg]")
                ])
            ] : null,
        ]);
    }
}

let Crumb = {
    view: function (vnode) {
        // Show unit annotation for numeric/interval range filters
        const filterType = vnode.attrs.type !== "text" && vnode.attrs.dataPath
            ? Checklist.filter[vnode.attrs.type]?.[vnode.attrs.dataPath]?.type
            : null;
        const unit = ["number", "interval"].includes(filterType)
            ? getUnitFromTemplate(Checklist.getMetaForDataPath(vnode.attrs.dataPath))
            : null;

        return m(".crumb.clickable[style=background-color: " + vnode.attrs.color + "]", {
            onclick: function () {
                if (vnode.attrs.type == "text") {
                    Checklist.filter.text = "";
                    Checklist.filter.commit();
                } else {
                    if (
                        ["number", "date"].includes(Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].type) &&
                        Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].numeric.operation == ""
                    ) {
                        const index = Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].selected.indexOf(vnode.attrs.rawValue);
                        if (index > -1) {
                            Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].selected.splice(index, 1);
                            Checklist.filter.commit();
                        }
                    } else if (selectableFilterTypes.includes(Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].type)) {
                        const index = Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].selected.indexOf(vnode.attrs.title);
                        if (index > -1) { // only splice array when item is found
                            Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].selected.splice(index, 1);
                            Checklist.filter.commit();
                        }
                    } else if (Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].type === "months") {
                        // --- ADDED: Clear all months when the grouped crumb is clicked ---
                        Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].selected = [];
                        Checklist.filter.commit();
                    } else if (rangeFilterTypes.includes(Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].type)) {
                        Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].selected = [];
                        Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].numeric.operation = "";
                        Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].numeric.threshold1 = null;
                        Checklist.filter[vnode.attrs.type][vnode.attrs.dataPath].numeric.threshold2 = null;
                        Checklist.filter.commit();
                    }
                }
            }
        }, [
            m(".crumb-recycle-wrap", m("img.crumb-overlay-recycler[src=img/ui/search/clear_filter.svg]")),
            m(".crumb-text", [
                m("span.filter-category", vnode.attrs.category),
                m("span.filter-value", [
                    vnode.attrs.title,
                    unit ? m("span.crumb-unit", m.trust(" " + unitToHtml(unit))) : null,
                ]),

            ])
        ]);
    }
}

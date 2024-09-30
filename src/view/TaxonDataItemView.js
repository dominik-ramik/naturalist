import { Checklist } from "../model/Checklist.js";
import { ClickableTaxonName } from "../view/TaxonView.js";

export let TaxonDataItemView = {

    originalData: null,

    listOfTaxonDataItemViewFromSubitems: function(data, taxon, dataPath, itemType) {
        let meta = Checklist.getMetaForDataPath(dataPath);

        if (meta.contentType == "taxon") {

            if (data.n.trim() == "") {
                return null;
            }

            return m(ClickableTaxonName, {
                taxonTree: {
                    taxon: data,
                    data: {},
                    children: {}
                }
            });
        }

        let listDisplayType = "span.bullet-list";
        let listSeparator = "";
        let isRealList = true;
        switch (meta.separator) {
            case "":
                //default case (normal bullet list)
                listDisplayType = "span.bullet-list";
                listSeparator = "";
                isRealList = true;
                break;
            case "bullet list":
                listDisplayType = "span.bullet-list";
                listSeparator = "";
                isRealList = true;
                break;
            case "numbered list":
                listDisplayType = "ol.numbered-list[start=1]";
                listSeparator = "";
                isRealList = true;
                break;
            case "space":
                listDisplayType = "span.plain";
                listSeparator = " ";
                isRealList = false;
                break;
            case "comma":
                listDisplayType = "span.plain";
                listSeparator = ", ";
                isRealList = false;
                break;
            default:
                listDisplayType = "span.plain";
                listSeparator = meta.separator;
                isRealList = false;
                break;
        }

        let nullValuesCount = 0;
        let totalValuesCount = 0;

        if (itemType == "array") {
            let dataLength = data.length;

            let result = m(listDisplayType, data.map(function(item, counter) {
                let titleValue = TaxonDataItemView.titleValuePair(item, dataPath + (counter + 1), taxon, (isRealList || counter == dataLength - 1 ? null : listSeparator));
                if (titleValue === null) {
                    nullValuesCount++;
                }
                totalValuesCount++;
                return titleValue;
            }));
            if (nullValuesCount == totalValuesCount) {
                return null;
            }
            return result;
        }
        if (itemType == "object") {
            let dataLength = Object.getOwnPropertyNames(data).length;

            let result = m(listDisplayType, Object.getOwnPropertyNames(data).map(function(item, counter) {
                let titleValue = TaxonDataItemView.titleValuePair(data[item], dataPath + "." + item, taxon, (isRealList || counter == dataLength - 1 ? null : listSeparator));
                if (titleValue === null) {
                    nullValuesCount++;
                }
                totalValuesCount++;
                return titleValue;
            }));
            if (nullValuesCount == totalValuesCount) {
                return null;
            }
            return result;
        }
    },

    getItemType: function(item) {
        let itemType = null;
        if (Array.isArray(item)) { //synonym-like array
            itemType = "array";
        } else if (typeof item === "string" || typeof item === "number") {
            itemType = "simple";
        } else { //redlist-like object
            itemType = "object";
        }
        return itemType;
    },

    titleValuePair: function(data, dataPath, taxon, tailingSeparator) {

        function purifyCssString(css) {
            if (css.indexOf("\"") >= 0) {
                css = css.substring(0, css.indexOf("\""));
            }
            if (css.indexOf("'") >= 0) {
                css = css.substring(0, css.indexOf("'"));
            }
            if (css.indexOf(";") >= 0) {
                css = css.substring(0, css.indexOf(";"));
            }
            if (css.indexOf(":") >= 0) {
                css = css.substring(0, css.indexOf(":"));
            }
            return css;
        }

        var itemType = TaxonDataItemView.getItemType(data);
        let meta = Checklist.getMetaForDataPath(dataPath);

        if (meta.hidden) {
            return null;
        }

        let title = (meta.hasOwnProperty("title") && meta.title != "") ? m("span.data-item-title[style=color: " + Checklist.getThemeHsl("light") + ";]", meta.title + ": ") : null;

        if (itemType == "simple") {
            if (data === null || data.toString() === "") {
                return null;
            }

            //purify prior to use of simple data
            data = DOMPurify.sanitize(data);

            // process template first, then process markdown
            /*
            value = value of this dataPath
            taxon = current taxon with convenience rendering
            data = current data of this taxon
            */
            if (meta.template != "") {
                let templateData = Checklist.getDataObjectForHandlebars(data, TaxonDataItemView.originalData, taxon.n, taxon.a);

                data = Checklist.handlebarsTemplates[dataPath](templateData);
            }

            //process markdown and items with templates
            if (meta.format == "markdown" || (meta.template && meta.template != "")) {
                data = marked.parse(data);
                //in case markdown introduced some dirt, purify it again
                data = DOMPurify.sanitize(data);
                data = data + (tailingSeparator ? tailingSeparator : "");
                data = m.trust(data);
            } else if (meta.format == "badge") {
                let badgeMeta = meta.badges;

                let badgeFormat = badgeMeta.find(function(possibleFormat) {
                    var reg = new RegExp(possibleFormat.contains.toLowerCase(), "gi");
                    return reg.test(data.toLowerCase());
                });
                if (badgeFormat) {
                    data = m.trust("<span class='badge' style='" + (badgeFormat.background ? "background-color: " + purifyCssString(badgeFormat.background) + ";" : "") + (badgeFormat.text ? "color: " + purifyCssString(badgeFormat.text) + ";" : "") + (badgeFormat.border ? "border-color: " + purifyCssString(badgeFormat.border) + ";" : "") + "'>" + data + "</span>" + (tailingSeparator ? "<span class='separator'>" + tailingSeparator + "</span>" : ""));
                }
            } else {
                data = data + (tailingSeparator ? tailingSeparator : "");
            }
        }

        let subitemsList = TaxonDataItemView.listOfTaxonDataItemViewFromSubitems(data, taxon, dataPath, itemType);
        if (subitemsList === null) {
            return null;
        }

        return m("span", [
            title,
            itemType == "simple" ? m("span.simple-value" + (this.filterMatches(data) ? ".found" : ""), data) : subitemsList
        ]);
    },

    filterMatches: function(data) {
        if (Checklist.filter.text.trim() != "" && typeof(data) === "string" && data.toLowerCase().indexOf(Checklist.filter.text.toLowerCase()) >= 0) {
            return true;
        }

        return false; //TODO-future implement coloring of results
    },


    view: function(vnode) {
        TaxonDataItemView.originalData = vnode.attrs.taxon.data;

        let data = vnode.attrs.taxon.data[vnode.attrs.dataItem];
        let currentTaxonName = vnode.attrs.taxon.taxon;
        let titleValue = TaxonDataItemView.titleValuePair(data, vnode.attrs.dataItem, currentTaxonName);
        if (titleValue === null) {
            return null;
        }
        return m(".data-item-view", titleValue);
    }
}
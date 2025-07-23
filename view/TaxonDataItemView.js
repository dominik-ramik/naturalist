import { Checklist } from "../model/Checklist.js";
import {
  filterMatches,
  routeTo,
  shouldHide,
} from "../components/Utils.js";
import { dataReaders } from "../model/customTypes/index.js";

export let TaxonDataItemView = {
  originalData: null,

  renderDataItem: function (data, taxon, dataPath, itemType) {
    let meta = Checklist.getMetaForDataPath(dataPath);

    if (meta == null) {
      console.log("null", dataPath);
      return null;
    }

    // Handle list separators for arrays and objects
    let listDisplayType = "span.bullet-list";
    let listSeparator = "";
    let isRealList = true;
    switch (meta.separator) {
      case "":
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
      case "unmarked list":
        listDisplayType = "ul.unmarked-list";
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

      let result = m(
        listDisplayType,
        data
          .filter((item) => item !== null && item != "")
          .map(function (item, counter) {
            let titleValue = TaxonDataItemView.titleValuePair(
              item,
              dataPath + (counter + 1),
              taxon,
              isRealList || counter == dataLength - 1 ? null : listSeparator
            );
            if (titleValue === null) {
              nullValuesCount++;
            }
            totalValuesCount++;
            return titleValue;
          })
      );
      if (nullValuesCount == totalValuesCount) {
        return null;
      }
      return result;
    }
    if (itemType == "object") {
      let dataLength = Object.getOwnPropertyNames(data).length;

      // Check whether we have a reader for meta.formatting and if so, return the dataToUI, otherwise continue
      const readerResult = TaxonDataItemView.renderWithReader(data, meta, dataPath, taxon, null);
      if (readerResult !== DOMPurify.sanitize(data.toString().trim())) {
        return readerResult;
      }

      let result = m(
        listDisplayType,
        Object.getOwnPropertyNames(data)
          .filter((key) => data[key] !== null && data[key] != "")
          .map(function (item, counter) {
            let titleValue = TaxonDataItemView.titleValuePair(
              data[item],
              dataPath + "." + item,
              taxon,
              isRealList || counter == dataLength - 1 ? null : listSeparator
            );
            if (titleValue === null) {
              nullValuesCount++;
            }
            totalValuesCount++;
            return titleValue;
          })
      );
      if (nullValuesCount == totalValuesCount) {
        return null;
      }
      return result;
    }
  },

  getItemType: function (item) {
    let itemType = null;
    if (Array.isArray(item)) {
      //synonym-like array
      itemType = "array";
    } else if (typeof item === "string" || typeof item === "number") {
      itemType = "simple";
    } else {
      //redlist-like object
      itemType = "object";
    }
    return itemType;
  },

  /**
   * Handles rendering with a dataReader if available, otherwise returns sanitized string.
   * Returns null if the reader returns null (should be hidden).
   */
  renderWithReader: function(data, meta, dataPath, taxon, tailingSeparator) {
    const reader = dataReaders[meta.formatting];
    if (reader && reader.dataToUI) {
      const uiContext = {
        meta: meta,
        dataPath: dataPath,
        taxon: taxon,
        originalData: TaxonDataItemView.originalData
      };
      let rendered = reader.dataToUI(data, uiContext);
      if (rendered === null) {
        return null;
      }
      if (tailingSeparator && typeof rendered === "string") {
        rendered += tailingSeparator;
      } else if (tailingSeparator && rendered && rendered.tag) {
        rendered = [rendered, tailingSeparator];
      }
      return rendered;
    } else {
      return DOMPurify.sanitize(data.toString().trim()) + (tailingSeparator ? tailingSeparator : "");
    }
  },

  titleValuePair: function (data, dataPath, taxon, tailingSeparator) {
    let meta = Checklist.getMetaForDataPath(dataPath);
    if (meta === null) {
      return null;
    }

    var itemType = TaxonDataItemView.getItemType(data);
    if (meta.formatting == "map regions") {
      itemType = "object";
    }

    if (shouldHide(dataPath, meta.hidden, Checklist.filter.data)) {
      return null;
    }

    let title =
      meta.hasOwnProperty("title") && meta.title != ""
        ? m(
            "span.data-item-title[style=color: " +
              Checklist.getThemeHsl("light") +
              ";]",
            meta.title + ": "
          )
        : null;

    if (itemType == "simple") {
      if (data === null || data === undefined || data.toString().trim() === "") {
        return null;
      }

      // Use generic reader-based rendering via helper
      const rendered = TaxonDataItemView.renderWithReader(data, meta, dataPath, taxon, tailingSeparator);
      if (rendered === null) {
        return null;
      }
      data = rendered;
    }

    let subitemsList = TaxonDataItemView.renderDataItem(
      data,
      taxon,
      dataPath,
      itemType
    );

    if (subitemsList === null) {
      return null;
    }

    return m("span", [
      title,
      itemType == "simple"
        ? m("span.simple-value" + (filterMatches(data) ? ".found" : ""), data)
        : subitemsList,
    ]);
  },

  onupdate: function () {
    document.querySelectorAll("a[data-citekey]").forEach((e) => {
      e.onclick = () => {
        routeTo("references/" + e.getAttribute("data-citekey"));
      };
    });
  },

  view: function (vnode) {
    TaxonDataItemView.originalData = vnode.attrs.taxon.data;

    let data = vnode.attrs.taxon.data[vnode.attrs.dataItem];
    let currentTaxonName = vnode.attrs.taxon.taxon;
    let titleValue = TaxonDataItemView.titleValuePair(
      data,
      vnode.attrs.dataItem,
      currentTaxonName
    );
    if (titleValue === null) {
      return null;
    }

    return m("div.data-item-view", [
      m("div.data-item-content", [
        titleValue,
        m("div.clearfix"),
        vnode.children,
      ]),
    ]);
  },
};
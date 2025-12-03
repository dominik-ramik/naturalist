import m from "mithril";
import DOMPurify from "dompurify";

import { Checklist } from "../model/Checklist.js";
import { filterMatches, routeTo, shouldHide } from "../components/Utils.js";
import { dataReaders } from "../model/customTypes/index.js";
import { AppLayoutView } from "./AppLayoutView.js";

export let TaxonDataItemView = {
  originalData: null,

  renderDataItem: function (data, taxon, dataPath, itemType, tailingSeparator) {
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

    if (itemType == "array") {
      // Filter out null/empty items first
      let filteredData = data.filter((item) => item !== null && item != "");

      // Early return if no valid data
      if (filteredData.length === 0) {
        return null;
      }

      let dataLength = filteredData.length;
      let renderedItems = [];

      filteredData.forEach(function (item, counter) {
        // Find original index for correct dataPath
        let originalIndex = data.indexOf(item);
        let titleValue = TaxonDataItemView.titleValuePair(
          item,
          dataPath + (originalIndex + 1),
          taxon,
          isRealList || counter == dataLength - 1 ? null : listSeparator
        );
        if (titleValue !== null) {
          renderedItems.push(titleValue);
        }
      });

      // Return null if all items were filtered out
      if (renderedItems.length === 0) {
        return null;
      }

      return m(listDisplayType, renderedItems);
    }

    if (itemType == "object") {
      // Try the reader first - let readers decide if they can handle object data
      const reader = dataReaders[meta.formatting];
      if (reader && reader.render) {
        const readerResult = TaxonDataItemView.renderWithReader(
          data,
          meta,
          dataPath,
          taxon,
          null
        );
        // If reader returned something (not null), use it
        if (readerResult !== null) {
          return readerResult;
        }
      }

      // Reader doesn't exist or returned null - fall back to property decomposition
      // Filter out null/empty properties first
      let validKeys = Object.getOwnPropertyNames(data).filter(
        (key) => data[key] !== null && data[key] != ""
      );

      // Early return if no valid data
      if (validKeys.length === 0) {
        return null;
      }

      let dataLength = validKeys.length;
      let renderedItems = [];

      validKeys.forEach(function (item, counter) {
        let titleValue = TaxonDataItemView.titleValuePair(
          data[item],
          dataPath + "." + item,
          taxon,
          isRealList || counter == dataLength - 1 ? null : listSeparator
        );
        if (titleValue !== null) {
          renderedItems.push(titleValue);
        }
      });

      // Return null if all items were filtered out
      if (renderedItems.length === 0) {
        return null;
      }

      return m(listDisplayType, renderedItems);
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
  renderWithReader: function (data, meta, dataPath, taxon, tailingSeparator) {
    const reader = dataReaders[meta.formatting];
    if (reader && reader.render) {
      // Normalize taxon to { name, authority }
      let taxonObj = taxon;
      if (taxon && typeof taxon === "object" && Array.isArray(taxon.t)) {
        taxonObj = {
          name: taxon.t[taxon.t.length - 1].name,
          authority: taxon.t[taxon.t.length - 1].a,
        };
      } else if (typeof taxon === "string") {
        taxonObj = { name: taxon, authority: "" };
      }
      const uiContext = {
        meta: meta,
        dataPath: dataPath,
        taxon: taxonObj,
        originalData: TaxonDataItemView.originalData,
      };
      let rendered = reader.render(data, uiContext);
      if (rendered === null) {
        return null;
      }
      if (tailingSeparator) {
        if (typeof rendered === "string" || typeof rendered === "number") {
           rendered = rendered + tailingSeparator;
        } else {
           // Wrap in array [Content, Separator] - Mithril handles this natively
           rendered = [rendered, tailingSeparator]; 
        }
      }
      return rendered;
    } else {
      return (
        DOMPurify.sanitize(data.toString().trim()) +
        (tailingSeparator ? tailingSeparator : "")
      );
    }
  },

  titleValuePair: function (data, dataPath, taxon, tailingSeparator) {
    let meta = Checklist.getMetaForDataPath(dataPath);
    if (meta === null) {
      return null;
    }

    var itemType = TaxonDataItemView.getItemType(data);

    if (shouldHide(dataPath, meta.hidden, Checklist.filter.data)) {
      return null;
    }

    // --- Title and info icon logic ---
    let title = null;
    if (meta.hasOwnProperty("title") && meta.title != "") {
      // Split on first | for info text
      let [mainTitle, infoText] = meta.title.split(/\s*\|\s*(.+)/);
      title = m(
        "span.data-item-title[style=color: " +
        Checklist.getThemeHsl("light") +
        ";]",
        [
          mainTitle,
          infoText
            ? m(
              "span.data-item-info-icon[style=display:inline-block;vertical-align:baseline;cursor:pointer;margin-left:0.3em;]",
              {
                onclick: function (e) {
                  AppLayoutView.toast(infoText, { showPermanently: true });
                  e.stopPropagation();
                },
                title: infoText,
              },
              m("img[style=width:1em;height:1em;vertical-align:middle;]", {
                src: "img/ui/checklist/question.svg",
              })
            )
            : null,
          m("span", m.trust("&#8201;:&nbsp;"))
        ]
      );
    }

    if (itemType == "simple") {
      if (
        data === null ||
        data === undefined ||
        data.toString().trim() === ""
      ) {
        return null;
      }

      // Use generic reader-based rendering via helper
      const rendered = TaxonDataItemView.renderWithReader(
        data,
        meta,
        dataPath,
        taxon,
        tailingSeparator
      );
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
      // Manually append separator for complex types (Simple types already have it inside 'data')
      itemType !== "simple" && tailingSeparator ? tailingSeparator : null
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

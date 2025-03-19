import { Checklist } from "../model/Checklist.js";
import { ClickableTaxonName } from "../view/ClickableTaxonNameView.js";
import {
  filterMatches,
  relativeToUsercontent,
  routeTo,
  shouldHide,
  mdImagesClickableAndUsercontentRelative,
} from "../components/Utils.js";

export let TaxonDataItemView = {
  originalData: null,

  listOfTaxonDataItemViewFromSubitems: function (
    data,
    taxon,
    dataPath,
    itemType
  ) {
    let meta = Checklist.getMetaForDataPath(dataPath);

    if (meta == null) {
      console.log("null", dataPath);
      return null;
    }

    if (meta.contentType == "image") {
      if (data.source.toString().trim() == "") {
        return null;
      }

      let source = data.source;
      let title = data.title;

      if (meta.template != "" && Checklist.handlebarsTemplates[dataPath]) {
        let templateData = Checklist.getDataObjectForHandlebars(
          source,
          TaxonDataItemView.originalData,
          taxon.n,
          taxon.a
        );

        source = Checklist.handlebarsTemplates[dataPath](templateData);
      }

      source = relativeToUsercontent(source);

      return m(
        "span.image-in-view-wrap.fullscreenable-image.clickable[title=" + title + "]",
        {
          onclick: function () {
            this.classList.toggle("fullscreen");
          },
        },
        m("img.image-in-view[src=" + source + "][alt=" + title + "]")
      );
    }

    if (meta.contentType == "taxon") {
      if (data.n.trim() == "") {
        return null;
      }

      return m(ClickableTaxonName, {
        taxonTree: {
          taxon: data,
          data: {},
          children: {},
        },
      });
    }

    if (meta.contentType == "map regions") {
      let mapRegionsSuffixes = Checklist.getMapRegionsMeta();

      const renderedRegions = Checklist.mapRegionsLinearToObject(data).map(
        (regionInfo) => {
          let appendedLegend = mapRegionsSuffixes.find(
            (item) => item.suffix == regionInfo.suffix
          )?.appendedLegend;

          if (appendedLegend === undefined || appendedLegend === null) {
            appendedLegend = "";
          }

          return (
            "**" +
            Checklist.nameForMapRegion(regionInfo.region) +
            "**" +
            appendedLegend
          );
        }
      );

      if (renderedRegions.length == 0) {
        return null;
      }

      return m(
        ".map-regions-data",
        m.trust(marked.parse(renderedRegions.join(", ")))
      );
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

  titleValuePair: function (data, dataPath, taxon, tailingSeparator) {
    function purifyCssString(css) {
      if (css.indexOf('"') >= 0) {
        css = css.substring(0, css.indexOf('"'));
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

    let meta = Checklist.getMetaForDataPath(dataPath);
    var itemType = TaxonDataItemView.getItemType(data);
    if (meta.contentType == "map regions") {
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
      if (meta.template != "" && Checklist.handlebarsTemplates[dataPath]) {
        let templateData = Checklist.getDataObjectForHandlebars(
          data,
          TaxonDataItemView.originalData,
          taxon.n,
          taxon.a
        );

        data = Checklist.handlebarsTemplates[dataPath](templateData);
      }

      //process markdown and items with templates
      if (meta.format == "markdown" || (meta.template && meta.template != "")) {
        //process bibliography
        try {
          data = Checklist.transformDatabaseShortcodes(data);

          data = Checklist.getBibFormatter().transformInTextCitations(
            data,
            (citeKey) => {
              return {
                prefix:
                  '<a class="citation" data-citekey="' +
                  citeKey.toLowerCase() +
                  '">',
                suffix: "</a>",
              };
            }
          );
        } catch (ex) {
          console.log("Error matching ctiation in:", data, ex);
        }
        //*/

        data = marked.parse(data);
        //in case markdown introduced some dirt, purify it again
        data = DOMPurify.sanitize(data, { ADD_ATTR: ["target"] });
        data = data.trim() + (tailingSeparator ? tailingSeparator : "");

        data = mdImagesClickableAndUsercontentRelative(data);

        data = m.trust(data);
      } else if (meta.format == "badge") {
        let badgeMeta = meta.badges;

        let badgeFormat = badgeMeta.find(function (possibleFormat) {
          let possibleFormatCured = possibleFormat.contains
            .toLowerCase()
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); //escape characters for RegEx

          var reg = new RegExp(possibleFormatCured, "gi");
          return reg.test(data.toLowerCase());
        });
        if (badgeFormat) {
          data = m.trust(
            "<span class='badge' style='" +
              (badgeFormat.background
                ? "background-color: " +
                  purifyCssString(badgeFormat.background) +
                  ";"
                : "") +
              (badgeFormat.text
                ? "color: " + purifyCssString(badgeFormat.text) + ";"
                : "") +
              (badgeFormat.border
                ? "border-color: " + purifyCssString(badgeFormat.border) + ";"
                : "") +
              "'>" +
              data +
              "</span>" +
              (tailingSeparator
                ? "<span class='separator'>" + tailingSeparator + "</span>"
                : "")
          );
        }
      } else {
        data = data.trim() + (tailingSeparator ? tailingSeparator : "");
      }
    }

    let subitemsList = TaxonDataItemView.listOfTaxonDataItemViewFromSubitems(
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
    return m(".data-item-view", titleValue);
  },
};

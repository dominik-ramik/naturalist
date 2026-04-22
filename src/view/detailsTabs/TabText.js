import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

import { dataCustomTypes } from "../../model/customTypes/index.js";

export function TabText(tabData, taxon, taxonName) {
  if (!tabData || tabData.length === 0) {
    return null;
  }

  let headings = [];
  let renderedContent = [];

  // Helper to create a valid HTML id from a string
  function makeId(str) {
    return (
      "texttab_" +
      str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
    );
  }

  // Numbering state
  let numbering = [];
  let headingIdx = 0;

  // Helper to get current numbering string
  function numberingString(level) {
    return numbering.slice(0, level).join(".") + (level > 0 ? "." : "");
  }

  // Helper to increment numbering for a given level
  function incrementNumbering(level) {
    numbering = numbering.slice(0, level);
    if (numbering.length < level) {
      while (numbering.length < level) numbering.push(1);
    } else if (numbering.length === level) {
      numbering[level - 1]++;
    } else {
      numbering.push(1);
    }
  }

  // For each group or item, assign numbering and build headings
  tabData.forEach(function (renderingItem, groupIdx) {
    if (!renderingItem.items || renderingItem.items.length === 0) return;

    if (renderingItem.groupTitle) {
      // Grouped: render group title and all items
      incrementNumbering(1);
      let groupNumber = numberingString(1);
      let groupId = makeId(renderingItem.groupTitle);
      headings.push({
        id: groupId,
        label: renderingItem.groupTitle,
        level: 1,
        numbering: groupNumber,
      });

      let subNumbering = 0;
      let groupItems = renderingItem.items.map(function ({ data, meta }) {
        if (!data || data.toString().trim() === "") return null;
        incrementNumbering(2);
        let itemNumber = numberingString(2);
        let itemId = meta.title ? makeId(meta.title) : null;
        if (meta.title) {
          headings.push({
            id: itemId,
            label: meta.title,
            level: 2,
            numbering: itemNumber,
          });
        }
        const uiContext = {
          meta: meta,
          dataPath: meta.columnName || "",
          originalData: taxon.d,
          taxon: {
            name: taxonName,
            authority: taxon.t[taxon.t.length - 1].a,
          },
          placement: "details",
        };
        const reader = dataCustomTypes[meta.dataType] || dataCustomTypes["text"];
        let renderedItem = reader && reader.render ? reader.render(data, uiContext) : null;
        if (renderedItem && meta.title) {
          return m("div", [
            m("div.details-item-title", { id: itemId }, itemNumber + " " + meta.title),
            meta.dataType === "text" ? m("p", renderedItem) : renderedItem,
          ]);
        }
        return renderedItem;
      }).filter(Boolean);

      if (groupItems.length > 0) {
        renderedContent.push(
          m("div", [
            m("div.details-group-title", { id: groupId }, groupNumber + " " + renderingItem.groupTitle),
            ...groupItems
          ])
        );
      }
    } else {
      // Not grouped: render each item individually
      renderingItem.items.forEach(function ({ data, meta }) {
        if (!data || data.toString().trim() === "") return;
        incrementNumbering(1);
        let itemNumber = numberingString(1);
        let itemId = meta.title ? makeId(meta.title) : null;
        if (meta.title) {
          headings.push({
            id: itemId,
            label: meta.title,
            level: 1,
            numbering: itemNumber,
          });
        }
        const uiContext = {
          meta: meta,
          dataPath: meta.columnName || "",
          originalData: taxon.d,
          taxon: {
            name: taxonName,
            authority: taxon.t[taxon.t.length - 1].a,
          },
          placement: "details",
        };
        const reader = dataCustomTypes[meta.dataType] || dataCustomTypes["text"];
        let renderedItem = reader && reader.render ? reader.render(data, uiContext) : null;
        if (renderedItem) {
          if (meta.title) {
            // Use details-group-title style for top-level titles in non-grouped items
            renderedContent.push(
              m("div", [
                m("div.details-group-title", { id: itemId }, itemNumber + " " + meta.title),
                renderedItem,
              ])
            );
          } else {
            renderedContent.push(renderedItem);
          }
        }
      });
    }
  });

  if (renderedContent.length === 0) {
    return null;
  }

  // Generate TOC if there are multiple headings
  let toc = null;
  if (headings.length > 1) {
    toc = m(
      "ul.text-tab-toc",
      headings.map(function (h) {
        return m(
          "li.text-tab-toc-entry",
          {
            style: "margin-left:" + (h.level - 1) * 1.5 + "em"
          },
          m(
            "a",
            {
              href: "#" + h.id,
              onclick: function (e) {
                e.preventDefault();
                const el = document.getElementById(h.id);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }
            },
            h.numbering + " " + h.label
          )
        );
      })
    );
  }

  let finalContent = [];
  if (toc) finalContent.push(toc);
  finalContent = finalContent.concat(renderedContent);

  return m("div", finalContent);
}
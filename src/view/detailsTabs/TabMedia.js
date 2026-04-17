import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

import { dataCustomTypes } from "../../model/customTypes/index.js";

export function TabMedia(tabData, taxon, taxonName) {
  if (!tabData || tabData.length === 0) {
    return null;
  }

  let renderedContent = [];

  tabData.forEach(function (renderingItem) {
    if (!renderingItem.items || renderingItem.items.length === 0) return;

    // Render group title if present
    if (renderingItem.groupTitle) {
      renderedContent.push(
        m(".media-set", [
          m(".details-group-title", renderingItem.groupTitle),
          m(
            ".media-set-list",
            renderingItem.items.map(function ({ data, meta, dataPath }) {
              const uiContext = {
                meta: meta,
                dataPath: dataPath || meta.columnName || "",
                originalData: taxon.d,
                taxon: {
                  name: taxon.t[taxon.t.length - 1].name,
                  authority: taxon.t[taxon.t.length - 1].authority,
                },
                placement: "details",
              };
              const reader = dataCustomTypes[meta.formatting];
              let renderedItem = reader && reader.render ? reader.render(data, uiContext) : null;
              // Render meta.title for each item if present
              if (renderedItem && meta.title) {
                return m(".media-item", [
                  m(".details-item-title", meta.title),
                  renderedItem
                ]);
              }
              return renderedItem;
            })
          ),
        ])
      );
    } else {
      // No group title: render each item individually, with its own title if present
      renderingItem.items.forEach(function ({ data, meta, dataPath }) {
        const uiContext = {
          meta: meta,
          dataPath: dataPath || meta.columnName || "",
          originalData: taxon.d,
          taxon: {
            name: taxon.t[taxon.t.length - 1].name,
            authority: taxon.t[taxon.t.length - 1].authority,
          },
          placement: "details",
        };
        const reader = dataCustomTypes[meta.formatting];
        let renderedItem = reader && reader.render ? reader.render(data, uiContext) : null;
        if (renderedItem) {
          if (meta.title) {
            renderedContent.push(
              m(".media-set", [
                m(".details-group-title", meta.title),
                m(".media-set-list", [renderedItem]),
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

  return m(".media-list", renderedContent);
}
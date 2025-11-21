import m from "mithril";

import { routeTo } from "../components/Utils.js";
import { _t } from "../model/I18n.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";

export let PinnedView = {
  view: function (vnode) {
    let items = [].concat(
      [
        Settings.pinnedSearches.isCurrentSearchPinned()
          ? null
          : {
              type: "button",
              state: "",
              icon: "ui/menu/push_pin",
              title: _t("pin_this_search"),
              action: function () {
                Settings.pinnedSearches.addCurrent();
              },
            },
      ],      
      [
        Settings.pinnedSearches.getAll().length == 0
          ? null
          : { type: "divider" },
      ],
      [
        Settings.pinnedSearches.getAll().length == 0
          ? null
          : { type: "label", title: _t("pined_searches") },
      ],
      Settings.pinnedSearches.getAll().map(function (pinnedItem) {
        return {
          type: "button",
          state:
            Checklist.queryKey() == JSON.stringify(pinnedItem)
              ? "inactive"
              : "",
          title: m(
            "div",
            m.trust(
              Settings.pinnedSearches.getHumanNameForSearch(pinnedItem)
            )
          ),
          action: function () {
            Checklist.filter.setFromQuery(pinnedItem);
            routeTo("/checklist");

          },
          altActionIcon: "img/ui/menu/remove.svg",
          altAction: function () {
            Settings.pinnedSearches.remove(pinnedItem);
          },
        };
      })
    );

    return m(
      ".pinned-menu-items[style=background-color: white; color: black;]",
      items.map(function (item) {
        if (!item) {
          return null;
        }

        if (item.type == "divider") {
          return m(MenuDivider);
        }
        if (item.type == "label") {
          return m(MenuLabel, { title: item.title });
        }

        if (item.type == "button") {
          return m(
            ".multi-item-menu-button",
            {
              onclick: function (e) {
                if (item.state != "inactive") {
                  item.action();
                  open = false;
                }
              },
            },
            [
              m(
                ".menu-item-icon",
                item.icon ? m("img[src=./img/" + item.icon + ".svg]") : null
              ),
              m(".menu-item" + (item.state == "inactive" ? ".inactive" : ""), [
                m(".menu-item-title", item.title),
              ]),
              item.altActionIcon
                ? m(
                    ".menu-item.alt-action-item",
                    {
                      onclick: function (e) {
                        item.altAction();
                        e.stopPropagation();
                      },
                    },
                    m("img[src=" + item.altActionIcon + "]")
                  )
                : null,
            ]
          );
        }
      })
    );
  },
};

let MenuDivider = {
  view: function (vnode) {
    return m(".menu-divider", m(".menu-divider-inner"));
  },
};

let MenuLabel = {
  view: function (vnode) {
    return m(".menu-item.menu-label", [
      m(".menu-item-title", vnode.attrs.title),
    ]);
  },
};

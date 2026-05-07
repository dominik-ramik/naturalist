import m from "mithril";
import { t, tf } from 'virtual:i18n-self';
import "./PinnedView.css";
import { routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { validateActiveToolState, markAsProgrammaticRouteChange } from "./analysisTools/index.js";
import { Icon } from "../components/Icon.js";
import { mdiDeleteOutline, mdiPinOutline } from "@mdi/js";



export let PinnedView = {
  view: function (vnode) {
    let items = [].concat(
      [
        Settings.pinnedSearches.isCurrentSearchPinned()
          ? null
          : {
            type: "button",
            state: "",
            icon: mdiPinOutline,
            title: t("pin_this_search"),
            action: function () {
              Settings.pinnedSearches.addCurrent();
            },
          },
      ],
      [
        Settings.pinnedSearches.getAll().length == 0
          ? null
          : { type: "label", title: t("pined_searches") },
      ],
      Settings.pinnedSearches.getAll().map(function (pinnedItem) {
        return {
          type: "button",
          state:
            Settings.pinnedSearches.matchesCurrent(pinnedItem)
              ? "inactive"
              : "",
          title: m("span", m.trust(Settings.pinnedSearches.getHumanNameForSearch(pinnedItem))),
          action: function () {
            if (pinnedItem.params.v) Settings.viewType(pinnedItem.params.v);
            if (pinnedItem.params.s) Settings.analyticalIntent(pinnedItem.params.s);
            if (Checklist._isDataReady) {
              validateActiveToolState(Checklist.getData());
            }
            markAsProgrammaticRouteChange();
            routeTo("/checklist", pinnedItem.params.q, pinnedItem.params.l);
          },
          altActionIcon: mdiDeleteOutline,
          altAction: function () {
            Settings.pinnedSearches.remove(pinnedItem);
          },
        };
      })
    );

    return m(
      ".pinned-view",
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
          const isInactive = item.state == "inactive";
          return m(
            ".pinned-item-card" + (isInactive ? ".inactive" : ""),
            {
              onclick: function (e) {
                if (!isInactive) {
                  item.action();
                }
              },
            },
            [
              item.icon
                ? m(".pinned-item-icon",
                  m(Icon, {path: item.icon}),
                  )
                : null,
              m(".pinned-item-body",
                m(".pinned-item-title", item.title)
              ),
              item.altActionIcon
                ? m(
                  ".pinned-item-remove",
                  {
                    onclick: function (e) {
                      item.altAction();
                      e.stopPropagation();
                    },
                  },
                  m(Icon, { path: item.altActionIcon }),
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
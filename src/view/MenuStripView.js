import m from "mithril";

import { copyToClipboard, routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { ChecklistView } from "../view/ChecklistView.js";
import { _t } from "../model/I18n.js";
import { Settings } from "../model/Settings.js";
import { AppLayoutView } from "./AppLayoutView.js";
import { getAvailableMaps, mapChart } from "./charts/MapChart.js";

export let MenuStripView = {
  menuOpen: false,

  view: function () {
    return m(".app-menu", [
      //"ADD persistent Filters below the menu that will allow filtering by search categoires (e.g. island or others) and will be sticky in the url",
      m.route.get().startsWith("/checklist") ||
        (m.route.get().startsWith("/search") && !AppLayoutView.mobile())
        ? menuTopBar()
        : backButton(),
      this.menuOpen ? menuPanel() : null,
    ]);
  },
};

function menuPanel() {
  return m(".menu-panel-wrapper", [
    m(".menu-panel", [
      m(
        ".menu-hide-panel.clickable",
        {
          onclick: function () {
            MenuStripView.menuOpen = !MenuStripView.menuOpen;
          },
        },
        [
          m("img.menu-button-image[src=./img/ui/menu/arrow_back.svg]"),
          m(".menu-button-description", _t("menu")),
        ]
      ),
      !Checklist.getProjectAbout() || Checklist.getProjectAbout().trim() == ""
        ? null
        : m(".menu-items", [
          m(MenuItem, {
            onclick: function () {
              MenuStripView.menuOpen = !MenuStripView.menuOpen;
              routeTo("/about/checklist");
            },
            icon: "about",
            title: _t("about_this"),
          }),
          !Checklist.getProjectHowToCite() ||
            Checklist.getProjectHowToCite().trim() == ""
            ? null
            : m(MenuItem, {
              onclick: function () {
                MenuStripView.menuOpen = !MenuStripView.menuOpen;
                routeTo("/about/cite");
              },
              icon: "cite",
              title: _t("how_to_cite"),
            }),
          m(MenuDivider),
          m(MenuItem, {
            onclick: function () {
              if (navigator.share) {
                try {
                  navigator.share({
                    title: Checklist.getProjectName(),
                    text: "",
                    url: window.location.href,
                  });
                } catch (err) {
                  console.log(err);
                }
              } else {
                copyToClipboard(window.location.href);
              }
            },
            icon: "share",
            title: _t("share_url"),
          }),
          m(MenuItem, {
            onclick: function () {
              MenuStripView.menuOpen = !MenuStripView.menuOpen;
              routeTo("/pinned");
            },
            icon: "push_pin",
            title: _t("pin_search"),
          }),
          Checklist.getBibliographyKeys().length > 0
            ? m(MenuItem, {
              onclick: function () {
                MenuStripView.menuOpen = !MenuStripView.menuOpen;
                routeTo("/references");
              },
              icon: "literature",
              title: _t("literature"),
            })
            : null,
          m(MenuDivider),
          Checklist.getAllLanguages().length > 1
            ? m(MenuExpandable, { title: _t("languages") }, [
              Checklist.getAllLanguages().map(function (lang) {
                if (lang.code == Checklist.getCurrentLanguage()) {
                  return null; //skip this version
                } else {
                  return m(MenuItem, {
                    onclick: function () {
                      Settings.language(lang.code);
                      routeTo("/checklist", "", lang.code);
                      MenuStripView.menuOpen = false;
                      location.reload(true);
                    },
                    title: lang.name,
                  });
                }
              }),
            ])
            : null,
          //Checklist.getAllLanguages().length > 1 ? m(MenuDivider) : null,
          m(MenuItem, {
            onclick: function () {
              MenuStripView.menuOpen = !MenuStripView.menuOpen;
              routeTo("/manage");
            },
            icon: "manage",
            title: _t("manage"),
          }),
          m(MenuDivider),
          m(MenuItem, {
            onclick: function () {
              MenuStripView.menuOpen = !MenuStripView.menuOpen;
              routeTo("/about/app");
            },
            icon: "./img/icon_transparent_dark.svg",
            title: _t("about_nl"),
          }),
        ]),
    ]),
    m(".menu-background", {
      onclick: function () {
        MenuStripView.menuOpen = !MenuStripView.menuOpen;
      },
    }),
  ]);
}

let MenuItem = {
  view: function (vnode) {
    return m(
      ".menu-item",
      {
        onclick: vnode.attrs.onclick,
      },
      [
        vnode.attrs.icon
          ? m(
            "img.menu-item-img[src=" +
            (vnode.attrs.icon.startsWith(".")
              ? vnode.attrs.icon
              : "./img/ui/menu/" + vnode.attrs.icon + ".svg") +
            "]"
          )
          : null,
        m(".menu-item-title", vnode.attrs.title),
      ]
    );
  },
};
let MenuLabel = {
  view: function (vnode) {
    return m(".menu-item.menu-label", [
      m(".menu-item-title", vnode.attrs.title),
    ]);
  },
};

let MenuDivider = {
  view: function (vnode) {
    return m(".menu-divider", m(".menu-divider-inner"));
  },
};

let MenuExpandable = function (initialVnode) {
  let open = true;

  return {
    view: function (vnode) {
      return m(
        ".menu-expandable",
        m(".menu-expandable-wrapper", [
          m(
            ".menu-item.expandable-main-button",
            {
              onclick: function () {
                //open = !open;
              },
            },
            [
              m("img.menu-item-img[src=img/ui/menu/language.svg]"),
              m(".menu-expandable-title", vnode.attrs.title),
              //m("img.menu-expandable-expander[src=img/ui/menu/expand_" + (open ? "less" : "more") + ".svg]")
            ]
          ),
          open ? m(".menu-group-items", [vnode.children]) : null,
        ])
      );
    },
  };
};

function menuTopBar() {
  let currentViewName = _t(Settings.viewType()); //settings view type is the same as the i18n tag for that view

  return [
    m(
      ".menu-button.clickable",
      {
        onclick: function () {
          MenuStripView.menuOpen = !MenuStripView.menuOpen;
        },
      },
      [m("img.menu-button-image[src=./img/ui/menu/menu.svg]")]
    ),
    m(".menu-project-name", Checklist.getProjectName()),
    AppLayoutView.mobile()
      ? m(".menu-action-button", [
        m("img[src=./img/ui/menu/cite.svg]"),
        m(
          ".action-button-title",
          {
            onclick: function () {
              routeTo("/about/cite");
            },
          },
          "Cite"
        ),
      ])
      : null,
    m(ActionButtonWithMenu, {
      icon: "img/ui/menu/" + Settings.viewType() + ".svg",
      title: currentViewName,
      imageReverse: true,
      items: [].concat(
        { type: "label", title: _t("view_checklist_as") },
        {
          type: "button",
          title: _t("view_details"),
          icon: "ui/menu/view_details",
          selected: Settings.viewType() === "view_details",
          action: function () {
            Settings.viewType("view_details");
          },
        },
        {
          type: "button",
          title: _t("view_circle_pack"),
          icon: "ui/menu/view_circle_pack",
          selected: Settings.viewType() === "view_circle_pack",
          action: function () {
            Settings.viewType("view_circle_pack");
          },
        },
        {
          type: "button",
          title: _t("view_category_density"),
          icon: "ui/menu/view_category_density",
          selected: Settings.viewType() === "view_category_density",
          action: function () {
            Settings.viewType("view_category_density");
          },
        },
        getAvailableMaps().length == 0
          ? null
          : {
            type: "button",
            title: _t("view_map"),
            icon: "ui/menu/view_map",
            selected: Settings.viewType() === "view_map",
            action: function () {
              Settings.viewType("view_map");
            },
          },
        Settings.viewType() === "view_details"
          ? [
            { type: "label", title: _t("limit_view") },
            { type: "divider" },
            ChecklistView.displayMode == ""
              ? null
              : {
                type: "button",
                title: _t("cancel_details_filter"),
                action: function () {
                  ChecklistView.displayMode = "";
                },
              },
            ,
            ChecklistView.displayMode == "" ? null : { type: "divider" },
            ...Object.keys(Checklist.getTaxaMeta()).map(function (taxonName) {
              return {
                type: "button",
                title: Checklist.getTaxaMeta()[taxonName].name,
                state:
                  ChecklistView.displayMode == taxonName ? "inactive" : "",
                action: function () {
                  ChecklistView.displayMode = taxonName;
                  ActionButtonWithMenu.open = false;
                },
              };
            }),
          ]
          : null
      ),
    }),
  ];
}

function backButton() {
  return m(
    ".menu-button.clickable",
    {
      onclick: function () {
        routeTo("/checklist");
      },
    },
    Checklist._isDataReady
      ? [
        m("img.menu-button-image[src=./img/ui/menu/arrow_back.svg]"),
        m(
          ".menu-button-description",
          AppLayoutView.mobile()
            ? _t("back_to_checklist")
            : _t("back_to_search")
        ),
      ]
      : null
  );
}

let ActionButtonWithMenu = function (initialVnode) {
  let menuId = "";
  let open = false;

  function attachMenuClosingEventListener() {
    document.addEventListener(
      "click",
      function (event) {
        let thisDropdown = document.getElementById(menuId);
        if (!thisDropdown) {
          return;
        }
        if (
          event.target == thisDropdown ||
          thisDropdown.contains(event.target)
        ) {
          return;
        }

        open = false;
        //m.redraw();
      },
      { once: true }
    );
  }

  return {
    oninit: function (vnode) {
      menuId =
        "action_button_menu_" + (Math.random() + 1).toString(36).substring(2);
      attachMenuClosingEventListener();
    },
    onupdate: function () {
      attachMenuClosingEventListener();
    },
    view: function (vnode) {
      return m(".menu-action-button-with-menu-wrapper[id=" + menuId + "]", [
        m(
          ".menu-action-button",
          {
            onclick: function () {
              open = !open;
            },
          },
          [
            vnode.attrs.imageReverse !== true
              ? m("img[src=" + vnode.attrs.icon + "]")
              : null,
            m(".action-button-title", vnode.attrs.title),
            vnode.attrs.imageReverse === true
              ? m("img[src=" + vnode.attrs.icon + "]")
              : null,
          ]
        ),
        open
          ? m(
            ".submenu" +
            (vnode.attrs.forceWidth
              ? "[style=width: " + vnode.attrs.forceWidth + "]"
              : ""),
            [
              vnode.attrs.items.map(function (item) {
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
                    ".multi-item-menu-button" +
                    (item.selected ? ".selected" : ""),
                    {
                      onclick: function (e) {
                        if (!item.selected && item.state != "inactive") {
                          item.action();
                          open = false;
                        }
                      },
                    },
                    [
                      m(
                        ".menu-item-icon",
                        item.icon
                          ? m("img[src=./img/" + item.icon + ".svg]")
                          : null
                      ),
                      m(
                        ".menu-item" +
                        (!item.selected && item.state == "inactive"
                          ? ".inactive"
                          : ""),
                        [m(".menu-item-title", item.title)]
                      ),
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
              }),
            ]
          )
          : null,
      ]);
    },
  };
};

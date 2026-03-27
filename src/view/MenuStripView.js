import m from "mithril";

import { copyToClipboard, routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { ChecklistView } from "../view/ChecklistView.js";
import { Settings } from "../model/Settings.js";
import { ConfigurationDialog } from "./ConfigurationDialog.js";

// Icon metadata used in the header indicator (matches ConfigurationDialog.js)
const VIEW_ICON_MAP = {
  view_details: { provider: "material", name: "format_list_bulleted" },
  view_circle_pack: { provider: "material", name: "bubble_chart" },
  view_category_density: { provider: "material", name: "table_chart" },
  view_map: { provider: "material", name: "map" },
};

// Map view modes to exact SVG filenames used in the UI (mode -> filename)
const MODE_ICON_MAP = {
  view_details: "view_details-clear.svg",
  view_circle_pack: "view_circle_pack.svg",
  view_category_density: "view_category_density.svg",
  view_map: "view_map.svg",
};

const SCOPE_ICON_MAP = {
  "#T": { provider: "material", name: "local_florist" },
  "#S": { provider: "material", name: "science" },
  "#M": { provider: "material", name: "view_module" },
};

export let MenuStripView = {
  menuOpen: false,

  view: function () {
    return m(".app-menu", [
      //"ADD persistent Filters below the menu that will allow filtering by search categoires (e.g. island or others) and will be sticky in the url",
      m.route.get().startsWith("/checklist")
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
          m(".menu-button-description", t("menu")),
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
            title: t("about_this"),
          }),
          !Checklist.getProjectHowToCite() || Checklist.getProjectHowToCite().trim() == ""
            ? null
            : m(MenuItem, {
                onclick: function () {
                  MenuStripView.menuOpen = !MenuStripView.menuOpen;
                  routeTo("/about/cite");
                },
                icon: "cite",
                title: t("how_to_cite"),
              }),
          Checklist.getSingleAccessTaxonomicKeys().length > 0
            ? m(MenuItem, {
                onclick: function () {
                  MenuStripView.menuOpen = !MenuStripView.menuOpen;
                  routeTo("/single-access-keys");
                },
                icon: "single_access_key",
                title: t("keys"),
              })
            : null,
          Checklist.getBibliographyKeys().length > 0
            ? m(MenuItem, {
                onclick: function () {
                  MenuStripView.menuOpen = !MenuStripView.menuOpen;
                  routeTo("/references");
                },
                icon: "literature",
                title: t("literature"),
              })
            : null,
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
            title: t("share_url"),
          }),
          m(MenuItem, {
            onclick: function () {
              MenuStripView.menuOpen = !MenuStripView.menuOpen;
              routeTo("/pinned");
            },
            icon: "push_pin",
            title: t("pin_search"),
          }),
          m(MenuDivider),
          Checklist.getAllLanguages().length > 1
            ? m(MenuExpandable, { title: t("languages") }, [
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
            title: t("manage"),
          }),
          m(MenuDivider),
          m(MenuItem, {
            onclick: function () {
              MenuStripView.menuOpen = !MenuStripView.menuOpen;
              routeTo("/about/app");
            },
            icon: "./img/icon_transparent_dark.svg",
            title: t("about_nl"),
          }),
        ]),
      m(".version-info",
        [
          m("div", "Naturalist v" + import.meta.env.VITE_APP_VERSION),
          Checklist.getLastUpdatedTimestamp()
            ? m("div",
                "Checklist " + Checklist.getLastUpdatedTimestamp() + " · " +
                (Settings._storagePersistent === true
                  ? t("storage_persistent")
                  : Settings._storagePersistent === false
                    ? t("storage_not_persistent")
                    : "")
              )
            : null,
        ]
      )
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
    m(
      "button.global-indicator-btn",
      {
        onclick: function () {
          ConfigurationDialog.open();
        },
      },
      [
        // Use existing UI SVGs for analysis tool and scope
        m("img.global-indicator-img[src=./img/ui/menu/" + (MODE_ICON_MAP[Settings.viewType()] || (Settings.viewType() + ".svg")) + "]"),
        m("span.global-indicator-label", (function () {
          switch (Settings.viewType()) {
            case "view_circle_pack":
              return "Proportional Stacking";
            case "view_category_density":
              return "Cross-Tab Matrix";
            case "view_map":
              return "Geospatial Map";
            case "view_details":
            default:
              return "Checklist";
          }
        })()),
        m("span.separator", " • "),
        m(
          "img.global-indicator-img[src=" + (Settings.analyticalIntent() === "#T" ? "./img/ui/checklist/taxonomy.svg" : Settings.analyticalIntent() === "#S" ? "./img/ui/checklist/tag.svg" : "./img/ui/menu/view_module.svg") + "]"
        ),
        m("span.global-indicator-label", (function () {
          switch (Settings.analyticalIntent()) {
            case "#S":
              return "Specimens";
            case "#T":
              return "Taxa";
            default:
              return "Full Catalog";
          }
        })()),
        m("img.global-indicator-caret[src=./img/ui/search/expand-clear.svg]"),
      ]
    ),
  ];
}

function backButton() {
  return m(
    ".menu-button.clickable",
    {
      onclick: function () {
        routeTo("/checklist");
        return;
        // Use history.back() for better UX on detail pages, then fallback to /checklist
        if (window.history.length > 1) {
          window.history.back();
        } else {
          routeTo("/checklist");
        }
      },
    },
    Checklist._isDataReady
      ? [
        m("img.menu-button-image[src=./img/ui/menu/arrow_back.svg]"),
        m(
          ".menu-button-description",
          t("back_to_search")
        ),
      ]
      : null
  );
}

let ActionButtonWithMenu = function (initialVnode) {
  let menuId = "";
  let open = false;
  let handleDocumentClick = null;

  return {
    oninit: function (vnode) {
      menuId =
        "action_button_menu_" + (Math.random() + 1).toString(36).substring(2);
      handleDocumentClick = function (event) {
        if (!open) {
          return;
        }

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
        m.redraw();
      };
    },
    oncreate: function () {
      document.addEventListener("click", handleDocumentClick);
    },
    onremove: function () {
      document.removeEventListener("click", handleDocumentClick);
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
            m("img[src=" + vnode.attrs.icon + "]"),
            m(".action-button-title", vnode.attrs.title),
            m("img[src=img/ui/menu/expand_" + (open ? "less" : "more") + ".svg]"),
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

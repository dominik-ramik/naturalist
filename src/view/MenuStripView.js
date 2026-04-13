import m from "mithril";
import "./MenuStripView.css";

import { copyToClipboard, routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { ConfigurationDialog } from "./ConfigurationDialog.js";
import { TOOL_LIST, SCOPE_CHOICES } from "./analysisTools/index.js";

export let MenuStripView = {
  menuOpen: false,

  view: function () {
    return m(".app-menu", [
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
                    return null;
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
      { onclick: vnode.attrs.onclick },
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
            { onclick: function () {} },
            [
              m("img.menu-item-img[src=img/ui/menu/language.svg]"),
              m(".menu-expandable-title", vnode.attrs.title),
            ]
          ),
          open ? m(".menu-group-items", [vnode.children]) : null,
        ])
      );
    },
  };
};

/**
 * menuTopBar
 * Renders the main header bar with the hamburger menu + project name +
 * the configuration indicator button.
 */
function menuTopBar() {
  const currentViewId = Settings.viewType() || TOOL_LIST[0].id;
  const activeTool    = TOOL_LIST.find(v => v.id === currentViewId) || TOOL_LIST[0];
  const currentScope  = Settings.analyticalIntent() || "#T";

  // Dynamic scope lookup from ViewRegistry.
  const activeScope   = SCOPE_CHOICES.find(s => s.id === currentScope) 
                     || SCOPE_CHOICES.find(s => s.id === "#S") 
                     || SCOPE_CHOICES[0];

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
        onclick: () => ConfigurationDialog.open(),
        title: "Configure View" 
      },
      [
        m("span.mobile-only-title", t("configure_view")),
        // ── Analysis tool icon + label ──────────────────────────────────────
        m("img.global-indicator-img", { src: activeTool.iconPath.light, alt: "" }),
        m("span.global-indicator-label", activeTool.label),

        // ── Scope icon + label (only when occurrences data is available) ───────
        Checklist.hasOccurrences() && activeScope && [
          m("span.global-indicator-sep"),
          m("img.global-indicator-img", {
            src: activeScope.iconPath.light,
            alt: ""
          }),
          m("span.global-indicator-label", activeScope.label),
        ],

        // ── Expand caret ─────────────────────────────────────────────────────
        m("img.global-indicator-caret[src=./img/ui/search/expand-light.svg]", { alt: "" }),
      ]
    ),
  ];
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
        if (!open) return;
        let thisDropdown = document.getElementById(menuId);
        if (!thisDropdown) return;
        if (event.target == thisDropdown || thisDropdown.contains(event.target)) return;
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
          { onclick: function () { open = !open; } },
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
                if (!item) return null;
                if (item.type == "divider") return m(MenuDivider);
                if (item.type == "label")   return m(MenuLabel, { title: item.title });
                if (item.type == "button") {
                  return m(
                    ".multi-item-menu-button" + (item.selected ? ".selected" : ""),
                    {
                      onclick: function (e) {
                        if (!item.selected && item.state != "inactive") {
                          item.action();
                          open = false;
                        }
                      },
                    },
                    [
                      m(".menu-item-icon",
                        item.icon
                          ? m("img[src=./img/" + item.icon + ".svg]")
                          : null
                      ),
                      m(
                        ".menu-item" +
                        (!item.selected && item.state == "inactive" ? ".inactive" : ""),
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

function backButton() {
  return m(
    ".menu-button.clickable",
    {
      onclick: function () {
        routeTo("/checklist");
        return;
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
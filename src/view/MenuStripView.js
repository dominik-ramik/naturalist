import m from "mithril";
import { t, tf } from 'virtual:i18n-self';
import "./MenuStripView.css";

import { copyToClipboard, routeTo } from "../components/Utils.js";
import { DOCS_URL } from "../app.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { ConfigurationDialog } from "./ConfigurationDialog.js";
import { TOOL_LIST } from "./analysisTools/index.js";
import { ANALYTICAL_INTENTS_UI } from "../components/analyticalIntentIcons.js";
import { mdiArrowLeft, mdiBookEducationOutline, mdiChevronDown, mdiFileCogOutline, mdiFileDocumentMultipleOutline, mdiFileEditOutline, mdiInformationOutline, mdiKeyChainVariant, mdiMenu, mdiPinOutline, mdiShareVariantOutline, mdiTranslate } from "@mdi/js";
import { Icon, WELL_KNOWN_ICONS_NLLEAF } from "../components/Icon.js";

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
  const howToCite = Checklist.getProjectHowToCite() || null;

  return m(".menu-panel-wrapper", [
    m(".menu-panel-outer-wrapper", [m(".menu-panel", [
      m(
        ".menu-hide-panel.clickable",
        {
          onclick: function () {
            MenuStripView.menuOpen = !MenuStripView.menuOpen;
          },
        },
        [
          m(Icon, { path: mdiArrowLeft, class: "menu-hide-panel-icon" }),
          m(".menu-button-description", t("menu")),
        ]
      ),
      !Checklist.getProjectAbout() || Checklist.getProjectAbout().trim() == ""
        ? null
        : m(".menu-items", [
          m(MenuItem, {
            onclick: function (e) {
              e.redraw = false;
              MenuStripView.menuOpen = !MenuStripView.menuOpen;
              e.redraw = false;
              routeTo("/about/checklist");
            },
            icon: mdiInformationOutline,
            title: t("about_this"),
          }),
          !howToCite || howToCite.trim() == ""
            ? null
            : m(MenuItem, {
              onclick: function (e) {
                e.redraw = false;
                MenuStripView.menuOpen = !MenuStripView.menuOpen;
                routeTo("/about/cite");
              },
              icon: mdiFileEditOutline,
              title: t("how_to_cite"),
            }),
          Checklist.getSingleAccessTaxonomicKeys().length > 0
            ? m(MenuItem, {
              onclick: function (e) {
                e.redraw = false;
                MenuStripView.menuOpen = !MenuStripView.menuOpen;
                routeTo("/single-access-keys");
              },
              icon: mdiKeyChainVariant,
              title: t("keys"),
            })
            : null,
          Checklist.getBibliographyKeys().length > 0
            ? m(MenuItem, {
              onclick: function (e) {
                e.redraw = false;
                MenuStripView.menuOpen = !MenuStripView.menuOpen;
                routeTo("/references");
              },
              icon: mdiBookEducationOutline,
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
            icon: mdiShareVariantOutline,
            title: t("share_url"),
          }),
          m(MenuItem, {
            onclick: function (e) {
              e.redraw = false;
              MenuStripView.menuOpen = !MenuStripView.menuOpen;
              routeTo("/pinned");
            },
            icon: mdiPinOutline,
            title: t("pin_search"),
          }),
          m(MenuDivider),
          m(MenuItem, {
            onclick: function (e) {
              e.redraw = false;
              MenuStripView.menuOpen = !MenuStripView.menuOpen;
              routeTo("/manage");
            },
            icon: mdiFileCogOutline,
            title: t("manage"),
          }),
          m(MenuDivider),
          m(MenuItem, {
            onclick: function () {
              window.open(DOCS_URL, "_blank");
            },
            icon: mdiFileDocumentMultipleOutline,
            title: t("documentation"),
          }),
          m(MenuItem, {
            onclick: function (e) {
              e.redraw = false;
              MenuStripView.menuOpen = !MenuStripView.menuOpen;
              routeTo("/about/app");
            },
            icon: WELL_KNOWN_ICONS_NLLEAF,
            title: t("about_nl"),
          }),
          
      menuLangStrip(),
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
    ])]),
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
          ?
          m(Icon, { path: vnode.attrs.icon })
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

/**
 * menuLangStrip
 * Renders a compact horizontal row of language chips directly beneath the
 * panel header. The active language is highlighted with the --nlblue fill
 * (matching global-indicator-btn); inactive languages are ghost chips that
 * match the sak-chip vocabulary. The row is hidden when only one language
 * is available.
 */
function menuLangStrip() {
  const langs = Checklist.getAllLanguages();
  if (langs.length <= 1) return null;
  const current = Checklist.getCurrentLanguage();

  return m(".menu-lang-strip", [
    m(Icon, { path: mdiTranslate, class: "menu-lang-icon" }),
    langs.map(function (lang) {
      const isActive = lang.code === current;
      return m(
        ".menu-lang-chip" + (isActive ? ".active" : ""),
        {
          onclick: isActive
            ? undefined
            : function (e) {
              e.redraw = false;
              Settings.language(lang.code);
              routeTo("/checklist", "", lang.code);
              MenuStripView.menuOpen = false;
            },
        },
        lang.name
      );
    }),
  ]);
}

/**
 * menuTopBar
 * Renders the main header bar with the hamburger menu + project name +
 * the configuration indicator button.
 */
function menuTopBar() {
  const currentViewId = Settings.viewType() || TOOL_LIST[0].id;
  const activeTool = TOOL_LIST.find(v => v.id === currentViewId) || TOOL_LIST[0];
  // Use the stored intent if valid, otherwise fall back to the first intent the
  // dataset actually supports. No hardcoded intent constants needed here.
  const currentScope = Settings.analyticalIntent()
    || Checklist.availableIntents()[0];

  const activeScope = ANALYTICAL_INTENTS_UI.find(s => s.id === currentScope)
    || ANALYTICAL_INTENTS_UI.find(s => Checklist.availableIntents().includes(s.id))
    || ANALYTICAL_INTENTS_UI[0];

  return [
    m(
      ".menu-button.clickable",
      {
        onclick: function () {
          MenuStripView.menuOpen = !MenuStripView.menuOpen;
        },
      },
      [
        //m("img.menu-button-image[src=./img/ui/menu/menu.svg]")
        m(Icon, { path: mdiMenu }),
      ]
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
        //m("img.global-indicator-img", { src: activeTool.iconPath.light, alt: "" }),
        m(Icon, { path: activeTool.iconPath, fill: "#ffffff", class: "global-indicator-img" }),
        m("span.global-indicator-label", activeTool.label),

        // ── Scope icon + label ───────
        Checklist.availableIntents().length > 1 && activeScope && [
          m("span.global-indicator-sep"),
          m(Icon, { path: activeScope.icon, fill: "#ffffff", class: "global-indicator-img" }),
          m("span.global-indicator-label", activeScope.label),
        ],

        // ── Expand caret ─────────────────────────────────────────────────────
        m(Icon, { path: mdiChevronDown, fill: "#ffffff", class: "global-indicator-caret" }),
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
            m(Icon, { path: vnode.attrs.icon, class: "action-button-icon" }),
            m(".action-button-title", vnode.attrs.title),
            m(Icon, { path: mdiChevronDown, class: "action-button-caret" }),
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
                if (item.type == "label") return m(MenuLabel, { title: item.title });
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
      onclick: function (e) {
        e.redraw = false;
        routeTo("/checklist");
      },
    },
    Checklist._isDataReady
      ? [
        m(Icon, { path: mdiArrowLeft }),
        m(
          ".menu-button-description",
          t("back_to_search")
        ),
      ]
      : null
  );
}
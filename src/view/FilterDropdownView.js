/**
 * FilterDropdownView.js - shell only.
 *
 * FilterDropdown  renders the label pill + opens/closes the positioned panel.
 * DropdownShell   positions the panel and delegates all inner content to the
 *                 plugin returned by getFilterPlugin(filterDef).
 *
 * No type-specific logic lives here.  Adding a new filterable data type means
 * touching exactly one file: its CustomType.
 */

import m from "mithril";
import { t, tf } from 'virtual:i18n-self';
import { copyToClipboard, getUnitFromTemplate, unitToHtml } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { getFilterPlugin } from "../model/filterPlugins/index.js";

import "./FilterDropdownView.css";
import { Icon } from "../components/Icon.js";
import { mdiChevronDown, mdiContentCopy } from "@mdi/js";

// ── FilterDropdown ─────────────────────────────────────────────────────────────

export let FilterDropdown = function (initialVnode) {
  let _open = false;
  let filterDropdownId = "";
  let color = "#263238";
  let title = "?";
  let type = "";
  let dataPath = "";
  let outsideClickHandler = null;

  function setOpen(isOpen) {
    _open = isOpen;
    if (_open) Checklist.filter.delayCommitDataPath = "";
  }

  function isOpen() { return _open; }

  return {
    syncMenuClosingEventListener() {
      if (!_open) {
        if (outsideClickHandler) {
          document.removeEventListener("click", outsideClickHandler, true);
          outsideClickHandler = null;
        }
        return;
      }
      if (outsideClickHandler) return;

      outsideClickHandler = function (event) {
        const thisDropdown = document.getElementById(filterDropdownId);
        if (!thisDropdown) return;
        if (event.target === thisDropdown || thisDropdown.contains(event.target)) return;
        // Capture phase: stop the event here so nothing underneath receives it.
        // This is especially important on mobile where the panel is fixed over
        // the map / list and a dismissal tap must not trigger those elements.
        event.stopPropagation();
        setOpen(false);
        m.redraw();
      };
      // useCapture:true — intercept before the event reaches any element below.
      document.addEventListener("click", outsideClickHandler, true);
    },

    oninit(vnode) {
      color = vnode.attrs.color;
      title = vnode.attrs.title;
      type = vnode.attrs.type;
      dataPath = vnode.attrs.dataPath;
      filterDropdownId = (Math.random() + 1).toString(36).substring(2);
    },
    oncreate() { this.syncMenuClosingEventListener(); },
    onupdate() { this.syncMenuClosingEventListener(); },
    onremove() {
      if (outsideClickHandler) {
        document.removeEventListener("click", outsideClickHandler, true);
        outsideClickHandler = null;
      }
    },

    view() {
      const filterDef = Checklist.filter[type][dataPath];
      const plugin = getFilterPlugin(filterDef);

      // No plugin → show a placeholder instead of an empty list item
      if (!plugin) return m("span.filter-no-plugin", m.trust(tf("filter_no_plugin", [title || filterDef?.type || "?"])));

      const unit = plugin.getUnit(dataPath);
      const count = plugin.getCount(filterDef);
      const showOrb = plugin.isActive(filterDef);

      return m(".filter-dropdown[tabindex=0][id=" + filterDropdownId + "]", [
        m(".label" + (showOrb ? ".active-filter[style=background-color: " + color + "]" : ""), {
          onclick() {
            setOpen(!isOpen());
            if (isOpen()) {
              window.setTimeout(() => {
                const inner = document.getElementById(filterDropdownId + "_inner_text");
                if (inner) inner.focus();
              }, 200);
            }
          },
        }, [
          m(".arrow",
            m(Icon, { path: mdiChevronDown, size: 16 })
          ),
          m(".title", [
            title,
            unit ? m("span.filter-unit-title", m.trust(" (" + unitToHtml(unit) + ")")) : null,
          ]),
          m(".count", count),
          type === "taxa"
            ? m(".clickable.copy[title=" + t("copy_taxa_dropdown", [title]) + "]", {
              onclick(e) {
                const listOfTaxa = Object.keys(Checklist.filter[type][dataPath].possible).sort().join("\n");
                copyToClipboard(listOfTaxa, t("list_of_taxa", [title]));
                e.stopPropagation();
              },
            }, [
              m(Icon, { path: mdiContentCopy, size: 20 })
            ])
            : null,
        ]),
        isOpen()
          ? m(DropdownShell, {
            openHandler: setOpen,
            type,
            dataPath,
            color,
            plugin,
            dropdownId: filterDropdownId + "_inner",
          })
          : null,
      ]);
    },
  };
};

// ── DropdownShell ─────────────────────────────────────────────────────────────

let DropdownShell = function (initialVnode) {
  let dropdownId = "";

  return {
    rectifyPosition() {
      const el = document.getElementById(dropdownId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const bottomOverflow = rect.height + rect.top - window.innerHeight;
      if (bottomOverflow > 0) {
        el.style.top = (-1 * bottomOverflow + el.parentElement.getBoundingClientRect().height) + "px";
      }
    },

    oninit(vnode) { dropdownId = vnode.attrs.dropdownId; },
    onupdate() { this.rectifyPosition(); },

    view(vnode) {
      const { type, dataPath, openHandler, color, plugin } = vnode.attrs;
      const filterDef = Checklist.filter[type][dataPath];

      return m(".dropdown-area[id=" + dropdownId + "]",
        plugin.renderDropdown({ filterDef, type, dataPath, openHandler, color, dropdownId })
      );
    },
  };
};
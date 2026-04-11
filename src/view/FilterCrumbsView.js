/**
 * FilterCrumbsView.js — pure delegation loop.
 *
 * Iterates active filter slots, calls plugin.getCrumbs() to get descriptors,
 * renders a Crumb for each, and delegates onclick to plugin.clearCrumb().
 *
 * No type-specific logic lives here.
 */

import m from "mithril";
import "./FilterCrumbsView.css";

import { getGradedColor, getUnitFromTemplate, unitToHtml } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { getFilterPlugin } from "../model/filterPlugins/index.js";

export let FilterCrumbsView = {
  view() {
    const crumbs = [];

    ["taxa", "data"].forEach(type => {
      Object.keys(Checklist.filter[type]).forEach(dataPath => {
        const filterDef = Checklist.filter[type][dataPath];
        const plugin    = getFilterPlugin(filterDef);
        if (!plugin) return;

        const color = getGradedColor(type, "crumb");
        const cat   = type === "taxa"
          ? Checklist.getTaxaMeta()[dataPath].name
          : Checklist.getMetaForDataPath(dataPath).searchCategory;

        const ctx = { dataPath, type };

        plugin.getCrumbs(filterDef, ctx).forEach(descriptor => {
          crumbs.push(m(Crumb, {
            type, dataPath, category: cat, color,
            descriptor,
            onclick: () => plugin.clearCrumb(filterDef, ctx, descriptor),
          }));
        });
      });
    });

    // Free-text search crumb (not a data-type filter — handled directly)
    if (Checklist.filter.text.length > 0) {
      let displayTitle = Checklist.filter.text;
      if (displayTitle.indexOf(Settings.SEARCH_OR_SEPARATOR) !== -1) {
        const parts = displayTitle.split(Settings.SEARCH_OR_SEPARATOR);
        displayTitle = parts.map((part, index) =>
          index < parts.length - 1 ? [part, m("b", " " + t("crumb_or") + " ")] : part
        );
      }
      crumbs.push(m(Crumb, {
        type:        "text",
        dataPath:    "",
        category:    t("filter_cat_text"),
        color:       getGradedColor("text", "crumb"),
        descriptor:  { title: displayTitle },
        onclick() {
          Checklist.filter.text = "";
          Checklist.filter.commit();
        },
      }));
    }

    return m(".filter-crumbs", [
      crumbs,
      crumbs.length > 0 ? [
        m(".reset-filter-spacer"),
        m(".crumb.reset-filter.clickable", {
          onclick() { Checklist.filter.clear(); Checklist.filter.commit(); },
        }, [
          m(".crumb-text", [m(".filter-value", t("reset_filter"))]),
          m("img[src=img/ui/search/clear_filter.svg]"),
        ]),
      ] : null,
    ]);
  },
};

// ── Generic crumb ─────────────────────────────────────────────────────────────

let Crumb = {
  view(vnode) {
    const { type, dataPath, category, color, descriptor, onclick } = vnode.attrs;

    // Resolve unit for number / interval crumbs (plugin has already set it,
    // but we still need it here for the inline unit suffix)
    const filterDef  = type !== "text" && dataPath ? Checklist.filter[type]?.[dataPath] : null;
    const filterType = filterDef?.type;
    const unit = ["number", "interval"].includes(filterType)
      ? getUnitFromTemplate(Checklist.getMetaForDataPath(dataPath))
      : null;

    const extraClass = descriptor.isStatusFilter ? ".crumb--status-filter" : "";

    return m(".crumb.clickable" + extraClass, { style: { backgroundColor: color }, onclick }, [
      m(".crumb-recycle-wrap", m("img.crumb-overlay-recycler[src=img/ui/search/clear_filter.svg]")),
      m(".crumb-text", [
        m("span.filter-category", category),
        m("span.filter-value" + (descriptor.isStatusFilter ? ".filter-value--status" : ""), [
          descriptor.title,
          unit ? m("span.crumb-unit", m.trust(" " + unitToHtml(unit))) : null,
        ]),
      ]),
    ]);
  },
};
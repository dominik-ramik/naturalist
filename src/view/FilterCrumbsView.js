import dayjs from "dayjs";
import m from "mithril";
import "./FilterCrumbsView.css";

import { getGradedColor, getUnitFromTemplate, unitToHtml } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { groupMonthsIntoRanges, renderRangesString } from "../model/customTypes/CustomTypeMonths.js";

const selectableFilterTypes = ["text", "mapregions", "category"];
const rangeFilterTypes = ["number", "interval", "date"];

function formatDateValue(timestamp) {
  const d = dayjs(timestamp);
  return d.isValid() ? d.format(Checklist.getCurrentDateFormat()) : (timestamp?.toString?.() || "");
}

function formatRangeValue(type, value) {
  return type === "date"
    ? formatDateValue(value)
    : (value?.toLocaleString?.() || value?.toString?.() || "");
}

// ─── Status-filter helpers ────────────────────────────────────────────────────

function statusFilterIsActive(sf) {
  if (!sf) return false;
  return sf.selectedStatuses?.length > 0 || sf.rangeMin != null || sf.rangeMax != null;
}

function statusFilterTitle(sf) {
  if (sf.selectedStatuses?.length > 0) {
    return sf.selectedStatuses.join(", ");
  }
  const parts = [];
  if (sf.rangeMin != null) parts.push(sf.rangeMin.toLocaleString());
  parts.push("–");
  if (sf.rangeMax != null) parts.push(sf.rangeMax.toLocaleString());
  return parts.join("");
}

// ─── Main view ────────────────────────────────────────────────────────────────

export let FilterCrumbsView = {
  view: function () {
    const crumbs = [];

    ["taxa", "data"].forEach(type => {
      Object.keys(Checklist.filter[type]).forEach(dataPath => {
        const fd    = Checklist.filter[type][dataPath];
        const color = getGradedColor(type, "crumb");
        let cat = "";
        if (type === "taxa") cat = Checklist.getTaxaMeta()[dataPath].name;
        if (type === "data") cat = Checklist.getMetaForDataPath(dataPath).searchCategory;

        // ── months (grouped) ──
        if (fd.type === "months" && fd.selected.length > 0) {
          const title = renderRangesString(groupMonthsIntoRanges(fd.selected));
          crumbs.push(m(Crumb, { type, category: cat, dataPath, title, color }));
        }

        // ── selectable (text / category / mapregions) ──
        if (selectableFilterTypes.includes(fd.type)) {
          fd.selected.forEach(selectedItem => {
            if (fd.type === "mapregions") {
              // For mapregions we only show a region crumb when possibleRegions has the item
              // (same guard as original code used for other selectable types)
              if (Object.keys(fd.possible).indexOf(selectedItem) < 0) return;
            } else {
              if (Object.keys(fd.possible).indexOf(selectedItem) < 0) return;
            }

            let title = selectedItem;
            if (fd.type === "months") title = Checklist.filter.monthLabelForValue(selectedItem);

            crumbs.push(m(Crumb, { type, category: cat, dataPath, title, color }));
          });

          // ── mapregions status-filter crumb (one per dataPath, separate from region crumbs) ──
          if (fd.type === "mapregions" && statusFilterIsActive(fd.statusFilter)) {
            crumbs.push(m(StatusFilterCrumb, {
              type,
              category: cat,
              dataPath,
              title: statusFilterTitle(fd.statusFilter),
              color,
            }));
          }
        }

        // ── exact-select range (number / date without numeric operation) ──
        if (["number", "date"].includes(fd.type) && fd.numeric.operation === "") {
          fd.selected.forEach(selectedItem => {
            crumbs.push(m(Crumb, {
              type,
              category: Checklist.getMetaForDataPath(dataPath).searchCategory,
              dataPath,
              title: formatRangeValue(fd.type, selectedItem),
              rawValue: selectedItem,
              color,
            }));
          });
        }

        // ── range filter with operation ──
        if (rangeFilterTypes.includes(fd.type) && fd.numeric.operation !== "") {
          const ftype = fd.type;
          const { operation: op, threshold1: t1, threshold2: t2 } = fd.numeric;
          const title = ftype === "date"     ? Checklist.filter.dateFilterToHumanReadable(dataPath, op, t1, t2, undefined, undefined, true)
                      : ftype === "interval" ? Checklist.filter.intervalFilterToHumanReadable(dataPath, op, t1, t2, undefined, undefined, true)
                      :                        Checklist.filter.numericFilterToHumanReadable(dataPath, op, t1, t2, undefined, undefined, true);
          crumbs.push(m(Crumb, { type, category: Checklist.getMetaForDataPath(dataPath).searchCategory, dataPath, title, color }));
        }
      });
    });

    // ── free-text search ──
    if (Checklist.filter.text.length > 0) {
      let displayTitle = Checklist.filter.text;
      if (displayTitle.indexOf(Settings.SEARCH_OR_SEPARATOR) !== -1) {
        const parts = displayTitle.split(Settings.SEARCH_OR_SEPARATOR);
        displayTitle = parts.map((part, index) =>
          index < parts.length - 1 ? [part, m("b", " " + t("crumb_or") + " ")] : part
        );
      }
      crumbs.push(m(Crumb, {
        type: "text",
        category: t("filter_cat_text"),
        dataPath: "",
        title: displayTitle,
        color: getGradedColor("text", "crumb"),
      }));
    }

    return m(".filter-crumbs", [
      crumbs,
      crumbs.length > 0 ? [
        m(".reset-filter-spacer"),
        m(".crumb.reset-filter.clickable", {
          onclick() {
            Checklist.filter.clear();
            Checklist.filter.commit();
          }
        }, [
          m(".crumb-text", [m(".filter-value", t("reset_filter"))]),
          m("img[src=img/ui/search/clear_filter.svg]"),
        ]),
      ] : null,
    ]);
  }
};

// ─── Generic crumb ────────────────────────────────────────────────────────────

let Crumb = {
  view(vnode) {
    const { type, dataPath, color } = vnode.attrs;
    const filterType = type !== "text" && dataPath
      ? Checklist.filter[type]?.[dataPath]?.type
      : null;
    const unit = ["number", "interval"].includes(filterType)
      ? getUnitFromTemplate(Checklist.getMetaForDataPath(dataPath))
      : null;

    return m(".crumb.clickable", { style: { backgroundColor: color }, onclick: () => _removeCrumb(vnode.attrs) }, [
      m(".crumb-recycle-wrap", m("img.crumb-overlay-recycler[src=img/ui/search/clear_filter.svg]")),
      m(".crumb-text", [
        m("span.filter-category", vnode.attrs.category),
        m("span.filter-value", [
          vnode.attrs.title,
          unit ? m("span.crumb-unit", m.trust(" " + unitToHtml(unit))) : null,
        ]),
      ]),
    ]);
  }
};

function _removeCrumb({ type, dataPath, title, rawValue }) {
  if (type === "text") {
    Checklist.filter.text = "";
  } else {
    const fd = Checklist.filter[type][dataPath];
    if (["number", "date"].includes(fd.type) && fd.numeric.operation === "") {
      const idx = fd.selected.indexOf(rawValue);
      if (idx > -1) fd.selected.splice(idx, 1);
    } else if (selectableFilterTypes.includes(fd.type)) {
      const idx = fd.selected.indexOf(title);
      if (idx > -1) fd.selected.splice(idx, 1);
    } else if (fd.type === "months") {
      fd.selected = [];
    } else if (rangeFilterTypes.includes(fd.type)) {
      fd.selected = [];
      fd.numeric  = { operation: "", threshold1: null, threshold2: null };
    }
  }
  Checklist.filter.commit();
}

// ─── Status-filter crumb (mapregions only) ────────────────────────────────────

let StatusFilterCrumb = {
  view(vnode) {
    const { type, dataPath, category, title, color } = vnode.attrs;

    return m(".crumb.crumb--status-filter.clickable", { style: { backgroundColor: color },
      onclick() {
        const sf = Checklist.filter[type][dataPath].statusFilter;
        sf.selectedStatuses = [];
        sf.rangeMin = null;
        sf.rangeMax = null;
        Checklist.filter.commit();
      }
    }, [
      m(".crumb-recycle-wrap", m("img.crumb-overlay-recycler[src=img/ui/search/clear_filter.svg]")),
      m(".crumb-text", [
        m("span.filter-category", category),
        m("span.filter-value.filter-value--status", title),
      ]),
    ]);
  }
};
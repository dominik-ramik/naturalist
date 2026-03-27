import m from "mithril";
import { Checklist } from "../../model/Checklist.js";
import { Settings } from "../../model/Settings.js";

export function SearchOptionsBarView() {
  return m(".view-options-bar", [
    m("label.view-option", [
      m("input[type=checkbox]", {
        checked: Settings.checklistIncludeChildren(),
        onchange: function () {
          Settings.checklistIncludeChildren(!Settings.checklistIncludeChildren());
          Checklist.filter._queryResultCache = {};
          m.redraw();
        },
      }),
      t("include_match_children"),
    ]),
  ]);
}

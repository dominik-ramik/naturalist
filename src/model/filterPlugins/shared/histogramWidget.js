/**
 * histogramWidget.js – the reusable histogram block rendered by every
 * numeric / range dropdown (Number, Date, Interval).
 *
 * The markup, fullscreen-toggle behaviour, and legend are identical across all
 * three plugins; only the `dropdownId` differs at runtime.
 */

import m from "mithril";
import { t } from "virtual:i18n-self";
import { Checklist } from "../../Checklist.js";

/**
 * Renders the histogram container + legend.
 *
 * The actual SVG is drawn externally (drawHistogram / drawIntervalHistogram)
 * into `#histogram_<dropdownId>` after the DOM is available.  This component
 * only owns the wrapper markup and the fullscreen toggle handler.
 *
 * @param {string} dropdownId – unique ID suffix used for the histogram element
 * @returns {Vnode}
 */
export function renderHistogramWrap(dropdownId) {
  return m(".histogram-wrap", [
    m(".histogram#histogram_" + dropdownId, {
      onclick(e) {
        this.classList.toggle("fullscreen");
        this.getElementsByTagName("svg")[0]?.classList.toggle("clickable");
        e.preventDefault();
        e.stopPropagation();
      },
    }),
    m(".legend", [
      m(".legend-item", [
        m(".map-fill[style=background-color: #d3d3d3]"),
        m(".map-legend-title", t("histogram_all_data")),
      ]),
      m(".legend-item", [
        m(".map-fill[style=background-color: " + Checklist.getThemeHsl("light") + "]"),
        m(".map-legend-title", t("histogram_displayed_data")),
      ]),
    ]),
  ]);
}
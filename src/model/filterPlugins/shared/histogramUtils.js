/**
 * Shared histogram rendering - used by filterPluginNumber and filterPluginInterval.
 *
 * drawHistogram        – bins individual scalar values (Number)
 * drawIntervalHistogram – coverage bins for [from, to] pairs (Interval)
 */

import * as d3 from "d3";
import { Checklist } from "../../Checklist.js";

import "./histogramUtils.css";

const NUMBER_OF_BINS = 20;

// ── Shared SVG renderer ───────────────────────────────────────────────────────

function _renderHistogramSvg(wrapper, binsAll, binsPossible, x, margin, width, height) {
  const y = d3.scaleLinear()
    .range([height, 0])
    .domain([0, d3.max(binsAll, d => d.length) || 1]);

  const svg = d3.select(wrapper)
    .append("svg")
    .attr("viewBox",
      `0 0 ${wrapper.getBoundingClientRect().width} ${wrapper.getBoundingClientRect().height}`)
    .attr("style", "background-color: white;")
    .attr("class", "clickable")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("~f")));
  svg.append("g").call(d3.axisLeft(y).ticks(5));

  const getBarX     = d => x(d.x0) + 1;
  const getBarWidth = d => Math.max(0, x(d.x1) - x(d.x0) - 1);
  const getBarY     = d => y(d.length);
  const getBarH     = d => height - y(d.length);

  svg.selectAll(".bar-all").data(binsAll).enter().append("rect")
    .attr("class", "bar-all")
    .attr("x", getBarX).attr("y", getBarY).attr("width", getBarWidth).attr("height", getBarH)
    .style("fill", "#d3d3d3");

  svg.selectAll(".bar-filtered").data(binsPossible).enter().append("rect")
    .attr("class", "bar-filtered")
    .attr("x", getBarX).attr("y", getBarY).attr("width", getBarWidth).attr("height", getBarH)
    .style("fill", Checklist.getThemeHsl("light"))
    .style("opacity", 0.6);
}

function _getMarginAndDimensions(wrapper) {
  const margin = { top: 10, right: 10, bottom: 30, left: 45 };
  return {
    margin,
    width:  wrapper.getBoundingClientRect().width  - margin.left - margin.right,
    height: wrapper.getBoundingClientRect().height - margin.top  - margin.bottom,
  };
}

// ── Scalar histogram (DropdownNumber) ─────────────────────────────────────────

/**
 * Renders two overlaid bar charts (all data vs currently-possible data)
 * for individual numeric values.
 */
export function drawHistogram(dropdownId, dataAll, dataPossible) {
  const cleanAll      = (dataAll     || []).filter(d => d != null && !isNaN(d));
  const cleanPossible = (dataPossible || []).filter(d => d != null && !isNaN(d));

  const wrapper = document.getElementById("histogram_" + dropdownId);
  if (!wrapper) return;
  d3.select(wrapper).selectAll("svg").remove();

  const { margin, width, height } = _getMarginAndDimensions(wrapper);

  let [minVal, maxVal] = d3.extent(cleanAll);
  if (minVal === undefined) { minVal = 0; maxVal = 0; }
  if (minVal === maxVal)    { minVal -= 0.5; maxVal += 0.5; }

  const x         = d3.scaleLinear().domain([minVal, maxVal]).nice().range([0, width]);
  const histogram  = d3.histogram().value(d => d).domain(x.domain()).thresholds(x.ticks(NUMBER_OF_BINS));

  _renderHistogramSvg(wrapper, histogram(cleanAll), histogram(cleanPossible), x, margin, width, height);
}

// ── Coverage histogram (DropdownInterval) ─────────────────────────────────────

/**
 * Each bin's height = number of [from, to] pairs that overlap [bin.x0, bin.x1).
 * This gives a true picture of data density across the value range.
 */
export function drawIntervalHistogram(dropdownId, allPairs, filteredPairs) {
  const wrapper = document.getElementById("histogram_" + dropdownId);
  if (!wrapper) return;
  d3.select(wrapper).selectAll("svg").remove();
  if (!allPairs.length) return;

  const { margin, width, height } = _getMarginAndDimensions(wrapper);

  const allEndpoints = allPairs.flatMap(([a, b]) => [a, b]);
  let [minVal, maxVal] = d3.extent(allEndpoints);
  if (minVal === maxVal) { minVal -= 0.5; maxVal += 0.5; }

  const x        = d3.scaleLinear().domain([minVal, maxVal]).nice().range([0, width]);
  const [lo, hi] = x.domain();
  const step     = (hi - lo) / NUMBER_OF_BINS;

  function coverageBins(pairs) {
    return Array.from({ length: NUMBER_OF_BINS }, (_, i) => {
      const x0 = lo + i * step;
      const x1 = x0 + step;
      return { x0, x1, length: pairs.filter(([from, to]) => from < x1 && to >= x0).length };
    });
  }

  _renderHistogramSvg(wrapper, coverageBins(allPairs), coverageBins(filteredPairs), x, margin, width, height);
}
import m from "mithril";
import * as d3 from "d3";

import { Checklist } from "../../model/Checklist.js";
import { Settings } from "../../model/Settings.js";
import { colorFromRatio } from "../../components/Utils.js";
import { D3ChartView } from "../shared/D3ChartView.js";
import { SelectParam } from "../shared/FormControls.js";

import "./HierarchyBubbles.css";

// ─── Tool config export ────────────────────────────────────────────────────

//
// NOTE: Only the `config` export is shown here — the rest of HierarchyBubbles.js
// (circlePacking, circlePackingView, etc.) is unchanged.  Splice this config
// block in place of the original `export const config = { ... }` declaration.

export const config = {
  id: "tool_hierarchy_bubbles",
  label: "Hierarchy bubbles",
  iconPath: {
    light: "./img/ui/menu/view_circle_pack-light.svg",
    dark:  "./img/ui/menu/view_circle_pack.svg",
  },
  info: "Visualize the relative volume of nested taxonomic groups, using color to instantly spot where filter matches are concentrated",
  getTaxaAlongsideOccurrences: false,

  getAvailability: (availableIntents, checklistData) => {
    const supportedIntents = availableIntents.filter(intent => {
      if (intent === "#T" || intent === "#S") {
        return checklistData.checklist && checklistData.checklist.length > 0;
      }
    });
    return {
      supportedIntents,
      isAvailable: supportedIntents.length > 0,
      toolDisabledReason: "No data found in this dataset.",
      scopeDisabledReason: (intent) =>
        `${config.label} is unavailable ${intent === "#S" ? "for occurrences" : "for taxa"} because none were found.`,
    };
  },

  parameters: [
    {
      id:      "maxLevels",
      label:   "Maximum depth of levels displayed",
      type:    "select",
      default: 3,
      accessor: Settings.circlePackingMaxLevels,
      values:  [3, 4, 5, 6, 7],
      // notify: false — this is a pure rendering preference (how many bubble
      // rings are drawn), not a data filter.  Changing it never hides records
      // from the user, so there's nothing to call attention to.
      notify:  false,
    },
  ],

  render: ({ filteredTaxa, allTaxa, datasetRevision }) =>
    circlePackingView(allTaxa, filteredTaxa, datasetRevision),
};

const occurrenceTagIconPath =
  "M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Z";

function circlePacking(options) {
  let data = options.dataSource;
  let maxDataLevelsDisplayed = options.maxDataLevelsDisplayed || Settings.circlePackingMaxLevels();
  let colorInterpolation = options.colorInterpolation || 212;
  let noMatchColor = options.noMatchColor || "#04040420";
  let opacityStep = options.opacityStep || (maxDataLevelsDisplayed / (maxDataLevelsDisplayed * 12));
  let backgroundColor = options.backgroundColor || "white";
  let labelOpacity = options.labelOpacity || 0.75;
  let fontFamily = options.fontFamily || "sans-serif";
  let showDownloadButton = options.showDownloadButton === false ? false : true;
  let occurrenceMetaIndex = options.occurrenceMetaIndex;

  if (Settings.analyticalIntent() === "#S") {
    // Deep clone to prevent mutating the original dataSource which might be used in other views
    data = JSON.parse(JSON.stringify(options.dataSource));

    function groupOccurrences(node) {
      if (!node.children || node.children.length === 0) return;

      let taxaChildren = [];
      let occurrenceChildren = [];

      node.children.forEach(child => {
        // Determine if the child is a occurrence based on existing logic
        const isSpec = occurrenceMetaIndex !== undefined &&
          occurrenceMetaIndex !== -1 &&
          child.taxonMetaIndex === occurrenceMetaIndex;

        if (isSpec) {
          occurrenceChildren.push(child);
        } else {
          taxaChildren.push(child);
        }

        // Recursively traverse downwards
        groupOccurrences(child);
      });

      // Apply the container ONLY if the level is mixed (has both taxa and occurrences)
      if (taxaChildren.length > 0 && occurrenceChildren.length > 0) {
        let containerTotal = 0;
        let containerMatching = 0;

        // Sum up metrics so that coloring and tooltips still function cleanly
        occurrenceChildren.forEach(c => {
          containerTotal += c.totalLeafCount !== undefined ? c.totalLeafCount : 1;
          containerMatching += c.matchingLeafCount || 0;
        });

        const containerNode = {
          name: tf("taxon_occurrences", [node.name], true),
          children: occurrenceChildren,
          totalLeafCount: containerTotal,
          matchingLeafCount: containerMatching
        };

        // Overwrite children with the taxa + the single newly created container
        node.children = [...taxaChildren, containerNode];
      }
    }

    groupOccurrences(data);
  }

  let isFilterMode = data.matchingLeafCount != data.totalLeafCount;

  function downloadSVG() {
    // 1. Fetch the citation text
    const citationText = Checklist.getProjectHowToCite() || "";

    // 2. Configure text format and boundaries
    const fontSize = 14;
    const lineHeight = fontSize * 1.4; // approx 19.6px
    const paddingX = 20;
    const paddingY = 20;
    const maxWidth = width - (paddingX * 2); // strictly constrains width to chart boundaries

    // 3. Accurately measure and wrap lines using a temporary DOM element
    // This perfectly calculates the exact pixel width of the font in the browser
    const tmpText = svg.append("text")
      .style("font-family", fontFamily)
      .style("font-size", fontSize + "px")
      .style("visibility", "hidden");

    const words = citationText.split(/\s+/);
    const lines = [];
    let currentLine = [];

    words.forEach(word => {
      currentLine.push(word);
      tmpText.text(currentLine.join(" "));

      // If the line exceeds our pixel boundary, push the previous line and start a new one
      if (tmpText.node().getComputedTextLength() > maxWidth && currentLine.length > 1) {
        currentLine.pop(); // Remove the word that caused the overflow
        lines.push(currentLine.join(" "));
        currentLine = [word]; // Start the new line with the overflowed word
      }
    });
    // Push the final remaining line
    if (currentLine.length > 0) {
      lines.push(currentLine.join(" "));
    }

    tmpText.remove(); // Cleanup the temporary measuring element

    // 4. Now that we have perfectly wrapped lines, clone the SVG node
    const clonedSvgNode = svg.node().cloneNode(true);
    const clonedSvg = d3.select(clonedSvgNode);

    // 5. Calculate dynamic height based on the number of actual lines
    const textHeightSpace = (lines.length * lineHeight) + paddingY;
    const newHeight = height + textHeightSpace;

    // 6. Expand the cloned SVG's viewBox and background rect to make space
    clonedSvg.attr("viewBox", `0 0 ${width} ${newHeight}`);
    clonedSvg.select("rect").attr("height", newHeight);

    // 7. Create the text container in the cloned SVG
    const textGroup = clonedSvg.append("text")
      .attr("text-anchor", "end") // Aligns text to the right boundary
      .attr("fill", "black")
      .style("font-family", fontFamily)
      .style("font-size", `${fontSize}px`);

    // 8. Append each line as a <tspan>, progressively building upwards from the bottom
    const bottomY = newHeight - 15; // Anchor 15px above the absolute bottom edge

    lines.forEach((lineText, index) => {
      const yOffset = bottomY - ((lines.length - 1 - index) * lineHeight);

      textGroup.append("tspan")
        .attr("x", width - paddingX) // Locks the right edge exactly 20px from the border
        .attr("y", yOffset)
        .text(lineText);
    });

    // 9. Generate Blob and trigger download
    var svgBlob = new Blob([clonedSvgNode.outerHTML], {
      type: "image/svg+xml;charset=utf-8",
    });
    var svgUrl = URL.createObjectURL(svgBlob);
    var downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = "naturalist-chart.svg";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }

  // ───────────────────────────────
  // 2. GLOBAL SETTINGS AND HELPER FUNCTIONS
  // ───────────────────────────────
  const width = 1000;
  const height = width;

  const matchingRatio = (d, roundedPercentage) => {
    let ratio =
      d.matchingLeafCount == 0 ? 0 : d.matchingLeafCount / d.totalLeafCount;

    if (roundedPercentage) {
      return (ratio * 100.0).toFixed(roundedPercentage);
    } else {
      return ratio;
    }
  };

  const pack = (data) =>
    d3.pack().size([width, height]).padding(1)(
      d3
        .hierarchy(data)
        .sum((d) => d.totalLeafCount || 1)
        .sort((a, b) => b.totalLeafCount - a.totalLeafCount)
    );

  const root = pack(data);
  let currentRoot = root;

  function adaptLabelFontSize(d) {
    const xPadding = 2;
    const diameter = 2 * d.r;
    const availableWidth = diameter - xPadding;
    const targetWidth = 200;
    const labelWidth = computeTextRadius(d.data.name, availableWidth, {
      lineHeight: 12,
    });
    const ratio = (0.25 * availableWidth) / labelWidth;

    let maxSize = 3;
    let minSize = 0.2;

    let finalSize = ratio < 0.5 ? 0.5 : ratio;
    if (finalSize > maxSize) finalSize = maxSize;
    if (finalSize < minSize) finalSize = minSize;
    return finalSize + "em";
  }

  function getLevels(root, depth) {
    depth++;
    if (!root || depth <= 0) return [];
    let result = [];
    let currentLevel = [root];
    for (let i = 0; i < depth; i++) {
      if (currentLevel.length === 0) break;
      result = result.concat(currentLevel);
      currentLevel = currentLevel.flatMap((node) => node.children || []);
    }
    return result;
  }

  function inferColor(node, target) {
    let d = node.data;

    if (target == "circle") {
      if (d.totalLeafCount == d.matchingLeafCount) {
        return colorInterpolation(matchingRatio(d))
      } else if (d.matchingLeafCount == 0) {
        return noMatchColor;
      } else {
        return colorInterpolation(matchingRatio(d))
      }
    } else if (target == "label") {
      if (d.totalLeafCount == d.matchingLeafCount) {
        return "black";
      } else if (d.matchingLeafCount == 0) {
        return "#08080890";
      } else {
        return "black";
      }
    }
  }

  function nodePathKey(node) {
    return node
      .ancestors()
      .map((item) => item.data.name)
      .reverse()
      .join(">");
  }

  function isOccurrenceNode(node) {
    return (
      occurrenceMetaIndex !== undefined &&
      occurrenceMetaIndex !== -1 &&
      node?.data?.taxonMetaIndex === occurrenceMetaIndex
    );
  }

  function occurrenceIconSize(node) {
    return node.r * 0.6;
  }

  // ───────────────────────────────
  // 3. SVG CONTAINER AND GROUPS
  // ───────────────────────────────
  // Create an SVG with a fixed viewBox.
  const svg = d3
    .create("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("width", "100%")
    .style("height", "100%")
    .style("display", "block")
    .style("cursor", "pointer")
    .style("background-color", backgroundColor);

  svg.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#ffffff");

  // Create a header group outside of our zoomable content.

  const gHeader = svg.append("g").attr("class", "header");
  const gDownload = svg.append("g").attr("class", "download");
  const headerLabel = { text: () => { } };

  // Create a zoomable group that contains the actual chart content.
  const gContent = svg.append("g").attr("class", "content");

  // ───────────────────────────────
  // 4. updateChart: Rebuild Chart from New Focus
  // ───────────────────────────────
  function renderBreadcrumbs(focusNode) {
    gHeader.selectAll("*").remove();

    const breadcrumbNodes = focusNode.ancestors().reverse().slice(1);
    let currentX = 5;
    const breadcrumbY = 10;

    breadcrumbNodes.forEach((node, index) => {
      const segment = gHeader
        .append("g")
        .attr("class", "breadcrumb-segment")
        .attr("transform", `translate(${currentX}, ${breadcrumbY})`)
        .style("cursor", "pointer")
        .on("click", (event) => {
          event.stopPropagation();
          updateChart(node);
          resetZoom();
        });

      const label = segment
        .append("text")
        .attr("x", 10)
        .attr("y", 17)
        .attr("fill", "black")
        .style("font", "16px " + fontFamily)
        .style(
          "font-weight",
          index === breadcrumbNodes.length - 1 ? "bold" : "normal"
        )
        .style("pointer-events", "none")
        .text(node.data.name);

      const labelBox = label.node().getBBox();
      segment
        .insert("rect", "text")
        .attr("x", labelBox.x - 8)
        .attr("y", labelBox.y - 5)
        .attr("width", labelBox.width + 16)
        .attr("height", labelBox.height + 10)
        .attr("rx", 6)
        .attr("ry", 6)
        .attr("fill", "white")
        .attr("opacity", index === breadcrumbNodes.length - 1 ? 0.95 : 0.8)
        .attr("stroke", "#00000020")
        .attr("stroke-width", 1);

      currentX += labelBox.width + 22;

      if (index < breadcrumbNodes.length - 1) {
        const separator = gHeader
          .append("text")
          .attr("x", currentX)
          .attr("y", breadcrumbY + 17)
          .attr("fill", "black")
          .style("font", "16px " + fontFamily)
          .style("pointer-events", "none")
          .text(">");

        currentX += separator.node().getBBox().width + 8;
      }
    });
  }

  function renderDownloadButton() {
    gDownload.selectAll("*").remove();

    if (!showDownloadButton) {
      return;
    }

    const downloadButton = gDownload
      .append("g")
      .attr("transform", `translate(${width - 40}, ${10})`)
      .attr("opacity", 1)
      .style("cursor", "pointer")
      .on("click", (event) => {
        event.stopPropagation();
        downloadSVG();
      });

    downloadButton
      .append("rect")
      .attr("x", -4)
      .attr("y", -6)
      .attr("width", 36)
      .attr("height", 36)
      .attr("fill", "white")
      .attr("opacity", 0.7)
      .attr("rx", 6)
      .attr("ry", 6);

    downloadButton
      .append("path")
      .attr(
        "d",
        "M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"
      )
      .style("fill", "black")
      .style("stroke", "transparent")
      .attr("transform", "translate(-5, 30) scale(0.04)");
  }

  function updateChart(newFocus) {
    currentRoot = newFocus;
    headerLabel.text(
      `${newFocus
        .ancestors()
        .map((d) => d.data.name)
        .reverse()
        .slice(1)
        .join(" ▹ ")}`
    );

    function getNodeStatsText(d) {
      return isFilterMode
        ? (matchingRatio(d.data, 1) > 0 && matchingRatio(d.data, 1) < 1
          ? "< 1%"
          : matchingRatio(d.data, 1) + "%") +
        " | " +
        d.data.matchingLeafCount +
        " of " +
        d.data.totalLeafCount +
        " match"
        : (d.data.totalLeafCount == 1 ? "" : " (" + String(d.data.totalLeafCount) + " members)");
    }

    function getFullTooltipText(d) {
      const breadcrumbs = d.ancestors().map((a) => a.data.name).reverse().slice(1).join(" ▹ ");
      return `${breadcrumbs}\n${getNodeStatsText(d)}`;
    }

    renderBreadcrumbs(newFocus);
    renderDownloadButton();

    const tree = pack(newFocus.data);
    tree.parent = newFocus.parent;
    const view = [tree.x, tree.y, tree.r * 2];

    // Clear only the content group.
    gContent.selectAll("*").remove();

    // Attach a background rectangle to gContent for zooming out.
    gContent
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "white")
      .attr("pointer-events", "all");

    svg.on("click", () => {
      // Add a check to ensure we don't zoom out past our designated startingRoot
      if (currentRoot && currentRoot.parent && currentRoot !== startingRoot) {
        updateChart(currentRoot.parent);
        resetZoom();
      }
    });

    const nodes = getLevels(tree, maxDataLevelsDisplayed);

    const nodeSelection = gContent
      .append("g")
      .selectAll("circle")
      .data(nodes, (d) => nodePathKey(d))
      .join("circle")
      .attr("fill", (d) => inferColor(d, "circle"))
      .attr("opacity", (d) => (1 + d.depth) * opacityStep)
      .attr("pointer-events", (d) => (d.children ? "all" : "none"))
      .attr("stroke-width", 0.5)
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
      .attr("r", (d) => d.r)
      .on("mouseenter", function () {
        d3.select(this)
          .attr("old-opacity", d3.select(this).attr("opacity"))
          .attr("opacity", 0.05);
      })
      .on("mouseout", function () {
        d3.select(this).attr("opacity", d3.select(this).attr("old-opacity"));
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        if (d.children) {
          updateChart(d);
          resetZoom();
        }
      });

    const labelNodes = tree.descendants().filter((d) => d.parent === tree);

    const labelGroups = gContent
      .append("g")
      .attr("pointer-events", "none")
      .attr("text-anchor", "middle")
      .selectAll("g")
      .data(labelNodes, (d) => nodePathKey(d))
      .join("g")
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`);

    labelGroups.each(function (d) {
      const labelGroup = d3.select(this);
      const occurrence = isOccurrenceNode(d);

      if (occurrence) {
        const iconSize = occurrenceIconSize(d);
        const scale = iconSize / 960;
        labelGroup.append("path")
          .attr("d", occurrenceTagIconPath)
          .style("fill", "black")
          .style("stroke", "#000000")
          .attr("stroke-width", 2)
          .attr("transform", `translate(0, ${d.r * 0.15}) scale(${scale}) translate(-480, -480)`);
      }

      const textNode = labelGroup
        .append("text")
        .attr("fill", inferColor(d, "label"))
        .attr("opacity", labelOpacity)
        // Pushes the text to the top for parent nodes to prevent overlap
        .attr("dominant-baseline", d.children ? "hanging" : "middle")
        .attr("y", d.children ? -d.r + 12 : (occurrence ? occurrenceIconSize(d) * 0.4 : 0))
        .style("font-family", fontFamily)
        .style("text-anchor", "middle");

      // 1. Append the main name
      textNode
        .append("tspan")
        .attr("x", 0)
        .text(d.data.name)
        .style("font-size", adaptLabelFontSize(d))
        .style("font-weight", "bold");

      const baseFontSize = parseFloat(adaptLabelFontSize(d));

      // 2. Append ONLY the extracted stats below the name
      textNode
        .append("tspan")
        .attr("x", 0)
        .attr("dy", "2.2em")
        .text(getNodeStatsText(d))
        .style("font-size", (baseFontSize * 0.5) + "em")
        .style("font-weight", "normal");
    });

    gHeader.raise();
    gDownload.raise();

    nodeSelection.append("title").text(getFullTooltipText)
  }

  // 4b. DETERMINE STARTING ROOT
  // If the tree has only one child at the top level, skip the redundant root 
  // and make that single child the top-most level.
  let startingRoot = root;
  while (startingRoot.children && startingRoot.children.length === 1) {
    startingRoot = startingRoot.children[0];
  }

  // Initial render.
  updateChart(startingRoot);

  // ───────────────────────────────
  // 5. D3 ZOOM BEHAVIOR
  // ───────────────────────────────
  // Apply zoom behavior to the gContent group only, so that gHeader remains static.
  // Helper function to clamp a value between a minimum and maximum.
  // ───────────────────────────────
  // 5. D3 ZOOM BEHAVIOR
  // ───────────────────────────────
  // Apply zoom behavior to the gContent group only, so that gHeader remains static.
  const zoomBehavior = d3
    .zoom()
    .scaleExtent([0.5, 6])
    .on("zoom", (event) => {
      gContent.attr("transform", event.transform);
    });
  svg.call(zoomBehavior);

  function resetZoom() {
    svg.call(zoomBehavior.transform, d3.zoomIdentity);
  }

  return svg.node();
}

// Global cache for computed text radii.
const textRadiusCache = new Map();

// Helper: Split text into words, removing any extraneous empty strings.
function getWords(text) {
  const words = text.split(/\s+/g);
  if (words[words.length - 1] === "") words.pop();
  if (words[0] === "") words.shift();
  return words;
}

// Helper: Estimate the width of a string using a per-character width table.
function measureWidth(text) {
  // Character width estimates (in arbitrary units).
  const CHAR_W = {
    A: 7,
    a: 7,
    B: 8,
    b: 7,
    C: 8,
    c: 6,
    D: 9,
    d: 7,
    E: 7,
    e: 7,
    F: 7,
    f: 4,
    G: 9,
    g: 7,
    H: 9,
    h: 7,
    I: 3,
    i: 3,
    J: 5,
    j: 3,
    K: 8,
    k: 6,
    L: 7,
    l: 3,
    M: 11,
    m: 11,
    N: 9,
    n: 7,
    O: 9,
    o: 7,
    P: 8,
    p: 7,
    Q: 9,
    q: 7,
    R: 8,
    r: 4,
    S: 8,
    s: 6,
    T: 7,
    t: 4,
    U: 9,
    u: 7,
    V: 7,
    v: 6,
    W: 11,
    w: 9,
    X: 7,
    x: 6,
    Y: 7,
    y: 6,
    Z: 7,
    z: 5,
    ".": 2,
    ",": 2,
    ":": 2,
    ";": 2,
  };
  // Sum the character widths (using a fallback if a character is not defined).
  return (
    text.split("").reduce((w, char) => w + (CHAR_W[char] || CHAR_W.a), 0) * 0.8
  ); // Multiply by a scaling factor (adjust as needed)
}

// Default line height (in pixels or arbitrary units)
const defaultLineHeight = 12;

/**
 * Splits an array of words into lines such that the measured width of the line
 * stays below the targetWidth. This is a simple greedy algorithm.
 *
 * @param {Array<string>} words - An array of words.
 * @param {number} targetWidth - The available width for each line.
 * @returns {Array<Object>} An array of line objects, each with properties:
 *   - text: the concatenated text for that line
 *   - width: the estimated width (using measureWidth)
 */
function computeLines(words, targetWidth) {
  const lines = [];
  let line = null;
  let lineWidth0 = Infinity;
  for (let i = 0, n = words.length; i < n; i++) {
    const word = words[i];
    // Build new line text by appending the word.
    const lineText1 = (line ? line.text + " " : "") + word;
    const lineWidth1 = measureWidth(lineText1);
    // Use the average of the previous line width and the candidate new width for decision.
    if (line && (lineWidth0 + lineWidth1) / 2 < targetWidth) {
      line.text = lineText1;
      line.width = lineWidth0 = lineWidth1;
    } else {
      // Start a new line.
      lineWidth0 = measureWidth(word);
      line = { text: word, width: lineWidth0 };
      lines.push(line);
    }
  }
  return lines;
}

/**
 * Computes the effective "radius" required to enclose the given lines.
 * For each line, it computes dx as half its measured width and dy as its vertical
 * offset from the center; then it returns the maximum of sqrt(dx*dx+dy*dy) over all lines.
 *
 * @param {Array<Object>} lines - Array of line objects (with width and text).
 * @param {number} lineHeight - The line height.
 * @returns {number} The computed radius.
 */
function computeTextRadiusFromLines(lines, lineHeight) {
  let radius = 0;
  const n = lines.length;
  // For each line, assume the vertical offset from center is determined by its index.
  for (let i = 0; i < n; i++) {
    // Compute vertical offset: center the lines around the middle.
    const dy = (Math.abs(i - n / 2 + 0.5) + 0.5) * lineHeight;
    const dx = lines[i].width / 2;
    radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy));
  }
  return radius;
}

function computeTextRadius(text, targetWidth, options = {}) {
  const lineHeight = options.lineHeight || defaultLineHeight;
  const cacheKey = text + "_" + targetWidth + "_" + lineHeight;
  if (textRadiusCache.has(cacheKey)) {
    return textRadiusCache.get(cacheKey);
  }
  const words = getWords(text);
  const lines = computeLines(words, targetWidth);
  const radius = computeTextRadiusFromLines(lines, lineHeight);
  textRadiusCache.set(cacheKey, radius);
  return radius;
}


// ─── D3 data-transform helpers (owned by this module) ─────────────────────

function checklistDataForD3FromTaxa(taxa) {
  const occurrenceMetaIndex = Checklist.getOccurrenceMetaIndex();

  const root = {
    name: "root",
    data: {},
    taxon: null,
    taxonMetaIndex: -1,
    childrenByKey: {},
  };

  taxa.forEach(function (taxonRow) {
    const nonNullTaxa = (taxonRow.t || [])
      .map(function (taxon, index) {
        if (taxon === null || taxon === undefined) {
          return null;
        }
        return { taxon: taxon, index: index };
      })
      .filter(Boolean);

    if (nonNullTaxa.length === 0) {
      return;
    }

    const occurrenceEntry =
      occurrenceMetaIndex === -1 ? null : taxonRow.t?.[occurrenceMetaIndex];
    const isOccurrenceRow =
      occurrenceEntry !== null &&
      occurrenceEntry !== undefined &&
      occurrenceEntry.name?.trim() !== "";

    const ancestry = isOccurrenceRow
      ? nonNullTaxa.filter(function (item) {
        return item.index !== occurrenceMetaIndex;
      })
      : nonNullTaxa;

    let currentNode = root;
    ancestry.forEach(function (item) {
      currentNode = ensureCirclePackChild(
        currentNode,
        item.taxon.name,
        item.taxon,
        item.index
      );
    });

    if (isOccurrenceRow) {
      const occurrenceNode = ensureCirclePackChild(
        currentNode,
        "__occurrence__" + occurrenceEntry.name,
        occurrenceEntry,
        occurrenceMetaIndex,
        { displayName: occurrenceEntry.name }
      );
      occurrenceNode.data = taxonRow.d;
      occurrenceNode.taxon = occurrenceEntry;
      occurrenceNode.taxonMetaIndex = occurrenceMetaIndex;
      return;
    }

    const lastTaxon = nonNullTaxa[nonNullTaxa.length - 1];
    currentNode.data = taxonRow.d;
    currentNode.taxon = lastTaxon.taxon;
    currentNode.taxonMetaIndex = lastTaxon.index;
  });

  return finalizeCirclePackNode(root);
}

function ensureCirclePackChild(
  parentNode,
  key,
  taxon,
  taxonMetaIndex,
  extraProps = {}
) {
  if (!parentNode.childrenByKey[key]) {
    parentNode.childrenByKey[key] = {
      name: extraProps.displayName || key,
      data: {},
      taxon: taxon,
      taxonMetaIndex: taxonMetaIndex,
      childrenByKey: {},
      ...extraProps,
    };
  }
  return parentNode.childrenByKey[key];
}

function finalizeCirclePackNode(node) {
  const children = Object.values(node.childrenByKey || {}).map(
    finalizeCirclePackNode
  );

  const finalizedNode = {
    name: node.name,
    data: node.data,
    taxon: node.taxon,
    taxonMetaIndex: node.taxonMetaIndex,
  };

  if (children.length > 0) {
    finalizedNode.children = children;
  }

  return finalizedNode;
}

function assignLeavesCount(node, allMatchingData) {
  if (!node.children || node.children.length === 0) {
    let isMatch = allMatchingData.find(
      (taxon) =>
        taxon.t[taxon.t.length - 1].name == node.taxon.name &&
        taxon.t[taxon.t.length - 1].authority == node.taxon.authority
    );

    node.value = 1;
    node.totalLeafCount = 1;
    node.matchingLeafCount = isMatch ? 1 : 0;
    return {
      totalLeafCount: node.totalLeafCount,
      matchingLeafCount: node.matchingLeafCount,
    };
  }

  let leavesCount = {
    totalLeafCount: 0,
    matchingLeafCount: 0,
  };

  for (const child of node.children) {
    let assignedCount = assignLeavesCount(child, allMatchingData);
    leavesCount.totalLeafCount += assignedCount.totalLeafCount;
    leavesCount.matchingLeafCount += assignedCount.matchingLeafCount;
  }

  node.totalLeafCount = leavesCount.totalLeafCount;
  node.matchingLeafCount = leavesCount.matchingLeafCount;
  return leavesCount;
}

let cachedData = null;
let oldQueryKey = "";
let cachedDataDatasetRevision = -1;

function ensureCirclePackingCacheFresh(datasetRevision) {
  if (datasetRevision !== cachedDataDatasetRevision) {
    cachedData = null;
    oldQueryKey = "";
    cachedDataDatasetRevision = datasetRevision;
  }
}

// ─── Info box ─────────────────────────────────────────────────────────────

function renderBubblesInfoBox(isFilterEmpty, mapChartMode, matchingCount, totalCount) {
  let message;
  if (isFilterEmpty) {
    message = t("view_bubbles_no_filter_tip");
  } else {
    const key = mapChartMode === "occurrence"
      ? "view_bubbles_filter_info_occurrence"
      : "view_bubbles_filter_info_taxa";
    message = tf(key, [matchingCount, totalCount]);
  }
  return m(".bubbles-info-box", m.trust(message));
}

// ─── Color scale ──────────────────────────────────────────────────────────

function renderColorScale(isFilterEmpty) {
  if (isFilterEmpty) return null;

  // Sample colorFromRatio at N steps to build a perfectly accurate CSS gradient.
  // Step 0 uses the chart's noMatchColor to match the actual circle rendering.
  const noMatchColor = "#04040420";
  const steps = 12;
  const stops = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const pct = ((ratio / 1) * 100).toFixed(1);
    stops.push(`${colorFromRatio(ratio)} ${pct}%`);
  }
  const gradient = `linear-gradient(to right, ${stops.join(", ")})`;

  return m(".bubbles-color-scale", [
    m("span.bubbles-color-scale-label", t("view_bubbles_color_scale_no_match")),
    m(".bubbles-color-scale-gradient-nomatch", { style: { background: noMatchColor } }),
    m("span.bubbles-color-scale-label", t("view_bubbles_color_scale_1_match")),
    m(".bubbles-color-scale-gradient", { style: { background: gradient } }),
    m("span.bubbles-color-scale-label.right", t("view_bubbles_color_scale_full_match")),
  ]);
}

function circlePackingView(allTaxa, matchingTaxa, datasetRevision) {
  if (allTaxa.length === 0) {
    return m(".listed-taxa");
  }

  ensureCirclePackingCacheFresh(datasetRevision);

  const isFilterEmpty = Checklist.filter.isEmpty();
  const mapChartMode = Settings.analyticalIntent() === "#S" ? "occurrence" : "taxa";

  // Use the raw array lengths as leaf counts — these correspond 1-to-1 with
  // terminal nodes in the hierarchy (each taxa/occurrence row → one leaf).
  const totalCount = allTaxa.length;
  const matchingCount = matchingTaxa.length;

  return m(".hierarchy-bubbles-wrapper", [
    renderBubblesInfoBox(isFilterEmpty, mapChartMode, matchingCount, totalCount),
    renderColorScale(isFilterEmpty),
    m(D3ChartView, {
      id: "d3test",
      chart: circlePacking,
      options: () => {
        let shouldUpdate = false;
        const cacheKey = JSON.stringify({
          queryKey: Checklist.queryKey(),
          includeMatchChildren: Settings.checklistIncludeChildren(),
          includeOccurrencesInView: Settings.checklistShowOccurrences(),
          analyticalIntent: Settings.analyticalIntent(),
          circlePackingMaxLevels: Settings.circlePackingMaxLevels(),
        });

        if (cachedData == null || cacheKey != oldQueryKey) {
          oldQueryKey = cacheKey;
          cachedData = checklistDataForD3FromTaxa(allTaxa);
          assignLeavesCount(cachedData, matchingTaxa);
          shouldUpdate = true;
        }

        return {
          shouldUpdate: shouldUpdate,
          dataSource: cachedData,
          colorInterpolation: colorFromRatio,
          fontFamily: "Regular",
          occurrenceMetaIndex: Checklist.getOccurrenceMetaIndex(),
        };
      },
    })]);
}

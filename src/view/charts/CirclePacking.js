import * as d3 from "d3";

import { colorFromRatio } from "../../components/Utils.js";

export function circlePacking(options) {
  let data = options.dataSource;
  let maxDataLevelsDisplayed = options.maxDataLevelsDisplayed || 4;
  let colorInterpolation = options.colorInterpolation || 212;
  let noMatchColor = options.noMatchColor || "#04040420";
  let opacityStep = options.opacityStep || maxDataLevelsDisplayed / 40;
  let backgroundColor = options.backgroundColor || "white";
  let labelOpacity = options.labelOpacity || 0.75;
  let fontFamily = options.fontFamily || "sans-serif";
  let showDownloadButton = options.showDownloadButton === false ? false : true;

  let isFilterMode = data.matchingLeafCount != data.totalLeafCount;

  function downloadSVG() {
    var svgBlob = new Blob([svg.node().outerHTML], {
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

  // Create a header group outside of our zoomable content.

  const gHeader = svg.append("g").attr("class", "header");
  const headerLabel = gHeader
    .append("text")
    .attr("x", 5)
    .attr("y", 20)
    .attr("fill", "black")
    .style("font", "18px " + fontFamily)
    .style("font-weight", "bold")
    .text("");

  // Create a zoomable group that contains the actual chart content.
  const gContent = svg.append("g").attr("class", "content");

  // ───────────────────────────────
  // 4. updateChart: Rebuild Chart from New Focus
  // ───────────────────────────────
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
      .attr("fill", "transparent")
      .attr("pointer-events", "all");

    if (showDownloadButton) {
      const gDownloadButton = svg.append("g").attr("class", "download");

      // Append the download icon as a group inside gDownloadButton
      const downloadButton = gDownloadButton
        .append("g")
        .attr("transform", `translate(${width - 40}, ${10})`) // Position the icon in the top-right corner with some padding
        .attr("opacity", 1)
        .on("click", (event, d) => {
          console.log("Download");
          downloadSVG();
          event.stopPropagation();
        });

      // Add a rectangle behind the download button to capture clicks
      downloadButton
        .append("rect")
        .attr("x", -4) // Center the rectangle around the icon
        .attr("y", -6)
        .attr("width", 36) // Make the rectangle 32x32
        .attr("height", 36)
        .attr("fill", "white") // Keep the rectangle invisible
        .attr("opacity", 0.7)
        .attr("cursor", "pointer"); // Change cursor to pointer to indicate interactivity

      // Add the provided SVG path for the download icon
      downloadButton
        .append("path")
        .attr(
          "d",
          "M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"
        ) // Provided path data
        .style("fill", "black")
        .style("stroke", "transparent")
        .attr("transform", "translate(-5, 30) scale(0.04)"); // Scale and align path within the icon size // Scale and align path within the icon size
    }

    svg.on("click", () => {
      if (currentRoot && currentRoot.parent) {
        updateChart(currentRoot.parent);
        resetZoom();
      }
    });

    const nodes = getLevels(tree, maxDataLevelsDisplayed);

    const nodeSelection = gContent
      .append("g")
      .selectAll("circle")
      .data(nodes, (d) => d.data.name + "-" + d.depth)
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

    gContent
      .append("g")
      .attr("pointer-events", "none")
      .attr("text-anchor", "middle")
      .selectAll("text")
      .data(tree.descendants(), (d) => d.data.name + "-" + d.depth)
      .join("text")
      .filter((d) => d.parent === tree)
      .attr("fill", (d) => inferColor(d, "label"))
      .attr("opacity", labelOpacity)
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
      .attr("dominant-baseline", "middle")
      .text((d) => d.data.name)
      .style("font-family", fontFamily)
      .style("font-size", (d) => adaptLabelFontSize(d))
      .style("font-weight", "bold");

    nodeSelection.append("title").text(
      (d) =>
        `${d
          .ancestors()
          .map((d) => d.data.name)
          .reverse()
          .slice(1)
          .join(" ▹ ")}\n${
          isFilterMode
            ? (matchingRatio(d.data, 1) > 0 && matchingRatio(d.data, 1) < 1
                ? "< 1%"
                : matchingRatio(d.data, 1) + "%") +
              " | " +
              d.data.matchingLeafCount +
              " of " +
              d.data.totalLeafCount +
              " matching"
            : d.data.totalLeafCount
        }`
    );
  }

  // Initial render.
  updateChart(root);

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

export function computeTextRadius(text, targetWidth, options = {}) {
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

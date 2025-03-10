export function circlePacking(options, dataLevel) {
  let data = options.dataSource;

  function truncate(children, maxLevel, currentLevel) {
    if (currentLevel == undefined) {
      currentLevel = 0;
    }

    let onlyShowMatching = false;

    if (currentLevel == maxLevel) {
      return [];
    } else {
      return children
        .map((c) => {
          let nc = c;
          nc.children = truncate(c.children, maxLevel, currentLevel + 1);
          if (onlyShowMatching && nc.matchingLeafCount == 0) return null;
          return nc;
        })
        .filter((n) => n !== null);
    }
  }
  data.children = truncate(data.children, dataLevel);

  // Specify the chart’s dimensions.
  const width = 1000;
  const height = width;
  data;
  let matchingRatio = (data) =>
    data.matchingLeafCount == 0
      ? 0
      : data.matchingLeafCount / data.totalLeafCount;

  // Compute the layout.
  const pack = (data) =>
    d3.pack().size([width, height]).padding(3)(
      d3
        .hierarchy(data)
        .sum((d) => d.totalLeafCount)
        .sort((a, b) => b.totalLeafCount - a.totalLeafCount)
    );
  const root = pack(data);

  // Create the SVG container.
  const svg = d3
    .create("svg")
    .attr("viewBox", `-${width / 2} -${height / 2} ${width} ${height}`)
    .attr(
      "style",
      `width: 100%; height: auto; display: block; margin: 0 0; cursor: pointer;`
    );

  function inferColor(data) {
    let d = data.data;

    if (d.totalLeafCount == d.matchingLeafCount) {
      return "hsl(102deg 80% 40.5%)";
    } else if (d.matchingLeafCount == 0) {
      return "#678";
    } else {
      let ratio = matchingRatio(d);
      let max = 70;
      let min = 40;
      return "hsl(102deg " + (min + (max - min) * ratio) + "% 40.5%)";
    }
  }

  const descendants = root.descendants();
  descendants.push(root);

  function adaptLabelFontSize(d) {
    var xPadding, diameter, labelAvailableWidth, labelWidth;

    xPadding = 8;
    diameter = 2 * d.r;
    labelAvailableWidth = diameter - xPadding;

    //labelWidth = e.getComputedTextLength();
    labelWidth = d.data.name.length * 0.6;

    // There is enough space for the label so leave it as is.
    if (labelWidth < labelAvailableWidth) {
      return "1em";
    }

    let ratio = labelAvailableWidth / labelWidth;

    return (ratio < 0.6 ? 0.6 : ratio) + "em";
  }

  // Append the nodes.
  const node = svg
    .append("g")
    .selectAll("circle")
    .data(root.descendants().slice(1))
    .join("circle")
    .attr("fill", (d) => inferColor(d))
    .attr("opacity", (d) => d.depth * 0.08)
    .attr("pointer-events", (d) => (!d.children ? "none" : null))
    .attr("stroke-width", 0.5)
    .on("mouseenter", function () {
      d3.select(this).attr("old-opacity", d3.select(this).attr("opacity"));
      d3.select(this).attr("opacity", 0.05);
    })
    .on("mouseout", function () {
      d3.select(this).attr("opacity", d3.select(this).attr("old-opacity"));
    })
    .on("click", (event, d) => (zoom(event, d), event.stopPropagation()));

  // Append the text labels.
  const label = svg
    .append("g")
    .attr("pointer-events", "none")
    .attr("text-anchor", "middle")
    .selectAll("text")
    .data(root.descendants())
    .join("text")
    .style("display", (d) => (d.parent === root ? "inline" : "none"))
    .attr("fill", "white")
    .attr("opacity", 0.75)
    .text((d) => d.data.name)
    .style("font", (d) => adaptLabelFontSize(d) + " Regular");

  node.append("title").text(
    (d) =>
      `${d
        .ancestors()
        .map((d) => d.data.name)
        .reverse()
        .join(" - ")
        .substring(4)}\n${Math.round(matchingRatio(d.data) * 100, 0)}% (${
        d.data.matchingLeafCount
      } of ${d.data.totalLeafCount}) matching`
  );

  // Create the zoom behavior and zoom immediately in to the initial focus node.
  svg.on("click", (event) => zoom(event, root));
  let focus = root;
  let view;
  zoomTo([focus.x, focus.y, focus.r * 2]);

  function zoomTo(v) {
    const k = width / v[2];
    view = v;
    label.attr(
      "transform",
      (d) => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`
    );
    node.attr(
      "transform",
      (d) => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`
    );
    node.attr("r", (d) => d.r * k);
  }

  function zoom(event, d) {
    const focus0 = focus;

    focus = d;

    const transition = svg
      .transition()
      .duration(event.altKey ? 7500 : 750)
      .tween("zoom", (d) => {
        const i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2]);
        return (t) => zoomTo(i(t));
      });

    label
      .filter(function (d) {
        return d.parent === focus || this.style.display === "inline";
      })
      .transition(transition)
      .style("fill-opacity", (d) => (d.parent === focus ? 1 : 0))
      .on("start", function (d) {
        if (d.parent === focus) this.style.display = "inline";
      })
      .on("end", function (d) {
        if (d.parent !== focus) this.style.display = "none";
      });
  }

  return svg.node();
}

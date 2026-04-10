export function colorSVGMap(svgObjectElement, regionColors) {
  if (svgObjectElement === undefined || svgObjectElement === null) {
    return;
  }

  const doc = svgObjectElement.contentDocument;
  if (!doc) return;

  //cleanup
  if (svgObjectElement.hasAttribute("data-usedregions")) {
    const prev = svgObjectElement.getAttribute("data-usedregions");
    if (prev) {
      prev.split(" ").forEach(function (suffixlessRegionCode) {
        if (!suffixlessRegionCode) return;
        let regionElements = doc.getElementsByClassName(suffixlessRegionCode);

        for (let elIndex = 0; elIndex < regionElements.length; elIndex++) {
          const el = regionElements[elIndex];

          el.removeAttribute("fill");
          el.removeAttribute("style");
        }
      });
    }
    svgObjectElement.setAttribute("data-usedregions", "");
  }

  let regions = Object.keys(regionColors);

  if (regions.length > 0) {
    const usedRegionsList = [];

    regions.forEach(function (region) {
      let regionElements = doc.getElementsByClassName(region);

      if (regionElements.length > 0) {
        const fill = regionColors[region];
        const style = "fill: " + fill + "; opacity:1;";
        for (let elIndex = 0; elIndex < regionElements.length; elIndex++) {
          const el = regionElements[elIndex];

          el.setAttribute("fill", fill);
          el.setAttribute("style", style);
        }

        usedRegionsList.push(region);
      }
    });

    svgObjectElement.setAttribute("data-usedregions", usedRegionsList.join(" "));
  }
}
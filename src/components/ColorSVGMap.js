export function colorSVGMap(svgObjectElement, regionColors) {
  if (svgObjectElement === undefined || svgObjectElement === null) {
    return;
  }

  //cleanup
  if (svgObjectElement.hasAttribute("data-usedregions")) {
    svgObjectElement
      .getAttribute("data-usedregions")
      .split(" ")
      .forEach(function (suffixlessRegionCode) {
        let regionElements =
          svgObjectElement.contentDocument.getElementsByClassName(
            suffixlessRegionCode
          );

        if (regionElements.length > 0) {
          for (let elIndex = 0; elIndex < regionElements.length; elIndex++) {
            const el = regionElements[elIndex];

            el.removeAttribute("fill");
            el.removeAttribute("style");
          }
        }
      });
    svgObjectElement.setAttribute("data-usedregions", "");
  }

  let regions = Object.keys(regionColors);

  if (regions.length > 0) {
    let usedRegions = "";

    regions.forEach(function (region) {
      let regionElements =
        svgObjectElement.contentDocument.getElementsByClassName(region);

      if (regionElements.length > 0) {
        for (let elIndex = 0; elIndex < regionElements.length; elIndex++) {
          const el = regionElements[elIndex];

          el.setAttribute("fill", regionColors[region]);
          el.setAttribute(
            "style",
            "fill: " + regionColors[region] + "; opacity:1;"
          );

          usedRegions += region + " ";
        }
      }
    });

    svgObjectElement.setAttribute("data-usedregions", usedRegions);
  }
}
import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import Handlebars from "handlebars";
import { Checklist } from "../../model/Checklist";

export function TabExternalSearch(tabData, taxon, taxonName, taxonData, taxonAuthority) {
  if (tabData.length == 0) {
    return null;
  }

  return m(
    ".search-engines",
    tabData.map(function (engine) {
      if (engine.restrictToTaxon && engine.restrictToTaxon.length > 0) {
        let restricted = engine.restrictToTaxon
          .split(",")
          .map((i) => i.trim().toLowerCase())
          .filter((i) => i !== null && i !== "");

        if (!taxon.t.find((t) => t !== null && restricted.includes(t.name.toLowerCase()))) {
          return null; // If taxon to which this should be restricted is not found in the taxonomic branch, then don't show this engine
        }
      }

      let translatedURL = resolveTemplate(
        engine.url,
        "",
        taxonData,
        taxonName,
        taxonAuthority
      );

      return m(
        ".search-engine",
        {
          onclick: function () {
            window.open(translatedURL, "_blank");
          },
        },
        [
          m(
            "img.engine-icon[src=usercontent/online_search_icons/" +
            engine.icon +
            "]"
          ),
          m(".engine-title", engine.title),
        ]
      );
    })
  );
}

function resolveTemplate(template, currentValue, taxonData, taxonName, taxonAuthority) {
  var compiledTemplate = null;

  try {
    compiledTemplate = Handlebars.compile(template);
  } catch (ex) {
    console.log("Handlebars error", ex);
    return;
  }

  let data = Checklist.getDataObjectForHandlebars(
    currentValue,
    taxonData,
    taxonName,
    taxonAuthority
  );

  return compiledTemplate(data);
}
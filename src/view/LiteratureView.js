import m from "mithril";
import { marked } from "marked";


import { Checklist } from "../model/Checklist.js";

export let LiteratureView = {
  view: function (vnode) {
    let citeKey = m.route.param("citekey");

    let citeKeysToProcess = [];

    let text = ''

    if (citeKey && Checklist.getBibliographyKeys().includes(citeKey)) {
      citeKeysToProcess = [citeKey];
    } else {
      text += "<h2>" + t("literature") + "</h2>";
      citeKeysToProcess = Checklist.getBibliographyKeys();
    }

    const references = citeKeysToProcess.map((key) => {
      let formatted = Checklist.getBibFormatter().getFullReferenceApa(key);
      console.log("Formatted reference for key " + key + ": " + formatted);
      return formatted ? formatted : key;
    }
    ).sort((a, b) => a.localeCompare(b));

    text +=
      "<div class='biblio'>" +
      marked.parse(references.map((r) => "- " + r).join("\n")) +
      "</ul>";

    return m("div.literature-view", { 
      style: { padding: "1em" } 
    }, [
      m.trust(text)
    ]);
  }
};

import m from "mithril";
import { marked } from "marked";


import { _t } from "../model/I18n.js";
import { Checklist } from "../model/Checklist.js";

export let LiteratureView = {
  view: function (vnode) {
    let citeKey = m.route.param("citekey");

    let citeKeysToProcess = [];

    let text = ''

    if (citeKey && Checklist.getBibliographyKeys().includes(citeKey)) {
      citeKeysToProcess = [citeKey];
    } else {
      text += "<h2>" + _t("literature") + "</h2>";
      citeKeysToProcess = Checklist.getBibliographyKeys();
    }

    const references = citeKeysToProcess.map((key) =>
      Checklist.getBibFormatter().getFullReferenceApa(key)
    ).sort((a, b) => a.localeCompare(b));

    text +=
      "<div class='biblio'>" +
      marked.parse(references.map((r) => "- " + r).join("\n")) +
      "</ul>";

    return m(
      ".literature-view[style=background-color: white; color: black; padding: 1em; border-radius: 0.5em]",
      m.trust(text)
    );
  },
};

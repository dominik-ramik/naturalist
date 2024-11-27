import { _t } from "../model/I18n.js";
import { Checklist } from "../model/Checklist.js";

export let LiteratureView = {
  view: function (vnode) {
    let text = "<h2>" + _t("literature") + "</h2>";

    const details = Checklist.getBibRender()
      .citeKeys.map((key) => Checklist.getBibRender().getDetails(key))
      .sort((a, b) => {
        let comp = a.details.author.localeCompare(b.details.author);
        if (comp == 0) {
          comp = a.details.year.localeCompare(b.details.year);
        }
        return comp;
      });

    const references = details.map((r) => {
      let ref =
        r.details.author +
        " (" +
        r.details.year +
        "). " +
        r.details.title +
        (r.details.doi
          ? ' <a href="' +
            r.details.doi +
            '" target="_blank">' +
            r.details.doi +
            "</a>"
          : "");

      return (
        "<li style='text-indent: -2em; line-height: 150%; margin-left: 2em; margin-bottom: 0.5em'>" +
        ref +
        "</li>"
      );
    });

    text +=
      "<br/><br/><ul style='list-style: none; font-size: 90%;'>" +
      references.join("") +
      "</ul>";

    return m(".literature-view[style=background-color: white; color: black; padding: 1em; border-radius: 0.5em]", m.trust(text));
  },
};

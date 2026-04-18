import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

import { Checklist } from "../../../model/Checklist.js";
import { Settings } from "../../../model/Settings.js";
import { routeTo } from "../../../components/Utils.js";
import { applyHighlight, buildSearchRegex } from "../../../model/highlightUtils.js";

import "./ClickableTaxonNameView.css";

function getTaxonHighlightRegex() {
  const terms = [];

  Object.values(Checklist.filter?.taxa || {}).forEach(fd => {
    if (fd?.matchMode === "exclude" || !Array.isArray(fd?.selected)) return;
    terms.push(...fd.selected.map(String));
  });

  Object.values(Checklist.filter?.data || {}).forEach(fd => {
    if (fd?.type !== "taxon" || fd?.matchMode === "exclude" || !Array.isArray(fd?.selected)) return;
    terms.push(...fd.selected.map(String));
  });

  if (Checklist.filter?.text?.trim()) {
    terms.push(...Checklist.filter.text.split(Settings.SEARCH_OR_SEPARATOR));
  }

  return buildSearchRegex(terms);
}

/**
 * Variant config table — all presentation decisions for named variants live here.
 * Callers only need to pass variant="…"; no presentation logic leaks upward.
 * To add a new variant: add an entry below and a matching CSS block in
 * ClickableTaxonNameView.css — no other file needs to change.
 */
const VARIANT_CONFIG = {
  occurrence: {
    icon: "img/ui/checklist/tag-light.svg",
  },
  // future variants:
  // invasive: { icon: "img/ui/checklist/warning.svg" },
};

export let ClickableTaxonName = {
  view: function (vnode) {
    let nameTag = Checklist.shouldItalicizeTaxon(vnode.attrs.currentTaxonLevel)
      ? "i"
      : "span";
    let taxonTree = vnode.attrs.taxonTree;

    if (taxonTree.taxon.name?.trim() == "" && taxonTree.taxon.authority?.trim() == "") {
      return null;
    }

    const highlightRegex = getTaxonHighlightRegex();

    // Resolve variant — icon and CSS modifier class are derived here.
    const variant = vnode.attrs.variant || null;
    const variantConfig = variant ? (VARIANT_CONFIG[variant] ?? {}) : {};
    const iconSrc = variantConfig.icon ?? null;
    const variantClass = variant ? `.taxon-name-variant-${variant}` : "";

    return m(
      `span.copiable.clickable${variantClass}`,
      {
        onclick: function () {
          routeTo(
            "/details/" + taxonTree.taxon.name + "/" + Settings.currentDetailsTab()
          );
        },
      },
      [
        iconSrc
          ? m("img.taxon-name-icon", { src: iconSrc, "aria-hidden": "true" })
          : null,
        m(
          nameTag +
            ".taxon-name[style=font-size: " +
            vnode.attrs.fontSize +
            "%]",
          applyHighlight(taxonTree.taxon.name, highlightRegex)
        ),
        taxonTree.taxon.authority == ""
          ? null
          : m(
              "span.taxon-authority[style=font-size: " +
                vnode.attrs.fontSize +
                "%]",
              applyHighlight(" " + taxonTree.taxon.authority, highlightRegex)
            ),
      ]
    );
  },
};
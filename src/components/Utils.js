import * as d3 from "d3";
import m from "mithril";
import { marked } from "marked";
import DOMPurify from "dompurify";

import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { Toast } from "../view/AppLayoutView.js";
import { ianaLocaleSubtags } from "./IanaLocaleSubtags.js";
import { materialColors } from "./MaterialColors.js";

export const checklistURL = "./usercontent/data/checklist.json";
export const checklistFileName = "checklist.json";

export function processMarkdownWithBibliography(data, tailingSeparator = "", skipInterpolationToUserContentFolder = false) {
  //process bibliography
  try {
    data = Checklist.transformDatabaseShortcodes(data);

    data = Checklist.getBibFormatter().transformInTextCitations(
      data,
      (citeKey) => {
        return {
          prefix:
            '<a class="citation" data-citekey="' + citeKey.toLowerCase() + '">',
          suffix: "</a>",
        };
      }
    );
  } catch (ex) {
    console.log("Error matching citation in:", data, ex);
  }

  data = marked.parse(data);
  //in case markdown introduced some dirt, purify it again
  data = DOMPurify.sanitize(data, { ADD_ATTR: ["target"] });
  data = data.trim() + (tailingSeparator ? tailingSeparator : "");

  if (!skipInterpolationToUserContentFolder) {
    data = mdImagesClickableAndUsercontentRelative(data);
  }

  return data;
}

export function colorFromRatio(ratio) {
  return d3.interpolateLab("#ffe09d", "#cf3737")(ratio);
}

/**
 * Filters an array of nodes and returns only the terminal leaves.
 * A terminal leaf is an object whose path is not a prefix of any other node's path.
 * Additionally, duplicate terminal leaves (with identical paths) are removed.
 *
 * @param {Array} nodes - Array of objects that include a property "t" (an array of nodes).
 * @returns {Array} filtered array containing only unique terminal leaves.
 */
export function filterTerminalLeaves(nodes) {
  // First, filter out nodes that are non-terminal (i.e. that are prefixes of any other node's path)
  const terminalLeaves = nodes.filter((node) => {
    const nodePath = node.t;
    // Check if there is any other node for which node.t is a prefix of other.t.
    const isIntermediate = nodes.some((other) => {
      if (other === node) {
        return false;
      }
      return isPrefix(nodePath, other.t);
    });
    return !isIntermediate;
  });

  // Remove duplicate terminal leaves.
  // We'll compute a signature for each node's path in the form "A x->B y->..." .
  const seenPaths = new Set();
  const uniqueTerminals = [];
  terminalLeaves.forEach((node) => {
    const pathSignature = node.t.map((n) => `${n?.name || ""} ${n?.authority || ""}`).join("->");
    if (!seenPaths.has(pathSignature)) {
      seenPaths.add(pathSignature);
      uniqueTerminals.push(node);
    }
  });
  return uniqueTerminals;

  /**
   * Returns true if the smallPath is a prefix of bigPath.
   * Each node is compared by concatenating `n` and `a` with a space.
   */
  function isPrefix(smallPath, bigPath) {
    if (smallPath.length >= bigPath.length) {
      return false;
    }
    for (let i = 0; i < smallPath.length; i++) {
      const smallNode = `${(smallPath[i]?.name || "")} ${(smallPath[i]?.authority || "")}`;
      const bigNode = `${(bigPath[i]?.name || "")} ${(bigPath[i]?.authority || "")}`;
      if (smallNode !== bigNode) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Mode-aware variant of filterTerminalLeaves for use in chart views.
 *
 * In "taxa" mode: returns the structurally lowest non-specimen leaves.
 * Specimen-level rows are stripped before the terminal-leaf calculation,
 * so a species with specimens is still treated as a leaf.
 *
 * In "specimen" mode: returns only rows that are actual specimens
 * (i.e. t[specimenMetaIndex] is non-null). Taxa without any specimens
 * are excluded entirely — this is intentional and should be communicated
 * in the UI.
 *
 * @param {Array} nodes - The flat filtered taxa array from the filter engine.
 * @param {string} mode - "taxa" or "specimen"
 * @param {number} specimenMetaIndex - Index of the specimen level in t[].
 *   Pass -1 or undefined if no specimen level exists.
 * @returns {Array} Terminal leaves appropriate for the current mode.
 */
export function filterTerminalLeavesForMode(nodes, mode, specimenMetaIndex) {
  const hasSpecimenLevel =
    specimenMetaIndex !== undefined && specimenMetaIndex !== -1;

  if (!hasSpecimenLevel || mode === "taxa") {
    // Strip specimen rows before computing terminal leaves so that
    // a species with attached specimens is still treated as a leaf.
    const nonSpecimenNodes = hasSpecimenLevel
      ? nodes.filter(
        (n) =>
          n.t[specimenMetaIndex] === null ||
          n.t[specimenMetaIndex] === undefined
      )
      : nodes;
    return filterTerminalLeaves(nonSpecimenNodes);
  }

  // Specimen mode: return only rows that actually are specimens.
  return nodes.filter(
    (n) =>
      n.t[specimenMetaIndex] !== null &&
      n.t[specimenMetaIndex] !== undefined &&
      n.t[specimenMetaIndex].name?.trim() !== ""
  );
}

let sortByCustomOrderCache = new Map();
export function clearSortByCustomOrderCache() {
  sortByCustomOrderCache = new Map();
}

export function sortByCustomOrder(array, type, dataPath) {
  if (array.length == 0) {
    return array;
  }

  let key = JSON.stringify(array) + "|" + type + "|" + dataPath;

  if (!sortByCustomOrderCache.has(key)) {
    let result = array.sort();

    let guideArray = [];
    if (type == "taxa") {
      guideArray = Checklist.getTaxaMeta()[dataPath]?.searchCategoryOrder.map(
        (c) => c.title.toLowerCase()
      );
    } else if (type == "data") {
      guideArray = Checklist.getMetaForDataPath(
        dataPath
      )?.searchCategoryOrder.map((c) => c.title.toLowerCase());
    }

    if (guideArray?.length > 0) {
      result = result.sort(function (a, b) {
        if (guideArray.indexOf(a.toLowerCase()) < 0) {
          return 1;
        }
        if (guideArray.indexOf(b.toLowerCase()) < 0) {
          return -1;
        }
        return (
          guideArray.indexOf(a.toLowerCase()) -
          guideArray.indexOf(b.toLowerCase())
        );
      });
    }
    sortByCustomOrderCache.set(key, result);
  }

  return sortByCustomOrderCache.get(key);
}

export function shouldHide(dataPath, hideExpression, filterData, purpose) {
  if (hideExpression === "yes") {
    return true;
  }

  if (hideExpression === "data") {
    return purpose === "filter" ? false : true;
  }

  if (hideExpression === "no") {
    return false;
  }

  let split = splitN(hideExpression, " ", 3);

  if (split === undefined || split.length == 0) {
    return false;
  }

  let ifunless = split[0];
  let filterSelectedValues = filterData[split[1]].selected;
  let operator = split[2];
  let values = split.length > 3 ? JSON.parse("[" + split[3] + "]") : [];

  let result = false;

  switch (operator) {
    case "isset":
      result = filterSelectedValues.length > 0;
      break;
    case "notset":
      result = filterSelectedValues.length == 0;
      break;
    case "notsetor":
      result =
        filterSelectedValues.length == 0 ||
        values.some((value) => filterSelectedValues.includes(value));
      break;
    case "is":
      result = values.some((value) => filterSelectedValues.includes(value));
      break;
    default:
      console.log("Unknown operator in Hidden", operator);
      break;
  }

  if (ifunless === "unless") {
    result = !result;
  }

  return result;
}

export function mdImagesClickableAndUsercontentRelative(markdown) {
  return markdown.replace(/<img[^>]+src="([^">]+)"[^>]*>/gi, (match, src) => {
    const getAlt = /alt=["']([^"']*)["']/gi;
    const alt = getAlt.exec(match);
    const altText = alt ? alt[1] : null;

    return match
      .replace(
        match,
        '<span class="image-wrap fullscreenable-image" title="' +
        altText +
        '" onClick="this.classList.toggle(\'fullscreen\')">' +
        match +
        "</span>"
      )
      .replace(src, relativeToUsercontent(src));
  });
}

export function splitN(str, delimiter, n) {
  if (typeof str.split !== "function") {
    return [];
  }
  const parts = str.split(delimiter);
  const result = [];

  for (let i = 0; i < n && parts.length > 0; i++) {
    result.push(parts.shift());
  }

  if (parts.length > 0) {
    result.push(parts.join(delimiter));
  }

  return result;
}

export function relativeToUsercontent(url) {
  //Add an initial period to relative URLs
  if (url.length > 1 && url[0] == "/" && url[1] != "/") {
    url = "." + url;
  }

  //Don't change absolute URLs
  if (url.indexOf("://") >= 0) {
    return url;
  }

  let processed = new URL(
    url,
    window.location.origin + window.location.pathname + "usercontent/"
  ).href;

  processed = "." + processed.substring(window.location.origin.length);

  //console.log(processed);

  return processed;
}

export function getDecimalSeparator(locale) {
  const numberWithDecimalSeparator = 1.1;
  return numberWithDecimalSeparator.toLocaleString(locale).substring(1, 2);
}

export function roundWithPrecision(number, precision) {
  let modificatior = Math.pow(10, precision);
  return Math.round((number + Number.EPSILON) * modificatior) / modificatior;
}

let _localeCache = null;
export function getCurrentLocaleBestGuess() {
  //subtags in IANA registry: https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry

  if (_localeCache === null) {
    let knownSubtags = Object.keys(ianaLocaleSubtags);
    let currentLang = Checklist.getCurrentLanguage().toLowerCase();

    let foundLocale = "en";

    if (knownSubtags.indexOf(currentLang) >= 0) {
      foundLocale = currentLang;
    } else {
      let found = false;
      Checklist.getAllLanguages().forEach(function (lang) {
        if (lang.code.toLowerCase() == currentLang) {
          if (knownSubtags.indexOf(lang.fallbackUiLang) >= 0) {
            foundLocale = lang.fallbackUiLang;
            found = true;
          }
        }
        if (!found) {
          if (
            knownSubtags.indexOf(
              Checklist.getDefaultLanguage().toLowerCase()
            ) >= 0
          ) {
            foundLocale = Checklist.getDefaultLanguage().toLowerCase();
          }
        }
      });
    }
    _localeCache = foundLocale;
  }

  return _localeCache;
}

export function routeTo(destination, query, language, replace = false) {
  //console.log("Routing to: " + destination);
  let lang = language;
  if (lang === undefined || lang === null) {
    let routeLang = m.route.param("l");
    if (routeLang === undefined || routeLang === null) {
      if (Checklist._isDataReady) {
        lang = Checklist.getDefaultLanguage();
      } else {
        lang = "en";
      }
    } else {
      lang = routeLang;
    }
  }

  m.route.set(destination, {
    l: lang,
    q: query ? query : Checklist.queryKey(),
    v: Settings.viewType(),
    s: Settings.analyticalIntent().replace("#", ""),
  }, replace ? { replace: true } : undefined);
}

export function updateRouteParams() {
  const path = m.route.get().split("?")[0];
  routeTo(path, null, null, true);
}

export function isArrayOfEmptyStrings(arr) {
  let someCellsFilled = arr.find(function (cell) {
    return cell.length > 0;
  });
  return !someCellsFilled;
}

export function isNumeric(str) {
  if (typeof str != "string") {
    str = str.toString();
  }
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}

export function copyToClipboard(textToCopy, messageToShow) {
  navigator.clipboard.writeText(textToCopy);
  Toast.show(
    (!messageToShow || messageToShow.length === 0
      ? "C"
      : messageToShow + " c") + "opied to clipboard"
  );
}

export function pad(n, width, z) {
  z = z || "0";
  n = n + "";
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

export function indexOfCaseInsensitive(haystack, needle) {
  let index = -1;
  needle = needle.toLowerCase();

  for (let i = 0; i < haystack.length; i++) {
    const element = haystack[i];
    if (element.toLowerCase() == needle) {
      index = i;
      break;
    }
  }

  return index;
}

/**
 * Extract the unit string from a {{unit ...}} Handlebars template.
 * Handles all syntax variants:
 *   {{unit "m"}}                  — implicit
 *   {{unit myField "m"}}          — explicit
 *   {{unit "kg" "exact"}}         — implicit, exact mode
 *   {{unit myField "kg" "exact"}} — explicit, exact mode
 * Returns null if the template doesn't use the unit helper.
 */
export function getUnitFromTemplate(meta) {
  if (!meta?.template) return null;
  const blockMatch = meta.template.match(/\{\{\s*unit\b(.*?)\}\}/);
  if (!blockMatch) return null;

  // Find all quoted strings inside the {{unit ...}} block
  const quoted = [...blockMatch[1].matchAll(/["']([^"']+)["']/g)];

  // The unit is the first quoted string that isn't "exact"
  for (const m of quoted) {
    if (m[1] !== "exact") return m[1];
  }
  return null;
}

/**
 * Convert a unit string to HTML, turning superscript notation into <sup> tags.
 * Handles both Unicode superscript chars (², ³ …) and caret notation (^2, ^3 …).
 */
export function unitToHtml(unit) {
   return unit.replace(/2$/, "<sup>2</sup>").replace(/3$/, "<sup>3</sup>");
}

export function isValidHttpUrl(string) {
  let url;
  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

export function formatList(list, finalJoiner, preItem, postItem) {
  if (!finalJoiner) {
    finalJoiner = t("and_list_joiner");
  }

  list = list.map(function (item) {
    return (preItem ? preItem : "") + item + (postItem ? postItem : "");
  });

  const last = list.pop();

  return list.length === 0
    ? last
    : [list.join(", "), last].join(" " + finalJoiner + " ");
}

export function textLowerCaseAccentless(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function filterMatches(data) {
  if (
    Checklist.filter.text.trim() != "" &&
    typeof data === "string" &&
    data.toLowerCase().includes(Checklist.filter.text.toLowerCase())
  ) {
    return true;
  }

  return false;
}

export function getGradedColor(type, context) {
  let lightness = "700";

  switch (context) {
    case "filter":
      lightness = "200";
      break;
    case "crumb":
      lightness = "700";
      break;
  }

  if (type == "taxa") {
    return materialColors["lightGreen"][lightness];
  }
  if (type == "data") {
    return materialColors["lightGreen"][lightness];
  }
  if (type == "text") {
    return materialColors["blue"][lightness];
  }

  return "#000000";
}

export function getIndexedColor(index) {
  const huesCount = usableHues.length;
  const brightnessCount = usableBrightness.length;

  // Calculate brightness index and hue index
  const brightnessIndex = Math.floor(index / huesCount) % brightnessCount;
  const hueIndex = index % huesCount;

  // Return the object with hue and brightness
  let hue = usableHues[hueIndex];
  let brightness = usableBrightness[brightnessIndex];

  return materialColors[hue][brightness];
}

let usableBrightness = [500, 300, 900, 800, 700, 600];

let usableHues = [
  "red",
  "pink",
  "purple",
  "deepPurple",
  "indigo",
  "blue",
  "lightBlue",
  "cyan",
  "teal",
  "green",
  "lightGreen",
  "lime",
  "yellow",
  "amber",
  "orange",
  "deepOrange",
  "brown",
  "blueGrey",
];

/**
 * Converts an HTML string to plain text, preserving line breaks for block elements.
 * Highly efficient, uses DOM parsing and innerText.
 * @param {string} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
  if (!html || typeof html !== "string") return "";
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  // Replace <br> with newlines
  tempDiv.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  // Add newlines after block elements
  tempDiv
    .querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre")
    .forEach((el) => {
      el.insertAdjacentText("afterend", "\n");
    });
  let text = tempDiv.innerText || tempDiv.textContent || "";
  // Normalize whitespace and newlines
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}


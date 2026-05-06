import * as d3 from "d3";
import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { marked } from "marked";
import DOMPurify from "dompurify";

import { Checklist } from "../model/Checklist.js";
import { Settings } from "../model/Settings.js";
import { Toast } from "../view/AppLayoutView.js";
import { materialColors } from "./MaterialColors.js";
import { highlightHtml } from "../model/highlightUtils.js";
import { AVAILABLE_LOCALES } from "../i18n/index.js";
import { DEFAULT_LOCALE_CODE } from "../i18n/availableLocalesInfo.js";

registerMessages(selfKey, {
  en: {
    and_list_joiner: "and",
  },
  fr: {
    and_list_joiner: "et",
  }
});

export const checklistURL = "./usercontent/data/checklist.json";
export const checklistFileName = "checklist.json";

// Evaluated once at module load — location never changes without a full reload.
export const isInDemoMode = (() => {
  const { hostname, pathname } = window.location;
  const isKnownHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^localhost(:\d+)?$/.test(hostname) ||
    hostname === 'naturalist.netlify.app';
  const isInDemoPath = /\/demo(\/|$)/.test(pathname);
  return isKnownHost && isInDemoPath;
})();

export function injectCiteKeyLinks(el) {
  if (!el) return;

  const links = el.querySelectorAll("a[data-citekey]:not([data-bound])");
  links.forEach((e) => {
    e.setAttribute("data-bound", "1");
    e.onclick = () => {
      routeTo("references/" + e.getAttribute("data-citekey"));
    };
  });
}

// Resolve any CSS color string (named, hex, etc.) to a #rrggbb hex string.
// Uses the browser's own color parser - zero-dependency, handles all valid CSS colors.
const colorCache = new Map();
export function resolveToHex(color) {
  if (colorCache.has(color)) {
    return colorCache.get(color);
  }

  if (!color) {
    colorCache.set(color, '#000000');
    return '#000000';
  }
  // Already a 6-digit hex
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    colorCache.set(color, color);
    return color;
  }
  // 3-digit hex
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const [, r, g, b] = color.match(/^#(.)(.)(.)$/);
    colorCache.set(color, '#' + r + r + g + g + b + b);
    return colorCache.get(color);
  }
  // Named color or any other CSS value — ask the browser
  const el = document.createElement('canvas');
  const ctx = el.getContext('2d');
  ctx.fillStyle = color;
  const resolved = ctx.fillStyle; // browser normalises to #rrggbb or rgba(...)
  if (/^#[0-9a-fA-F]{6}$/.test(resolved)) {
    colorCache.set(color, resolved);
    return resolved;
  }
  // Handle rgba(r, g, b, a) fallback
  const m = resolved.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    colorCache.set(color, '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join(''));
    return colorCache.get(color);
  }
  return '#000000';
}

const markdownCache = new Map();
export function processMarkdownWithBibliography(data, tailingSeparator = "", skipInterpolationToUserContentFolder = false, highlightRegex = null) {
  //process bibliography
  const key = data + "|" + tailingSeparator + "|" + skipInterpolationToUserContentFolder + "|" + highlightRegex;
  if (markdownCache.has(key)) {
    return markdownCache.get(key);
  }

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

  if (highlightRegex) {
    data = highlightHtml(data, highlightRegex);
  }

  markdownCache.set(key, data);

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
 * In "taxa" mode: returns the structurally lowest non-occurrence leaves.
 * Occurrence-level rows are stripped before the terminal-leaf calculation,
 * so a species with occurrences is still treated as a leaf.
 *
 * In "occurrence" mode: returns only rows that are actual occurrences
 * (i.e. t[occurrenceMetaIndex] is non-null). Taxa without any occurrences
 * are excluded entirely - this is intentional and should be communicated
 * in the UI.
 *
 * @param {Array} nodes - The flat filtered taxa array from the filter engine.
 * @param {string} mode - "taxa" or "occurrence"
 * @param {number} occurrenceMetaIndex - Index of the occurrence level in t[].
 *   Pass -1 or undefined if no occurrence level exists.
 * @returns {Array} Terminal leaves appropriate for the current mode.
 */
export function filterTerminalLeavesForMode(nodes, mode, occurrenceMetaIndex) {
  const hasOccurrenceLevel =
    occurrenceMetaIndex !== undefined && occurrenceMetaIndex !== -1;

  if (!hasOccurrenceLevel || mode === "taxa") {
    // Strip occurrence rows before computing terminal leaves so that
    // a species with attached occurrences is still treated as a leaf.
    const nonOccurrenceNodes = hasOccurrenceLevel
      ? nodes.filter(
        (n) =>
          n.t[occurrenceMetaIndex] === null ||
          n.t[occurrenceMetaIndex] === undefined
      )
      : nodes;
    return filterTerminalLeaves(nonOccurrenceNodes);
  }

  // Occurrence mode: return only rows that actually are occurrences.
  return nodes.filter(
    (n) =>
      n.t[occurrenceMetaIndex] !== null &&
      n.t[occurrenceMetaIndex] !== undefined &&
      n.t[occurrenceMetaIndex].name?.trim() !== ""
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
    const altText = alt ? alt[1] : "";

    const resolvedSrc = relativeToUsercontent(src);

    // Rewrite the <img> src to the resolved URL and add data-* attributes so
    // FullscreenManager can perform the thumb→full swap.  In the markdown
    // pipeline there is only ever one resolution (full = thumb), so both
    // data-thumbsrc and data-fullsrc point to the same URL.
    const rewrittenImg = match
      .replace(src, resolvedSrc)
      .replace(/<img/, `<img class="image-in-view" data-thumbsrc="${resolvedSrc}" data-fullsrc="${resolvedSrc}"`);

    // No onClick here — FullscreenManager's document-level capture listener
    // handles all .fullscreenable-image clicks, including those in m.trust() HTML.
    return (
      '<span class="image-wrap fullscreenable-image clickable" title="' +
      altText +
      '">' +
      rewrittenImg +
      '</span>'
    );
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

export function absoluteUsercontent(url) {
  if (!url) return url;
  // Already absolute - leave unchanged
  if (url.indexOf("://") >= 0) return url;
  return new URL(url, window.location.href).href;
}

export function relativeToUsercontent(url) {
  if (url.indexOf("://") >= 0) {
    return url;
  }

  // Normalize to a plain string without leading ./ or / so we can
  // inspect the path segments uniformly.
  let normalized = url;
  // Strip leading ./  →  "usercontent/foo"
  // Strip leading /   →  "usercontent/foo"  (but not protocol-relative //)
  normalized = normalized.replace(/^\.\//, "");
  if (normalized.length > 1 && normalized[0] === "/" && normalized[1] !== "/") {
    normalized = normalized.substring(1);
  }

  // If the path already starts with "usercontent/" (case-sensitive, matching
  // how the folder is named on disk), strip it so the URL resolution below
  // does not produce a doubled segment.
  if (normalized.toLowerCase().startsWith("usercontent/")) {
    normalized = normalized.substring("usercontent/".length);
  }

  let processed = new URL(
    normalized,
    window.location.origin + window.location.pathname + "usercontent/"
  ).href;

  // Strip origin AND the directory portion of the pathname (i.e. everything up to the last '/')
  const base = window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/") + 1);
  processed = "." + processed.substring(base.length - 1); // -1 to keep the leading '/'

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
let _localeCacheKey = null;
function isValidLocale(tag) {
  try {
    "a".localeCompare("b", tag);
    return true;
  } catch (e) {
    return false;
  }

}

export function getCurrentLocaleBestGuess() {
  const currentLang = Checklist.getCurrentLanguage().toLowerCase();
  if (_localeCache === null || _localeCacheKey !== currentLang) {
    _localeCacheKey = currentLang;

    let foundLocale = DEFAULT_LOCALE_CODE; // Fallback to default if no match found

    if (AVAILABLE_LOCALES.includes(currentLang) && isValidLocale(currentLang)) {
      foundLocale = currentLang;
    } else {
      let found = false;
      Checklist.getAllLanguages().forEach(function (lang) {
        if (lang.code.toLowerCase() === currentLang) {
          const fallbackUiLang = lang.fallbackUiLang?.toLowerCase();
          if (AVAILABLE_LOCALES.includes(fallbackUiLang) && isValidLocale(fallbackUiLang)) {
            foundLocale = fallbackUiLang;
            found = true;
          }
        }
        const defaultLanguage = Checklist.getDefaultLanguage().toLowerCase();
        if (!found && AVAILABLE_LOCALES.includes(defaultLanguage) && isValidLocale(defaultLanguage)) {
          foundLocale = defaultLanguage;
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
      lang = Settings.language();
      if (!lang) {
        lang = Checklist._isDataReady ? Checklist.getDefaultLanguage() : DEFAULT_LOCALE_CODE;
      }
    } else {
      lang = routeLang;
    }
  }

  m.route.set(destination, {
    l: lang,
    q: (query ? query : Checklist.queryKey()).replaceAll("#", "%23"),
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
 *   {{unit "m"}}                  - implicit
 *   {{"unit" "m"}}                - implicit, quoted helper name (JSON-escaped templates)
 *   {{unit myField "m"}}          - explicit
 *   {{unit "kg" "exact"}}         - implicit, exact mode
 *   {{unit myField "kg" "exact"}} - explicit, exact mode
 * Returns null if the template doesn't use the unit helper.
 */
export function getUnitFromTemplate(meta) {
  if (!meta?.template) return null;
  const blockMatch = meta.template.match(/\{\{\s*(?:"unit"|unit\b)(.*?)\}\}/);
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
  if (typeof data !== "string" || !data) return false;

  // Check full-text search
  const rawText = Checklist.filter?.text;
  if (rawText && rawText.trim() !== "") {
    const terms = rawText
      .split(Settings.SEARCH_OR_SEPARATOR)
      .map(t => t.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
      .filter(Boolean);
    if (terms.length > 0) {
      const regex = new RegExp("(" + terms.map(t => "\\b" + t).join("|") + ")", "i");
      const normalised = data.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (regex.test(normalised)) return true;
    }
  }

  // Check taxa filter selections - highlight the taxon name when it is
  // directly selected in any active taxa filter (e.g. genus "Ficus" selected).
  const taxaFilter = Checklist.filter?.taxa;
  if (taxaFilter) {
    for (const key of Object.keys(taxaFilter)) {
      const fd = taxaFilter[key];
      if (fd?.selected?.length > 0 && fd.matchMode !== "exclude") {
        if (fd.selected.includes(data)) return true;
      }
    }
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
 * @param {string} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
  if (!html || typeof html !== "string") return "";
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ret = doc.body.textContent || "";

  return ret;
}

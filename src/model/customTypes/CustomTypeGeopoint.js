import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { Logger } from "../../components/Logger.js";
import { helpers } from "./helpers.js";
import { applyHighlight } from "../HighlightUtils.js";

const GOOGLE_MAPS_FALLBACK = "https://www.google.com/maps?q={{lat}},{{long}}";

// ---------------------------------------------------------------------------
// Pure parsing utilities
// ---------------------------------------------------------------------------

const stripExcelPrefix = (s) => s.replace(/^'/, "");

/** South and West are negative; all other hemispheres are positive. */
const applyHemisphere = (val, hemi) =>
  hemi === "S" || hemi === "W" ? -Math.abs(val) : Math.abs(val);

/** Scan headers for the first name that exists; return its index or -1. */
function findColIdx(headers, ...candidates) {
  for (const name of candidates) {
    const idx = headers.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parse a single coordinate token (lat or long in isolation) into a signed
 * decimal float.  Handles DD, DDM, DMS with optional N/S/E/W markers.
 * Accepts French decimal commas.  Returns null on failure.
 *
 * Recognised degree symbols : °  º
 * Recognised minute markers : '  '  ′  `
 * Recognised second markers : "  ″  "  "  (optional / may be absent)
 */
function parseOneCoord(raw) {
  if (!raw) return null;
  let s = stripExcelPrefix(raw.trim());
  if (!s) return null;

  // --- Extract hemisphere marker (prefix or suffix) ---
  let hemi = null;
  const prefixHemi = s.match(/^([NSEWnsew])\s*/);
  if (prefixHemi) {
    hemi = prefixHemi[1].toUpperCase();
    s = s.slice(prefixHemi[0].length).trim();
  } else {
    const suffixHemi = s.match(/\s*([NSEWnsew])$/i);
    if (suffixHemi) {
      hemi = suffixHemi[1].toUpperCase();
      s = s.slice(0, -suffixHemi[0].length).trim();
    }
  }

  // Normalise French decimal comma (only between digits, never a separator here)
  s = s.replace(/(\d),(\d)/g, "$1.$2");

  // --- DMS: D°M'S" ---
  // Three numeric groups; seconds marker is optional (some notations omit it).
  const dmsM = s.match(
    /^(\d+(?:\.\d+)?)\s*[°º]\s*(\d+(?:\.\d+)?)\s*[''′`]\s*(\d+(?:\.\d+)?)\s*["″""''`]*$/
  );
  if (dmsM)
    return applyHemisphere(+dmsM[1] + +dmsM[2] / 60 + +dmsM[3] / 3600, hemi);

  // --- DDM: D°M.M' ---
  // Two numeric groups; minute marker is optional.
  const ddmM = s.match(
    /^(\d+(?:\.\d+)?)\s*[°º]\s*(\d+(?:\.\d+)?)\s*[''′`]?$/
  );
  if (ddmM) return applyHemisphere(+ddmM[1] + +ddmM[2] / 60, hemi);

  // --- DD: plain decimal (possibly signed) with optional degree symbol ---
  const ddM = s.match(/^([+-]?\d+(?:\.\d+)?)\s*[°º]?$/);
  if (ddM) {
    const v = parseFloat(ddM[1]);
    if (isNaN(v)) return null;
    return hemi ? applyHemisphere(Math.abs(v), hemi) : v;
  }

  return null;
}

/**
 * Decode one ±field of an ISO 6709 string into a signed decimal float.
 *
 * @param {string} s       - The field including its leading sign, e.g. "+4851.396"
 * @param {number} intDeg  - Expected integer-degree field width: 2 for lat, 3 for lon.
 */
function parseISO6709Part(s, intDeg) {
  if (!s || (s[0] !== "+" && s[0] !== "-")) return null;
  const sign = s[0] === "-" ? -1 : 1;
  // Normalise French decimal comma
  const abs = s.slice(1).replace(/(\d),(\d)/g, "$1.$2");
  if (!abs) return null;

  const dotIdx = abs.indexOf(".");
  const intStr = dotIdx >= 0 ? abs.slice(0, dotIdx) : abs;
  const intLen = intStr.length;

  if (dotIdx >= 0) {
    // Decimal variants
    if (intLen <= intDeg) {
      const v = parseFloat(abs);
      if (isNaN(v)) {
        Logger.error(`Invalid ISO6709 numeric part "${s}"`, "Invalid geopoint");
        return null;
      }
      return sign * v;                                                                                                     // ±DD.D
    }
    if (intLen === intDeg + 2) {
      const deg = parseInt(abs.slice(0, intDeg));
      const minute = parseFloat(abs.slice(intDeg));
      if (isNaN(deg) || isNaN(minute)) {
        Logger.error(`Invalid ISO6709 numeric part "${s}"`, "Invalid geopoint");
        return null;
      }
      return sign * (deg + minute / 60);                  // ±DDMM.M
    }
    if (intLen === intDeg + 4) {
      const deg = parseInt(abs.slice(0, intDeg));
      const min = parseInt(abs.slice(intDeg, intDeg + 2));
      const sec = parseFloat(abs.slice(intDeg + 2));
      if (isNaN(deg) || isNaN(min) || isNaN(sec)) {
        Logger.error(`Invalid ISO6709 numeric part "${s}"`, "Invalid geopoint");
        return null;
      }
      return sign * (deg + min / 60 + sec / 3600); // ±DDMMSS.S
    }
  } else {
    // Integer variants
    if (intLen <= intDeg) {
      const v = parseInt(abs);
      if (isNaN(v)) {
        Logger.error(`Invalid ISO6709 integer part "${s}"`, "Invalid geopoint");
        return null;
      }
      return sign * v;                                                                                                       // ±DD
    }
    if (intLen === intDeg + 2) {
      const deg = parseInt(abs.slice(0, intDeg));
      const min = parseInt(abs.slice(intDeg));
      if (isNaN(deg) || isNaN(min)) {
        Logger.error(`Invalid ISO6709 integer part "${s}"`, "Invalid geopoint");
        return null;
      }
      return sign * (deg + min / 60);                  // ±DDMM
    }
    if (intLen === intDeg + 4) {
      const deg = parseInt(abs.slice(0, intDeg));
      const min = parseInt(abs.slice(intDeg, intDeg + 2));
      const sec = parseInt(abs.slice(intDeg + 2));
      if (isNaN(deg) || isNaN(min) || isNaN(sec)) {
        Logger.error(`Invalid ISO6709 integer part "${s}"`, "Invalid geopoint");
        return null;
      }
      return sign * (deg + min / 60 + sec / 3600); // ±DDMMSS
    }
  }
  return null;
}

/**
 * Parse ISO 6709 format: ±lat±lon[±alt][/]
 * Altitude (third signed field) is silently ignored.
 * Returns { lat, long } or null.
 */
function parseISO6709(raw) {
  const s = raw.trim().replace(/\/$/, "");
  if (!/^[+-]/.test(s)) return null;

  // Collect indices of sign characters after position 0
  const signPositions = [];
  for (let i = 1; i < s.length; i++) {
    if (s[i] === "+" || s[i] === "-") signPositions.push(i);
  }
  if (signPositions.length < 1) return null;

  const latStr = s.slice(0, signPositions[0]);
  // Stop before altitude (third sign) if present
  const lonStr =
    signPositions.length >= 2
      ? s.slice(signPositions[0], signPositions[1])
      : s.slice(signPositions[0]);

  const lat = parseISO6709Part(latStr, 2);
  const lon = parseISO6709Part(lonStr, 3);
  if (lat === null || lon === null) return null;
  return { lat, long: lon };
}

/**
 * Split a single-cell string (no pipe) into [latStr, lonStr].
 * Returns null when the string cannot be unambiguously divided.
 *
 * Priority order:
 *   1. N/S suffix → everything up to and including it is lat
 *   2. N/S prefix → N/S token + value before E/W
 *   3. ", " separator (safe against French decimal commas between digits)
 *   4. Single whitespace between two non-space tokens (plain DD)
 */
function splitCoordPair(s) {
  // After N/S marker: "48.8566N 2.3522E"  "48°51'23.76"N, 2°21'7.92"E"
  const nsSuffix = s.match(/^(.+?[NS])\s*[,;]?\s*(.+)$/i);
  if (nsSuffix && /[EW]/i.test(nsSuffix[2]))
    return [nsSuffix[1].trim(), nsSuffix[2].trim()];

  // Before E/W prefix: "N 48.8566, E 2.3522"
  const nsPrefix = s.match(/^([NS]\s*.+?)\s*[,;]?\s*([EW]\s*.+)$/i);
  if (nsPrefix) return [nsPrefix[1].trim(), nsPrefix[2].trim()];

  // Comma + space separator  (French decimal: "48,8566, 2,3522" → ", " splits cleanly)
  const commaSpaceIdx = s.indexOf(", ");
  if (commaSpaceIdx > 0)
    return [s.slice(0, commaSpaceIdx).trim(), s.slice(commaSpaceIdx + 2).trim()];

  // Two whitespace-separated tokens with no internal spaces (plain DD only)
  const twoTokens = s.match(/^(\S+)\s+(\S+)$/);
  if (twoTokens) return [twoTokens[1], twoTokens[2]];

  return null;
}

/**
 * Parse a raw single-cell value (no pipe) into { lat, long } or null.
 * Altitude, if present, is silently trimmed (handled inside parseISO6709
 * and ignored beyond the second coordinate token otherwise).
 */
function parseSingleCell(raw) {
  const s = stripExcelPrefix(raw.trim());
  if (!s) return null;

  // Try ISO 6709 first (unambiguous: starts with a sign character)
  const iso = parseISO6709(s);
  if (iso) return iso;

  const parts = splitCoordPair(s);
  if (!parts) return null;

  const lat = parseOneCoord(parts[0]);
  const lon = parseOneCoord(parts[1]);
  if (lat === null || lon === null) return null;
  return { lat, long: lon };
}

// ---------------------------------------------------------------------------
// Reader export
// ---------------------------------------------------------------------------

export let customTypeGeopoint = {
  dataType: "geopoint",
  expectedColumns: (basePath) => [basePath, `${basePath}.lat`, `${basePath}.long`],

  filterPlugin: null, // No full-text search plugin for geopoints (proximity search would be more appropriate but is deferred)

  defaultTemplate: "https://www.google.com/maps?q={{lat}},{{long}}",

  readData(context, computedPath) {
    const { headers, row, langCode } = context;
    const base = computedPath.toLowerCase();

    // --- Strategy 1: multi-column (.lat and .long) ---
    const latIdx = findColIdx(headers, base + ".lat", base + ".lat:" + langCode);
    const lonIdx = findColIdx(headers, base + ".long", base + ".long:" + langCode);

    if (latIdx >= 0 && lonIdx >= 0) {
      const latStr = row[latIdx]?.toString().trim() ?? "";
      const lonStr = row[lonIdx]?.toString().trim() ?? "";
      if (!latStr || !lonStr) return null;

      const lat = parseOneCoord(latStr);
      const lon = parseOneCoord(lonStr);
      if (lat === null || lon === null) {
        Logger.warning(
          "Unparseable multi-column coordinates for path <strong>" + computedPath + "</strong> - values were: " + latStr + " and " + lonStr, "Cannot parse coordinates"
        );
        return null;
      }
      return { verbatim: latStr + ", " + lonStr, lat, long: lon };
    }

    if (latIdx >= 0 || lonIdx >= 0) {
      Logger.warning(
        "Only one of .lat or .long found for path <strong>" + computedPath + "</strong>; both columns are required for multi-column mode"
      );
    }

    // --- Strategy 2: single column (pipe-separated or single-cell) ---
    const colIdx = findColIdx(headers, base, base + ":" + langCode);
    if (colIdx < 0 || row[colIdx] == null) return null;

    const cellValue = row[colIdx].toString().trim();
    if (!cellValue) return null;

    if (cellValue.includes("|")) {
      const cleanValue = cellValue.replace(/\/$/, ""); // Remove trailing slash if present in case user enters ISO 6709 with a slash at the end (e.g. "+70.2343|+158.2391/")
      const [latStr, lonStr] = cleanValue.split("|").map((p) => p.trim());

      const lat = parseOneCoord(latStr);
      const lon = parseOneCoord(lonStr);
      if (lat === null || lon === null) {
        console.log("Failed to parse pipe-separated coordinates:", { latStr, lonStr }, "with string value:", cellValue, lat, lon);

        Logger.warning(
          "Unparseable pipe-separated coordinates for path <strong>" + computedPath + "</strong> - value was: " + cellValue, "Cannot parse coordinates"
        );
        return null;
      }
      return { verbatim: cellValue, lat, long: lon };
    }

    const parsed = parseSingleCell(cellValue);
    if (!parsed) {
      Logger.warning(
        "Unparseable single-cell coordinate for path <strong>" + computedPath + "</strong> - value was: " + cellValue, "Cannot parse coordinates"
      );
      return null;
    }
    return { verbatim: cellValue, lat: parsed.lat, long: parsed.long };
  },

  /**
   * Geographic coordinates carry no useful full-text search signal.
   * Users do not search for coordinate strings; a dedicated proximity filter
   * would be the correct mechanism (deferred to a future iteration).
   */
  getSearchableText(_data, _uiContext) {
    return _data?.verbatim ? [_data.verbatim] : [];
  },

  toDwC: function (data, subPath) {
    if (!data || !data.verbatim || !data.lat || !data.long) return null;

    switch (subPath) {
      case "lat":
        return data.lat;
      case "long":
        return data.long;
      case "verbatim":
        return data.verbatim;
      default:
        return null;
    }
  },

  render(data, uiContext) {
    if (!data || data.lat == null || data.long == null) return null;

    const template = uiContext?.meta?.template;

    if (!template) {
      Logger.info("No map URL template configured; falling back to Google Maps");
      // Optional: keep buildMapUrl just for the fallback, or define the fallback purely in Handlebars syntax
    } else {
      const hasLat = /\{\{\s*lat\s*\}\}/i.test(template);
      const hasLong = /\{\{\s*long\s*\}\}/i.test(template);

      if (!hasLat || !hasLong) {
        Logger.warning(
          `Map URL template might be malformed. It is missing {{ lat }} and/or {{ long }} placeholders. Template: "${template}"`,
          "Geopoint Template Warning"
        );
      }
    }

    // Prepare the exact variables we want Handlebars to know about
    const additionalParams = {
      lat: data.lat,
      long: data.long
    };

    // Pass data.verbatim as the "value", so {{ value }} resolves to the original cell text
    const finalUrl = helpers.processTemplate(data.verbatim || "", uiContext, additionalParams);

    return m(
      "a.geopoint-badge",
      {
        href: finalUrl,
        // We keep these for accessibility and native middle-click support
        target: "_blank",
        rel: "noopener noreferrer",
        onclick: (e) => {
          // Prevent row-level click handlers (expand, select) from firing
          e.stopPropagation();
          // Prevent the browser from natively following the href
          e.preventDefault();

          console.log("Geopoint badge clicked; opening URL:", finalUrl, data, uiContext);

          // Open the URL in a new tab via JavaScript
          window.open(finalUrl, "_blank", "noopener,noreferrer");

          // Force Mithril not to redraw
          return false;
        },
      },
      [m("span.geopoint-coords", applyHighlight(data.verbatim, uiContext?.highlightRegex))]
    );
  },
};

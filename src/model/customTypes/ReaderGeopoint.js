import m from "mithril";
import { Logger } from "../../components/Logger.js";

export let readerGeopoint = {
  dataType: "geopoint",
  readData: function (context, computedPath) {
    const { headers, row, langCode } = context;

    const baseColumn = computedPath.toLowerCase();
    const latColumn = baseColumn + ".lat";
    const longColumn = baseColumn + ".long";

    // Strategy 1: Look for explicit .lat AND .long columns first
    let latIndex = headers.indexOf(latColumn);
    if (latIndex < 0) {
      latIndex = headers.indexOf(latColumn + ":" + langCode);
    }

    let longIndex = headers.indexOf(longColumn);
    if (longIndex < 0) {
      longIndex = headers.indexOf(longColumn + ":" + langCode);
    }

    if (latIndex < 0 || longIndex < 0 && (latIndex >= 0 || longIndex >= 0)) {
      // If one of the lat/long columns is missing, log a warning
      Logger.warning(tf("dm_geopoint_missing_columns", [latColumn, longColumn]), "Missing geopoint columns");
    }

    // Strategy 2: If explicit .lat column found, use structured approach
    if (latIndex >= 0 && longIndex >= 0) {
      const lat = row[latIndex]?.toString().trim() || "";
      const long = row[longIndex]?.toString().trim() || "";

      if (lat === "" || long === "") {
        return null;
      }

      return {
        latitude: lat,
        longitude: long,
      };
    }

    // Strategy 3: Check if base column exists for pipe-separated or name-only format
    let baseIndex = headers.indexOf(baseColumn);
    if (baseIndex < 0) {
      baseIndex = headers.indexOf(baseColumn + ":" + langCode);
    }

    if (baseIndex < 0 || row[baseIndex] === undefined || row[baseIndex] === null) {
      return null;
    }

    const cellValue = row[baseIndex].toString().trim();
    if (cellValue === "") {
      return null;
    }

    // Check if there's a pipe separator (single-cell format: "Name|Authority")
    if (cellValue.includes("|")) {
      const parts = cellValue.split("|").map((p) => p.trim());
      const name = parts[0] || "";
      const authority = parts[1] || "";

      if (name === "") {
        return null;
      }

      return {
        name: name,
        authority: authority,
      };
    }

    // No pipe separator - check if authority column exists separately
    if (authorityIndex >= 0) {
      const authority = row[authorityIndex]?.toString().trim() || "";
      return {
        name: cellValue,
        authority: authority,
      };
    }

    // Base column only, no authority
    return {
      name: cellValue,
      authority: "",
    };
  },

  /**
   * Extract searchable text from geopoint data
   * @param {any} data - The geopoint object with latitude and longitude
   * @param {Object} uiContext - UI context (optional)
   * @returns {string[]} Array of searchable strings
   */
  getSearchableText: function (data, uiContext) {
    if (!data || typeof data !== "object") return [];
    const result = [];
    if (data.name) result.push(data.name);
    if (data.authority) result.push(data.authority);
    return result;
  },

  render: function (data, uiContext) {
    if (data && data.latitude !== undefined && data.longitude !== undefined) {
      return m("div", `Lat: ${data.latitude}, Lng: ${data.longitude}`);
    }
  },
};

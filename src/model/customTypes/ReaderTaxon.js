import m from "mithril";
import { ClickableTaxonName } from "../../view/ClickableTaxonNameView.js";

export let readerTaxon = {
  dataType: "taxon",
  readData: function (context, computedPath) {
    const { headers, row, langCode } = context;

    const baseColumn = computedPath.toLowerCase();
    const explicitNameColumn = baseColumn + ".name";
    const authorityColumn = baseColumn + ".authority";

    // Strategy 1: Look for explicit .name column first
    let nameIndex = headers.indexOf(explicitNameColumn);
    if (nameIndex < 0) {
      nameIndex = headers.indexOf(explicitNameColumn + ":" + langCode);
    }

    // Look for authority column
    let authorityIndex = headers.indexOf(authorityColumn);
    if (authorityIndex < 0) {
      authorityIndex = headers.indexOf(authorityColumn + ":" + langCode);
    }

    // Strategy 2: If explicit .name column found, use structured approach
    if (nameIndex >= 0) {
      const name = row[nameIndex]?.toString().trim() || "";
      const authority =
        authorityIndex >= 0 ? row[authorityIndex]?.toString().trim() || "" : "";

      if (name === "") {
        return null;
      }

      return {
        name: name,
        authority: authority,
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
   * Extract searchable text from taxon data
   * @param {any} data - The taxon object with name and authority
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
    // If data has taxonTree structure, use it directly
    if (data && data.taxonTree && data.taxonTree.taxon) {
      return m(ClickableTaxonName, {
        taxonTree: {
          taxon: data.taxonTree.taxon,
          data: {},
          children: {},
        },
      });
    }

    // Otherwise, treat data as the taxon name directly
    return m(ClickableTaxonName, {
      taxonTree: {
        taxon: data,
        data: {},
        children: {},
      },
    });
  },
};

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

    // Strategy 2: If no .name column, check if base column exists AND
    // there's no .name column defined (meaning base column IS the name)
    if (nameIndex < 0) {
      // Only use base column if there's no .name variant in headers at all
      const hasExplicitNameColumn = headers.some((h) =>
        h === explicitNameColumn || h.startsWith(explicitNameColumn + ":")
      );

      if (!hasExplicitNameColumn) {
        nameIndex = headers.indexOf(baseColumn);
        if (nameIndex < 0) {
          nameIndex = headers.indexOf(baseColumn + ":" + langCode);
        }
      }
    }

    // Look for authority column
    let authorityIndex = headers.indexOf(authorityColumn);
    if (authorityIndex < 0) {
      authorityIndex = headers.indexOf(authorityColumn + ":" + langCode);
    }

    if (nameIndex < 0) {
      return null;
    }

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

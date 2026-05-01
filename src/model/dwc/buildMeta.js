/**
 * @param {string[]} fieldUris       - Ordered list of DwC term URIs for each CSV column.
 * @param {string}   rowTypeDwcUri   - The rowType URI (e.g. Taxon or Occurrence).
 * @param {string}   dataFileName    - e.g. "taxa.csv"
 * @param {string|null} emlFileName  - e.g. "eml.xml", or null if no EML.
 * @param {string}   idTermUri       - The full URI of the term that acts as the record ID
 *                                     (e.g. "http://rs.tdwg.org/dwc/terms/taxonID" or
 *                                     "http://rs.tdwg.org/dwc/terms/occurrenceID").
 *                                     The function locates its index in fieldUris automatically.
 */
export function buildMetaXml(fieldUris, rowTypeDwcUri, dataFileName, emlFileName, idTermUri) {
    // Find the index of the ID column. Fall back to 0 if not found (should not happen).
    const idIndex = idTermUri
        ? Math.max(0, fieldUris.indexOf(idTermUri))
        : 0;

    const fields = fieldUris
        .map((uri, i) => uri ? `    <field index="${i}" term="${uri}"/>` : null)
        .filter(Boolean).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<archive xmlns="http://rs.tdwg.org/dwc/text/"
         ${emlFileName ? `metadata="${emlFileName}"` : ""}
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://rs.tdwg.org/dwc/text/ http://rs.tdwg.org/dwc/text/tdwg_dwc_text.xsd">
  <core encoding="UTF-8" fieldsTerminatedBy="," linesTerminatedBy="&#13;&#10;"
        fieldsEnclosedBy="&quot;" ignoreHeaderLines="1"
        rowType="${rowTypeDwcUri}">
    <files><location>${dataFileName}</location></files>
    <id index="${idIndex}"/>
${fields}
  </core>
</archive>`;
}
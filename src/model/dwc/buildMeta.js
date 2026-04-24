export function buildMetaXml(fieldUris, rowTypeDwcUri, dataFileName, emlFileName) {
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
    <id index="0"/>
${fields}
  </core>
</archive>`;
}
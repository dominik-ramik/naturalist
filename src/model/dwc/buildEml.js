export function buildEmlXml(opts) {
    // Options accepted in `opts` (all values are expected to be strings unless
    // otherwise noted):
    // - packageId: unique package identifier for the EML (e.g. UUID)
    // - language: ISO 639-1 two-letter code (e.g. 'en')
    // - title: dataset title
    // - pubDate: publication date string
    // - abstract: short abstract/description
    // - licenseUri: license URI (used in <intellectualRights>)
    // - licenseLabel: human readable label for the license (optional)
    // - geographicDescription: geographic coverage description (optional)
    // - taxonomicDescription: taxonomic coverage description (optional)
    // - temporalDescription: temporal coverage description (optional)
    // - creator: object with creator/contact fields (optional):
    //     { givenName, surName, organizationName, email, url, userId }
    // The function tolerates missing fields by treating them as empty strings.

    // Destructure opts with safe defaults to make available fields explicit.
    const {
        packageId = "",
        language = "en",
        title = "",
        pubDate = new Date().toISOString().split("T")[0], // Default to current date in YYYY-MM-DD format
        abstract = "",
        licenseUri = "",
        licenseLabel = "",
        geographicDescription = "",
        taxonomicDescription = "",
        creator = {
            // expected fields: givenName, surName, organizationName, email, url, userId
        },
    } = opts || {};

    const e = s => (s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

    // Use the destructured `creator` object (alias `c`) for brevity.
    const c = creator || {};

    const individualNameBlock = (c.givenName || c.surName)
        ? `      <individualName>\n` +
        (c.givenName ? `        <givenName>${e(c.givenName)}</givenName>\n` : "") +
        (c.surName ? `        <surName>${e(c.surName)}</surName>\n` : "") +
        `      </individualName>\n`
        : "";

    const responsiblePartyContent =
        individualNameBlock +
        (c.organizationName ? `      <organizationName>${e(c.organizationName)}</organizationName>\n` : "") +
        (c.email ? `      <electronicMailAddress>${e(c.email)}</electronicMailAddress>\n` : "") +
        (c.url ? `      <onlineUrl>${e(c.url)}</onlineUrl>\n` : "") +
        (c.userId ? `      <userId directory="https://orcid.org/">${e(c.userId)}</userId>\n` : "");

    const creatorBlock = `    <creator>\n${responsiblePartyContent}    </creator>\n`;
    const metadataProviderBlock = `    <metadataProvider>\n${responsiblePartyContent}    </metadataProvider>\n`;
    const contactBlock = `    <contact>\n${responsiblePartyContent}    </contact>\n`;

    // intellectualRights: use a human-readable label if available, else the URI
    const licenseText = licenseLabel || licenseUri || "";

    const resultXml = `<?xml version="1.0" encoding="UTF-8"?>
<eml:eml xmlns:eml="eml://ecoinformatics.org/eml-2.1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="eml://ecoinformatics.org/eml-2.1.1 https://rs.gbif.org/schema/eml-gbif-profile/1.1/eml.xsd" packageId="${e(packageId)}" system="http://gbif.org" scope="system" xml:lang="${e(language)}">
    <dataset>
        <title xml:lang="${e(language)}">${e(title)}</title>
${creatorBlock}${metadataProviderBlock}<pubDate>${e(pubDate)}</pubDate>
        <language>${e(language)}</language>
        <abstract><para>${e(abstract)}</para></abstract>
    <intellectualRights>
            <para><ulink url="${e(licenseUri)}"><citetitle>${e(licenseText)}</citetitle></ulink></para>
        </intellectualRights>${contactBlock}
    </dataset>
</eml:eml>`;

    return resultXml;
}
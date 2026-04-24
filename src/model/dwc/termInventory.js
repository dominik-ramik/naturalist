/**
 * GBIF-required terms per archive type.
 * Source:
 *   Checklist:   https://www.gbif.org/data-quality-requirements-checklists
 *   Occurrences: https://www.gbif.org/data-quality-requirements-occurrences
 *
 * These are the terms whose absence causes GBIF to reject the archive outright.
 * The compiler uses this to validate that required terms are either user-configured
 * in the table (with a matching exportTo that covers the archive type) or
 * auto-added by the compiler itself.
 */

export function prefixToNamespace(prefix) {
    return prefixToNamespaceTable[prefix] || null;
}

const prefixToNamespaceTable = {
    dwc: "http://rs.tdwg.org/dwc/terms/",
    dcterms: "http://purl.org/dc/terms/",
    dwciri: "http://rs.tdwg.org/dwc/iri/",
    dc: "http://purl.org/dc/elements/1.1/",
    eml: "eml://ecoinformatics.org/eml-2.1.0",
};

// For checklist and occurrences, `presence: "optional"` means encouraged and absence should raise a warning, not specified terms are ignored by the compiler and GBIF.
export const termsMeta = {
    eml: [
        // Takes precedence and fetches the file from usercontent/
        { term: "eml:fromFile", presence: "optional" },
        // Manual creation of EML metadata fields
        { term: "eml:packageId", presence: "critical" },
        { term: "eml:title", presence: "required" },
        { term: "eml:pubDate", presence: "optional" },
        { term: "eml:abstract", presence: "optional" },
        { term: "eml:licenseUri", presence: "required" },
        { term: "eml:licenseLabel", presence: "required" },

        { term: "eml:creatorGivenName", presence: "required" },
        { term: "eml:creatorSurName", presence: "required" },
        { term: "eml:creatorEmail", presence: "required" },
        { term: "eml:creatorOrganizationName", presence: "optional" },
        { term: "eml:creatorUrl", presence: "optional" },
        { term: "eml:creatorUserId", presence: "optional" },

        { term: "eml:geographicDescription", presence: "optional" },
        { term: "eml:generalTaxonomicCoverage", presence: "optional" },
    ],
    checklist: [
        { term: "dwc:taxonID", presence: "required" },
        { term: "dwc:scientificName", presence: "required" },
        { term: "dwc:taxonRank", presence: "required" },
        { term: "dwc:kingdom", presence: "optional" },
        { term: "dwc:parentNameUsageID", presence: "optional" },
        { term: "dwc:acceptedNameUsageID", presence: "optional" },
        { term: "dwc:vernacularName", presence: "optional" },
    ],
    occurrences: [
        { term: "dwc:occurrenceID", presence: "required" },
        { term: "dwc:basisOfRecord", presence: "required" },
        { term: "dwc:scientificName", presence: "required" },
        { term: "dwc:eventDate", presence: "required" },
        { term: "dwc:countryCode", presence: "optional" },
        { term: "dwc:taxonRank", presence: "optional" },
        { term: "dwc:kingdom", presence: "optional" },
        { term: "dwc:decimalLatitude", presence: "optional" },
        { term: "dwc:decimalLongitude", presence: "optional" },
        { term: "dwc:geodeticDatum", presence: "optional" },
        { term: "dwc:coordinateUncertaintyInMeters", presence: "optional" },
        { term: "dwc:individualCount", presence: "optional" },
        { term: "dwc:organismQuantity", presence: "optional" },
        { term: "dwc:organismQuantityType", presence: "optional" },
        { term: "dwc:informationWithheld", presence: "optional" },
        { term: "dwc:dataGeneralizations", presence: "optional" },
        { term: "dwc:eventTime", presence: "optional" },
        { term: "dwc:country", presence: "optional" },
    ],
};
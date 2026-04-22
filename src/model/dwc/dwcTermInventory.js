/** Returns the term entry or null if unknown */
export function getDwcTerm(termName) {
    return dwcTermInventory[termName] ?? null;
}

/** Returns all terms for a given tier */
export function getTermsByTier(tier) {
    const result = {};
    for (const [name, entry] of Object.entries(dwcTermInventory)) {
        if (entry.tier === tier) result[name] = entry;
    }
    return result;
}

/** Returns true if the term is known in the inventory */
export function isKnownTerm(termName) {
    return termName in dwcTermInventory;
}

/** Normalizes a license alias to its canonical URI, returns null if unrecognised */
export function normalizeLicense(rawValue) {
    if (rawValue == null) return null;
    const licenseEntry = dwcTermInventory.license;
    const normalized = String(rawValue).trim();
    if (licenseEntry.vocabulary.includes(normalized)) return normalized;
    const key = normalized.toLowerCase();
    return licenseEntry.vocabularyAliases[key] ?? null;
}

/**
 * Returns a human-readable license label for a canonical URI, sourced from
 * vocabularyAliases.  Prefers the alias that contains a version number
 * (e.g. "cc by 4.0") over shorter synonyms.  Falls back to the URI itself.
 */
export function getLicenseLabel(uri) {
    if (!uri) return uri;
    const aliases = dwcTermInventory.license.vocabularyAliases;
    const matchingKeys = Object.entries(aliases)
        .filter(([key, val]) => val === uri && !key.startsWith("http"))
        .map(([key]) => key);
    if (matchingKeys.length === 0) return uri;
    const withVersion = matchingKeys.find(k => /\d+\.\d+/.test(k));
    return withVersion || matchingKeys[0];
}

export const dwcTermInventory = {
    // Each key is the bare DwC term name (camelCase as in DwC spec)
    scientificName: {
        uri: "http://rs.tdwg.org/dwc/terms/scientificName",
        namespace: "dwc",
        tier: 1,                        // 1 = checklist required, 2 = occurrence required, 0 = optional enrichment
        required: true,                 // within its tier
        acceptedNlTypes: ["taxon"],     // null = accept any NL dataType type; array = whitelist
        outputFormat: "string",         // "string" | "decimal" | "integer" | "iso8601date" | "uri"
        vocabulary: null,               // null = free text; array of strings = controlled vocab
        compound: {
            // When the NL source column has type "taxon", extract only this component.
            // When source column type is NOT in the compound map, use the value as-is.
            taxon: "name",                // extract the .name field from customTypeTaxon.readData result
        },
        autoGenerate: null,             // null = not auto-generated; string = strategy key (see §Auto-generation)
        tier2Trigger: false,
        notes: "Full binomial. When auto-mapped from taxon tree, the compiler uses the taxon name at the deepest populated rank for each row.",
    },

    scientificNameAuthorship: {
        uri: "http://rs.tdwg.org/dwc/terms/scientificNameAuthorship",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["taxon"],     // NOT "text" - authority should live in a taxon-typed column
        outputFormat: "string",
        vocabulary: null,
        compound: {
            taxon: "authority",           // extract .authority from customTypeTaxon.readData result
        },
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Author string. Must come from a taxon-typed column (the .authority component).",
    },

    taxonID: {
        uri: "http://rs.tdwg.org/dwc/terms/taxonID",
        namespace: "dwc",
        tier: 1,
        required: true,
        acceptedNlTypes: ["text", "number"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: "uuidv5_taxon",   // Strategy: UUID v5 from institutionCode:collectionCode:scientificName:taxonRank
        tier2Trigger: false,
        notes: "Auto-generated as UUID v5 if no source column is mapped. User can override by adding an explicit row.",
    },

    taxonRank: {
        uri: "http://rs.tdwg.org/dwc/terms/taxonRank",
        namespace: "dwc",
        tier: 1,
        required: true,
        acceptedNlTypes: null,          // Can come from taxa: directive or any text column
        outputFormat: "string",
        vocabulary: [
            "kingdom", "subkingdom", "phylum", "subphylum", "superclass", "class", "subclass",
            "superorder", "order", "suborder", "superfamily", "family", "subfamily", "tribe",
            "subtribe", "genus", "subgenus", "section", "series", "species", "subspecies",
            "variety", "subvariety", "form", "subform", "infraspecificname",
            "cultivargroup", "cultivar"
        ],
        compound: null,
        autoGenerate: "taxonrank_from_column", // Strategy: inferred from which Taxa Definition column contains the row's name
        tier2Trigger: false,
        notes: "Always auto-inferred from the taxa column name position in the hierarchy. The user references it with 'taxa:ColumnName' in the Source column to make it visible in the table. Vocabulary values trigger a warning (not error) if non-matching - non-standard ranks pass through.",
    },

    parentNameUsageID: {
        uri: "http://rs.tdwg.org/dwc/terms/parentNameUsageID",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: "parent_taxon_id",  // Strategy: taxonID of the immediate parent in the compiled tree
        tier2Trigger: false,
        notes: "Always auto-generated. The user can reference it with 'auto:parentNameUsageID' to make it visible.",
    },

    language: {
        uri: "http://purl.org/dc/terms/language",
        namespace: "dcterms",
        tier: 1,
        required: true,
        acceptedNlTypes: null,          // constant only
        outputFormat: "string",
        vocabulary: null,               // ISO 639-1 - validated by regex /^[a-z]{2}$/ not a closed list
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Must be a valid ISO 639-1 two-letter code. Also controls which language variant is used when resolving multilingual source columns during export.",
    },

    license: {
        uri: "http://purl.org/dc/terms/license",
        namespace: "dcterms",
        tier: 1,
        required: true,
        acceptedNlTypes: null,
        outputFormat: "uri",
        vocabulary: [
            "http://creativecommons.org/publicdomain/zero/1.0/legalcode",
            "http://creativecommons.org/licenses/by/4.0/legalcode",
            "http://creativecommons.org/licenses/by-nc/4.0/legalcode",
        ],
        // Aliases normalized to canonical URI before vocabulary check:
        vocabularyAliases: {
            "cc0": "http://creativecommons.org/publicdomain/zero/1.0/legalcode",
            "cc-0": "http://creativecommons.org/publicdomain/zero/1.0/legalcode",
            "cc by": "http://creativecommons.org/licenses/by/4.0/legalcode",
            "cc-by": "http://creativecommons.org/licenses/by/4.0/legalcode",
            "cc by 4.0": "http://creativecommons.org/licenses/by/4.0/legalcode",
            "https://creativecommons.org/licenses/by/4.0/legalcode": "http://creativecommons.org/licenses/by/4.0/legalcode",
            "cc by-nc": "http://creativecommons.org/licenses/by-nc/4.0/legalcode",
            "cc-by-nc": "http://creativecommons.org/licenses/by-nc/4.0/legalcode",
            "cc by-nc 4.0": "http://creativecommons.org/licenses/by-nc/4.0/legalcode",
            "https://creativecommons.org/licenses/by-nc/4.0/legalcode": "http://creativecommons.org/licenses/by-nc/4.0/legalcode",
        },
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Must be one of the three GBIF-accepted CC URIs. Common alias strings (CC-BY etc.) are normalized automatically with a Logger.info.",
    },

    institutionCode: {
        uri: "http://rs.tdwg.org/dwc/terms/institutionCode",
        namespace: "dwc",
        tier: 1,
        required: true,
        acceptedNlTypes: ["text"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Short code identifying the holding institution (e.g. 'MNHN-NC'). No spaces. Also used as a component of auto-generated taxonID and occurrenceID.",
    },

    collectionCode: {
        uri: "http://rs.tdwg.org/dwc/terms/collectionCode",
        namespace: "dwc",
        tier: 1,
        required: false,    // recommended; absence is a warning not an error
        acceptedNlTypes: ["text"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Identifies the collection within the institution. Recommended. Used in auto-generated IDs.",
    },

    datasetName: {
        uri: "http://rs.tdwg.org/dwc/terms/datasetName",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Human-readable dataset title. Can reference the Customization table via 'config:Checklist name'.",
    },

    kingdom: {
        uri: "http://rs.tdwg.org/dwc/terms/kingdom",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Animalia') or a source column.",
    },
    phylum: {
        uri: "http://rs.tdwg.org/dwc/terms/phylum",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Chordata') or a source column.",
    },
    class: {
        uri: "http://rs.tdwg.org/dwc/terms/class",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Mammalia') or a source column.",
    },
    order: {
        uri: "http://rs.tdwg.org/dwc/terms/order",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Carnivora') or a source column.",
    },
    superfamily: {
        uri: "http://rs.tdwg.org/dwc/terms/superfamily",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Feloidea') or a source column.",
    },
    family: {
        uri: "http://rs.tdwg.org/dwc/terms/family",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Felidae') or a source column.",
    },
    subfamily: {
        uri: "http://rs.tdwg.org/dwc/terms/subfamily",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Felinae') or a source column.",
    },
    tribe: {
        uri: "http://rs.tdwg.org/dwc/terms/tribe",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Bovini') or a source column.",
    },
    subtribe: {
        uri: "http://rs.tdwg.org/dwc/terms/subtribe",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Daucinae') or a source column.",
    },
    genus: {
        uri: "http://rs.tdwg.org/dwc/terms/genus",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Puma') or a source column.",
    },
    subgenus: {
        uri: "http://rs.tdwg.org/dwc/terms/subgenus",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Strobus') or a source column.",
    },
    infragenericEpithet: {
        uri: "http://rs.tdwg.org/dwc/terms/infragenericEpithet",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Abies') or a source column.",
    },
    specificEpithet: {
        uri: "http://rs.tdwg.org/dwc/terms/specificEpithet",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'concolor') or a source column.",
    },
    cultivarEpithet: {
        uri: "http://rs.tdwg.org/dwc/terms/cultivarEpithet",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'Granny Smith') or a source column.",
    },
    infraspecificEpithet: {
        uri: "http://rs.tdwg.org/dwc/terms/infraspecificEpithet",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended by GBIF. Can be a constant (e.g. 'domestica') or a source column.",
    },

    // NOTE: more can be added with the same pattern as above: acceptedNlTypes: ["text","category"], no vocabulary, no compound, no autoGenerate

    establishmentMeans: {
        uri: "http://rs.tdwg.org/dwc/terms/establishmentMeans",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: ["native", "nativeReintroduced", "introduced", "introducedAssistedColonisation", "vagrant", "uncertain", "nativeEndemic"],
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Note: 'endemic' is NOT in the DwC controlled vocabulary. A warning is emitted for non-matching values but they pass through.",
    },

    namePublishedIn: {
        uri: "http://rs.tdwg.org/dwc/terms/namePublishedIn",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "markdown"],
        outputFormat: "string",
        compound: null,
        vocabulary: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "For markdown-typed source columns, markdown is stripped to plain text before output.",
    },

    taxonRemarks: {
        uri: "http://rs.tdwg.org/dwc/terms/taxonRemarks",
        namespace: "dwc",
        tier: 1,
        required: false,
        acceptedNlTypes: ["text", "category", "markdown"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Free text. Template syntax ({col1} | {col2}) is supported in Source column.",
    },

    // --- TIER 2: OCCURRENCE TERMS ---

    basisOfRecord: {
        uri: "http://rs.tdwg.org/dwc/terms/basisOfRecord",
        namespace: "dwc",
        tier: 2,
        required: true,
        acceptedNlTypes: null,          // constant only (dataset-wide value)
        outputFormat: "string",
        vocabulary: ["PreservedSpecimen", "FossilSpecimen", "LivingSpecimen", "HumanObservation", "MachineObservation", "MaterialSample", "MaterialCitation"],
        compound: null,
        autoGenerate: null,
        tier2Trigger: true,             // PRESENCE OF THIS ROW triggers Tier 2 validation
        notes: "Constant value only. Its presence in the DwC archive table triggers occurrence export mode.",
    },

    occurrenceID: {
        uri: "http://rs.tdwg.org/dwc/terms/occurrenceID",
        namespace: "dwc",
        tier: 2,
        required: true,
        acceptedNlTypes: ["text"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: "occurrenceid_from_catalog", // Strategy: institutionCode:collectionCode:catalogNumber if catalogNumber mapped; else UUID v5
        tier2Trigger: false,
        notes: "Auto-generated if not explicitly mapped. See autoGenerate strategy.",
    },

    catalogNumber: {
        uri: "http://rs.tdwg.org/dwc/terms/catalogNumber",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["text", "number"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Recommended. Drives auto-generation of occurrenceID.",
    },

    eventDate: {
        uri: "http://rs.tdwg.org/dwc/terms/eventDate",
        namespace: "dwc",
        tier: 2,
        required: true,
        acceptedNlTypes: ["date", "text"],
        outputFormat: "iso8601date",
        vocabulary: null,
        compound: {
            date: "ymd",  // from customTypeDate result (a dayjs timestamp number), format as YYYY-MM-DD
        },
        autoGenerate: null,
        tier2Trigger: false,
        notes: "For 'date' typed columns, the compiler calls dayjs(value).format('YYYY-MM-DD'). For 'text' typed columns, the value is passed as-is with a warning.",
    },

    year: {
        uri: "http://rs.tdwg.org/dwc/terms/year",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["number", "text", "date"],
        outputFormat: "integer",
        vocabulary: null,
        compound: {
            date: "year",     // dayjs(value).year()
        },
        autoGenerate: null,
        tier2Trigger: false,
        notes: "When source column is 'date' typed, the year is extracted automatically.",
    },

    month: {
        uri: "http://rs.tdwg.org/dwc/terms/month",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["number", "text", "date"],
        outputFormat: "integer",
        vocabulary: null,
        compound: {
            date: "month",    // dayjs(value).month() + 1
        },
        autoGenerate: null,
        tier2Trigger: false,
        notes: null,
    },

    day: {
        uri: "http://rs.tdwg.org/dwc/terms/day",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["number", "text", "date"],
        outputFormat: "integer",
        vocabulary: null,
        compound: {
            date: "day",      // dayjs(value).date()
        },
        autoGenerate: null,
        tier2Trigger: false,
        notes: null,
    },

    decimalLatitude: {
        uri: "http://rs.tdwg.org/dwc/terms/decimalLatitude",
        namespace: "dwc",
        tier: 2,
        required: false,    // required only if decimalLongitude is present (cross-field validation)
        acceptedNlTypes: ["geopoint"],
        outputFormat: "decimal",
        vocabulary: null,
        compound: {
            geopoint: "lat",  // from customTypeGeopoint.readData result: result.lat
        },
        autoGenerate: null,
        tier2Trigger: false,
        validationRange: { min: -90, max: 90 },
        notes: "Must come from a geopoint-typed column. Cross-field: required together with decimalLongitude.",
    },

    decimalLongitude: {
        uri: "http://rs.tdwg.org/dwc/terms/decimalLongitude",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["geopoint"],
        outputFormat: "decimal",
        vocabulary: null,
        compound: {
            geopoint: "long", // from customTypeGeopoint.readData result: result.long
        },
        autoGenerate: null,
        tier2Trigger: false,
        validationRange: { min: -180, max: 180 },
        notes: "Must come from a geopoint-typed column. Cross-field: required together with decimalLatitude.",
    },

    verbatimCoordinates: {
        uri: "http://rs.tdwg.org/dwc/terms/verbatimCoordinates",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["geopoint", "text"],
        outputFormat: "string",
        vocabulary: null,
        compound: {
            geopoint: "verbatim",  // result.verbatim (original cell string, already available)
        },
        autoGenerate: null,
        tier2Trigger: false,
        notes: "When source is geopoint-typed, the verbatim original cell string is extracted for free.",
    },

    geodeticDatum: {
        uri: "http://rs.tdwg.org/dwc/terms/geodeticDatum",
        namespace: "dwc",
        tier: 2,
        required: false,   // required if lat/long rows present (cross-field validation, Tier 2)
        acceptedNlTypes: null,
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Required when decimalLatitude/decimalLongitude rows are present. Typically 'WGS84'.",
    },

    minimumElevationInMeters: {
        uri: "http://rs.tdwg.org/dwc/terms/minimumElevationInMeters",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["interval", "number"],
        outputFormat: "decimal",
        vocabulary: null,
        compound: {
            interval: "from",  // result[0] from customTypeInterval.readData
        },
        autoGenerate: null,
        tier2Trigger: false,
        notes: null,
    },

    maximumElevationInMeters: {
        uri: "http://rs.tdwg.org/dwc/terms/maximumElevationInMeters",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["interval", "number"],
        outputFormat: "decimal",
        vocabulary: null,
        compound: {
            interval: "to",   // result[1] from customTypeInterval.readData
        },
        autoGenerate: null,
        tier2Trigger: false,
        notes: null,
    },

    minimumDepthInMeters: {
        uri: "http://rs.tdwg.org/dwc/terms/minimumDepthInMeters",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["interval", "number"],
        outputFormat: "decimal",
        vocabulary: null,
        compound: { interval: "from" },
        autoGenerate: null,
        tier2Trigger: false,
        notes: null,
    },

    maximumDepthInMeters: {
        uri: "http://rs.tdwg.org/dwc/terms/maximumDepthInMeters",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["interval", "number"],
        outputFormat: "decimal",
        vocabulary: null,
        compound: { interval: "to" },
        autoGenerate: null,
        tier2Trigger: false,
        notes: null,
    },

    locality: {
        uri: "http://rs.tdwg.org/dwc/terms/locality",
        namespace: "dwc",
        tier: 2, required: false, acceptedNlTypes: ["text"], outputFormat: "string",
        vocabulary: null, compound: null, autoGenerate: null, tier2Trigger: false, notes: null,
    },

    country: {
        uri: "http://rs.tdwg.org/dwc/terms/country",
        namespace: "dwc",
        tier: 2, required: false, acceptedNlTypes: ["text"], outputFormat: "string",
        vocabulary: null, compound: null, autoGenerate: null, tier2Trigger: false, notes: null,
    },

    countryCode: {
        uri: "http://rs.tdwg.org/dwc/terms/countryCode",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["text"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "ISO 3166-1-alpha-2 two-letter code. The compiler emits a warning if value is not 2 uppercase letters.",
    },

    stateProvince: {
        uri: "http://rs.tdwg.org/dwc/terms/stateProvince",
        namespace: "dwc",
        tier: 2, required: false, acceptedNlTypes: ["text"], outputFormat: "string",
        vocabulary: null, compound: null, autoGenerate: null, tier2Trigger: false, notes: null,
    },

    recordedBy: {
        uri: "http://rs.tdwg.org/dwc/terms/recordedBy",
        namespace: "dwc",
        tier: 2, required: false, acceptedNlTypes: ["text"], outputFormat: "string",
        vocabulary: null, compound: null, autoGenerate: null, tier2Trigger: false, notes: null,
    },

    identifiedBy: {
        uri: "http://rs.tdwg.org/dwc/terms/identifiedBy",
        namespace: "dwc",
        tier: 2, required: false, acceptedNlTypes: ["text"], outputFormat: "string",
        vocabulary: null, compound: null, autoGenerate: null, tier2Trigger: false, notes: null,
    },

    dateIdentified: {
        uri: "http://rs.tdwg.org/dwc/terms/dateIdentified",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["date", "text"],
        outputFormat: "iso8601date",
        vocabulary: null,
        compound: { date: "ymd" },
        autoGenerate: null,
        tier2Trigger: false,
        notes: null,
    },

    individualCount: {
        uri: "http://rs.tdwg.org/dwc/terms/individualCount",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["number"],
        outputFormat: "integer",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Must be a non-negative integer. A warning is emitted if the source value is a float.",
    },

    organismQuantity: {
        uri: "http://rs.tdwg.org/dwc/terms/organismQuantity",
        namespace: "dwc",
        tier: 2, required: false, acceptedNlTypes: ["number"], outputFormat: "decimal",
        vocabulary: null, compound: null, autoGenerate: null, tier2Trigger: false,
        notes: "Use together with organismQuantityType.",
    },

    organismQuantityType: {
        uri: "http://rs.tdwg.org/dwc/terms/organismQuantityType",
        namespace: "dwc",
        tier: 2, required: false, acceptedNlTypes: ["text", "category"], outputFormat: "string",
        vocabulary: null, compound: null, autoGenerate: null, tier2Trigger: false, notes: null,
    },

    sex: {
        uri: "http://rs.tdwg.org/dwc/terms/sex",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: ["male", "female", "hermaphrodite", "indeterminate", "undetermined", "not applicable", "not collected"],
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Non-matching values emit a warning but pass through.",
    },

    lifeStage: {
        uri: "http://rs.tdwg.org/dwc/terms/lifeStage",
        namespace: "dwc",
        tier: 2, required: false, acceptedNlTypes: ["text", "category"], outputFormat: "string",
        vocabulary: null, compound: null, autoGenerate: null, tier2Trigger: false, notes: null,
    },

    typeStatus: {
        uri: "http://rs.tdwg.org/dwc/terms/typeStatus",
        namespace: "dwc",
        tier: 2, required: false, acceptedNlTypes: ["text", "category"], outputFormat: "string",
        vocabulary: null, compound: null, autoGenerate: null, tier2Trigger: false, notes: null,
    },

    occurrenceStatus: {
        uri: "http://rs.tdwg.org/dwc/terms/occurrenceStatus",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["text", "category"],
        outputFormat: "string",
        vocabulary: ["present", "absent"],
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "Cross-field: when value resolves to 'absent', individualCount should be 0. Compiler emits a warning if mismatch.",
    },

    occurrenceRemarks: {
        uri: "http://rs.tdwg.org/dwc/terms/occurrenceRemarks",
        namespace: "dwc",
        tier: 2,
        required: false,
        acceptedNlTypes: ["text", "markdown", "category"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "markdown is stripped to plain text. Template syntax supported in Source column.",
    },

    preparations: {
        uri: "http://rs.tdwg.org/dwc/terms/preparations",
        namespace: "dwc",
        tier: 2, required: false, acceptedNlTypes: ["text"], outputFormat: "string",
        vocabulary: null, compound: null, autoGenerate: null, tier2Trigger: false, notes: null,
    },

    disposition: {
        uri: "http://rs.tdwg.org/dwc/terms/disposition",
        namespace: "dwc",
        tier: 2, required: false, acceptedNlTypes: ["text", "category"], outputFormat: "string",
        vocabulary: null, compound: null, autoGenerate: null, tier2Trigger: false, notes: null,
    },

    associatedMedia: {
        uri: "http://rs.tdwg.org/dwc/terms/associatedMedia",
        namespace: "dwc",
        tier: 2,
        required: false,

        // null = accept any NL type in the Source column.
        //
        // associatedMedia MUST use the dedicated `media:` directive (see notes),
        // which performs its own type enforcement.  Setting acceptedNlTypes to null
        // prevents a false "incompatible NL type" error in Step 5 while still
        // allowing the case "media": validation branch to check each individual
        // path for image / sound / map dataType.
        acceptedNlTypes: null,

        outputFormat: "string",  // pipe-joined URL string, e.g. "https://…/a.jpg | https://…/b.mp3"
        vocabulary: null,
        compound: null,          // source extraction is handled inside resolveAssociatedMedia(); not via extractCompoundValue()
        autoGenerate: null,
        tier2Trigger: false,

        notes:
            "Use the `media:` directive in the Source column to collect and resolve media\n" +
            "URLs from one or more NaturaList image, sound, or map columns - including\n" +
            "array columns.  Multiple URLs are joined with ' | ' (space–pipe–space), the\n" +
            "separator recommended by GBIF for multi-value free-text DwC fields.\n" +
            "\n" +
            "SYNTAX:\n" +
            "  media:<path1>, <path2>, …\n" +
            "\n" +
            "PATH TYPES:\n" +
            "  Plain column:     media:specimenPhoto\n" +
            "    A single image/sound/map column.  The column must exist in the checklist\n" +
            "    sheet and be defined in the Custom data definition table with dataType\n" +
            "    'image', 'sound', or 'map'.\n" +
            "\n" +
            "  Array column:     media:lifePhotos#\n" +
            "    Expands to all numbered columns in the checklist sheet whose name matches\n" +
            "    the base followed by digits (lifePhotos1, lifePhotos2, …), sorted\n" +
            "    numerically.  The dataType type is looked up from the 'lifePhotos#'\n" +
            "    CDD entry (the item-level row, not the container row).\n" +
            "    If no numbered columns exist the path is silently skipped with a\n" +
            "    Logger.info (not an error - the array may simply be empty for this row).\n" +
            "\n" +
            "  Nested array:     media:mediacluster.images#\n" +
            "    Same as above; dot-notation for grouped sub-columns is supported.\n" +
            "    The type is looked up from 'mediacluster.images#' in the CDD.\n" +
            "\n" +
            "  Mixed list:       media:specimenPhoto, lifePhotos#, mediacluster.sounds#\n" +
            "    Any combination of the above, comma-separated.  All resolved URLs from\n" +
            "    all paths are concatenated into a single pipe-separated string.\n" +
            "\n" +
            "URL RESOLUTION:\n" +
            "  Every source URL goes through the full NL media pipeline:\n" +
            "    1. Handlebars template substitution (honours the CDD 'Template' column),\n" +
            "       e.g. a template of 'images/{{name}}.jpg' becomes an absolute URL.\n" +
            "    2. relativeToUsercontent() - converts relative paths to absolute URLs\n" +
            "       based on the app's deployment root.\n" +
            "  This guarantees that the URLs in the DwC archive exactly match those\n" +
            "  displayed in the NaturaList viewer.\n" +
            "\n" +
            "EXAMPLES:\n" +
            "  DwC term          Source column\n" +
            "  associatedMedia   media:specimenPhoto\n" +
            "  associatedMedia   media:lifePhotos#\n" +
            "  associatedMedia   media:specimenPhoto, lifePhotos#, callsRecs#\n" +
            "  associatedMedia   media:photos#, soundsRef#\n" +
            "\n" +
            "TIER NOTES:\n" +
            "  This term applies to both Tier 1 (taxon) and Tier 2 (occurrence) exports.\n" +
            "  For Tier 1, URLs come from the representative row of each taxon.\n" +
            "  For Tier 2, URLs come from the individual occurrence row - recommended\n" +
            "  when each specimen has its own photographs.",
    },

    /*
    samplingProtocol: {
        uri: "http://rs.tdwg.org/dwc/terms/samplingProtocol",
        namespace: "dwc",
        tier: 3,            // tier 3 = sampling event (not implemented in v1)
        required: false,
        acceptedNlTypes: ["text"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "TIER 3 (Sampling Event) - not implemented in v1. Compiler emits Logger.warning that this term is recognised but ignored.",
    },

    eventID: {
        uri: "http://rs.tdwg.org/dwc/terms/eventID",
        namespace: "dwc",
        tier: 3,
        required: false,
        acceptedNlTypes: ["text"],
        outputFormat: "string",
        vocabulary: null,
        compound: null,
        autoGenerate: null,
        tier2Trigger: false,
        notes: "TIER 3 (Sampling Event) - not implemented in v1. Recognized but ignored with Logger.warning.",
    },
    */

    // DUBLIN CORE terms
    "dcterms:modified": {
        uri: "http://purl.org/dc/terms/modified",
        namespace: "dcterms",
        tier: 0,
        required: false,
        acceptedNlTypes: ["date", "text"],
        outputFormat: "iso8601date",
        vocabulary: null, compound: { date: "ymd" }, autoGenerate: null, tier2Trigger: false,
        notes: null,
    },
};
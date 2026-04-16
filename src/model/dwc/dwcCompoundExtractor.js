/**
 * dwcCompoundExtractor.js
 *
 * Resolves sub-component extraction for NaturaList data types that store
 * multiple meaningful values in a single readData() result object (geopoint,
 * interval, taxon, date, image, sound).
 *
 * ─── Design philosophy ───────────────────────────────────────────────────────
 *
 * Component keys are EXPLICIT in the DwC archive table Source column.  The
 * user writes e.g.:
 *
 *   location.lat          → geopoint latitude
 *   location.long         → geopoint longitude
 *   location.verbatim     → verbatim coordinate string
 *   altitude.from         → lower bound of an interval
 *   altitude.to           → upper bound of an interval
 *   collectionDate.iso8601 → ISO 8601 date string
 *   collectionDate.year   → year integer
 *   collectionDate.month  → month integer (1-based)
 *   collectionDate.day    → day-of-month integer
 *   taxa:Species.name     → taxon name string
 *   taxa:Species.authority → taxonomic authority string
 *   taxa:Species.lastNamePart → last whitespace token of a binomial/trinomial
 *                              (for use with specificEpithet, infraspecificEpithet, cultivarEpithet)
 *
 * This means the compiler does NOT silently infer which component to extract
 * based on the DwC term name — the user states it unambiguously.  The
 * dwcTermInventory.compound map is kept for documentation purposes only; the
 * actual extraction is driven by the component key from the Source column.
 *
 * ─── How to extend ───────────────────────────────────────────────────────────
 *
 * To add a new compound key for an existing NL type:
 *   1. Add a case inside the relevant switch branch below.
 *   2. Document it in the `compound` map in dwcTermInventory.js.
 *
 * To add support for a new NL formatting type altogether:
 *   1. Add a new top-level case in the `nlFormatting` switch.
 *   2. Add the compound map entry in dwcTermInventory.js.
 *   3. Document the available keys in the user documentation.
 *
 * ─── Disambiguation with real sub-columns ────────────────────────────────────
 *
 * NaturaList uses dot notation for structured sub-columns (e.g. origPub.author).
 * The compiler FIRST checks whether the full dotted path exists as a real column
 * header in the checklist.  Only if it does NOT exist does it fall back to
 * compound extraction on the root column.  This extractor is only called after
 * that disambiguation has already taken place; it can safely assume the root
 * column exists and that the component key refers to a virtual sub-value.
 *
 * ─── Note on dwcTermInventory import ─────────────────────────────────────────
 *
 * This file imports dwcTermInventory only for the `isKnownCompoundKey` helper.
 * The `extractCompoundValue` function itself does NOT consult the inventory —
 * it operates purely on the explicit component key provided by the caller.
 */

import dayjs from "dayjs";

/**
 * Check whether a component key is a recognised virtual sub-value for the
 * given NaturaList formatting type.
 *
 * Used by the compiler to distinguish compound extraction requests from
 * references to real (but missing) sub-columns, avoiding spurious warnings.
 *
 * @param {string} nlFormatting  - NaturaList type name, e.g. "geopoint"
 * @param {string} componentKey  - The suffix after the last dot, e.g. "lat"
 * @returns {boolean}
 */
export function isKnownCompoundKey(nlFormatting, componentKey) {
    // note this is a bit dirty, but it centralises the logic for recognising compound keys in one place, 
    // and avoids a dependency on the custom type definitions.
    switch (nlFormatting) {
        case "geopoint":
            return ["lat", "long", "verbatim"].includes(componentKey);
        case "interval":
            return ["from", "to"].includes(componentKey);
        case "taxon":
            return ["name", "authority", "lastNamePart"].includes(componentKey);
        case "date":
            return ["iso8601", "year", "month", "day"].includes(componentKey);
        case "image":
        case "sound":
            return ["source"].includes(componentKey);
        default:
            return false;
    }
}

/**
 * Extract a named component from a NaturaList readData() result.
 *
 * IMPORTANT: The caller is responsible for passing the correct `componentKey`.
 * The key comes from the user's Source column (the suffix after a dot in the
 * data path), not from the DwC term name.  The dwcTermInventory.compound map
 * documents what is available but is NOT consulted here at runtime.
 *
 * @param {string} nlFormatting  - The NaturaList formatting type of the source
 *                                 column, e.g. "geopoint", "interval", "date".
 * @param {string} componentKey  - The component to extract, e.g. "lat", "from",
 *                                 "iso8601", "name", "authority", "lastNamePart".
 * @param {*}      rawValue      - The value returned by customTypeXxx.readData().
 * @param {Object} Logger        - Logger instance for emitting warnings.
 *
 * @returns {*}  The extracted component value.  Returns `rawValue` unchanged
 *               when `nlFormatting` has no compound rules (pass-through case),
 *               or `null` when the component key is recognised but the value is
 *               missing/invalid.
 *
 * ─── Component key reference ─────────────────────────────────────────────────
 *
 *  geopoint  → lat         decimal degrees latitude  (from customTypeGeopoint result.lat)
 *              long        decimal degrees longitude (result.long)
 *              verbatim    original cell string       (result.verbatim)
 *
 *  interval  → from        lower bound  (result[0])
 *              to          upper bound  (result[1])
 *
 *  taxon     → name        taxon name string          (result.name)
 *              authority   authorship string           (result.authority)
 *              lastNamePart  last whitespace-separated token of result.name;
 *                          best-effort specific/infraspecific epithet extraction
 *                          for binomials and trinomials.  Never returns an empty
 *                          string when name is non-empty: falls back to the full
 *                          name if it contains no spaces.
 *
 *  date      → iso8601     YYYY-MM-DD string (from dayjs timestamp)
 *              year        4-digit integer
 *              month       1-based integer (1 = January)
 *              day         day-of-month integer
 *
 *  image     → source      URL/path string  (result.source)
 *  sound     → source      URL/path string  (result.source)
 */
export function extractCompoundValue(nlFormatting, componentKey, rawValue, Logger) {

    // Types with no compound rules → pass through unchanged.
    // This is the expected path for scalar types (text, number, category, etc.).
    const hasCompoundRules = isKnownCompoundKey(nlFormatting, componentKey)
        || ["geopoint", "interval", "taxon", "date", "image", "sound"].includes(nlFormatting);

    if (!hasCompoundRules) {
        // Not a compound type — return rawValue unchanged. Caller decides what to do.
        return rawValue;
    }

    if (rawValue == null) {
        // A null rawValue is normal (missing data); no warning needed here.
        return null;
    }

    switch (nlFormatting) {

        // ── geopoint ─────────────────────────────────────────────────────────
        // rawValue shape: { lat: number, long: number, verbatim: string }
        // (from customTypeGeopoint.readData)
        case "geopoint":
            switch (componentKey) {
                case "lat":      return rawValue.lat  ?? null;
                case "long":     return rawValue.long ?? null;
                case "verbatim": return rawValue.verbatim ?? null;
                default:
                    Logger.warning(
                        `DwC Archive: Unknown component key "<b>${componentKey}</b>" for ` +
                        `geopoint. Known keys: lat, long, verbatim.`,
                        "DwC Archive"
                    );
                    return rawValue;
            }

        // ── interval ─────────────────────────────────────────────────────────
        // rawValue shape: [number, number]   ([from, to])
        // (from customTypeInterval.readData)
        case "interval":
            if (!Array.isArray(rawValue) || rawValue.length !== 2) {
                Logger.warning(
                    `DwC Archive: interval compound extraction expected [from, to] array ` +
                    `but received: ${JSON.stringify(rawValue)}`,
                    "DwC Archive"
                );
                return null;
            }
            switch (componentKey) {
                case "from": return rawValue[0] ?? null;
                case "to":   return rawValue[1] ?? null;
                default:
                    Logger.warning(
                        `DwC Archive: Unknown component key "<b>${componentKey}</b>" for ` +
                        `interval. Known keys: from, to.`,
                        "DwC Archive"
                    );
                    return rawValue;
            }

        // ── taxon ─────────────────────────────────────────────────────────────
        // rawValue shape: { name: string, authority: string }
        // (from customTypeTaxon.readData)
        case "taxon":
            if (typeof rawValue !== "object" || rawValue === null) {
                Logger.warning(
                    `DwC Archive: taxon compound extraction expected an object ` +
                    `but received: ${JSON.stringify(rawValue)}`,
                    "DwC Archive"
                );
                return null;
            }
            switch (componentKey) {
                case "name":
                    return (rawValue.name || "").trim() || null;

                case "authority":
                    return (rawValue.authority || "").trim() || null;

                case "lastNamePart": {
                    // Best-effort extraction of the terminal epithet from a binomial
                    // or trinomial name (e.g. "Litoria aurea" → "aurea",
                    // "Homo sapiens sapiens" → "sapiens").
                    //
                    // This is a SYNTHETIC property: it does not exist in the taxon
                    // readData result and is computed here.  It is designed for use
                    // with dwc:specificEpithet, dwc:infraspecificEpithet, and
                    // dwc:cultivarEpithet in the DwC archive table.
                    //
                    // Edge cases:
                    //   - Single token ("Litoria") → returns "Litoria" (no split possible)
                    //   - Empty name → returns null
                    const name = (rawValue.name || "").trim();
                    if (!name) return null;
                    const tokens = name.split(/\s+/).filter(Boolean);
                    return tokens[tokens.length - 1] || name;
                }

                default:
                    Logger.warning(
                        `DwC Archive: Unknown component key "<b>${componentKey}</b>" for ` +
                        `taxon. Known keys: name, authority, lastNamePart.`,
                        "DwC Archive"
                    );
                    return rawValue;
            }

        // ── date ─────────────────────────────────────────────────────────────
        // rawValue: Unix timestamp in milliseconds (number)
        // (from customTypeDate.readData — returns dayjs.valueOf())
        case "date": {
            if (typeof rawValue !== "number" || isNaN(rawValue)) {
                Logger.warning(
                    `DwC Archive: date compound extraction expected a numeric timestamp ` +
                    `but received: ${JSON.stringify(rawValue)}`,
                    "DwC Archive"
                );
                return null;
            }
            const d = dayjs(rawValue);
            if (!d.isValid()) {
                Logger.warning(
                    `DwC Archive: date value ${rawValue} could not be parsed by dayjs.`,
                    "DwC Archive"
                );
                return null;
            }
            switch (componentKey) {
                case "iso8601": return d.format("YYYY-MM-DD");
                case "year":    return d.year();
                case "month":   return d.month() + 1; // dayjs months are 0-based
                case "day":     return d.date();
                default:
                    Logger.warning(
                        `DwC Archive: Unknown component key "<b>${componentKey}</b>" for ` +
                        `date. Known keys: iso8601, year, month, day.`,
                        "DwC Archive"
                    );
                    return rawValue;
            }
        }

        // ── image / sound ────────────────────────────────────────────────────
        // rawValue shape: { source: string, title: string }
        // (from customTypeImage.readData / customTypeSound.readData)
        case "image":
        case "sound":
            if (typeof rawValue !== "object" || rawValue === null) {
                Logger.warning(
                    `DwC Archive: ${nlFormatting} compound extraction expected an object ` +
                    `but received: ${JSON.stringify(rawValue)}`,
                    "DwC Archive"
                );
                return null;
            }
            switch (componentKey) {
                case "source": return (rawValue.source || "").trim() || null;
                default:
                    Logger.warning(
                        `DwC Archive: Unknown component key "<b>${componentKey}</b>" for ` +
                        `${nlFormatting}. Known keys: source.`,
                        "DwC Archive"
                    );
                    return rawValue;
            }

        // ── Unknown formatting type ───────────────────────────────────────────
        default:
            // Not a compound type at all — return rawValue unchanged.
            // This is not a warning: the caller already checked isKnownCompoundKey
            // before calling this function, so reaching here means the formatting
            // type legitimately has no compound structure.
            return rawValue;
    }
}
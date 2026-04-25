/**
 * DwcValueResolver.js
 *
 * Pure-function module that resolves a single DwC value-source directive
 * against a context object and returns a plain string (or null).
 *
 * No side effects.  No imports from the app UI layer.
 * All data it needs is supplied as arguments via the `context` parameter.
 *
 * Directive types handled:
 *
 *   column: ColName[.sub]                    → read from .d using customType.toDwC()
 *   column: [Block1 {col}], [Block2 {col}]   → [...]-block template: blocks dropped when
 *                                               any {placeholder} inside is empty; junction
 *                                               text between blocks suppressed when either
 *                                               neighbour is dropped; constant text always emitted
 *   config: KEY          → look up KEY in customizationData
 *   auto: TOKEN          → compute from taxonNode / occurrenceEntry
 *   taxa: ColName[.sub]  → read from a named taxon rank's stored value
 *   media: col1, col2#   → resolve media URLs and join with |
 *   (anything else)      → literal constant value, used verbatim
 *
 * ── Logging (no Logger dependency) ───────────────────────────────────────────
 *
 * The resolver never imports Logger.  Instead, callers may supply an optional
 * `ctx.onLog` callback:
 *
 *   ctx.onLog(level: "error"|"warn", message: string) => void
 *
 * If omitted, diagnostics are silently discarded.  The compiler (DwcArchiveCompiler)
 * is responsible for wiring onLog to Logger and for deduplicating messages so
 * that a misconfigured column does not flood the log with one error per row.
 */

// ─── Directive prefix constants ───────────────────────────────────────────────
const PREFIX_COLUMN = "column:";
const PREFIX_CONFIG = "config:";
const PREFIX_AUTO   = "auto:";
const PREFIX_TAXA   = "taxa:";
const PREFIX_MEDIA  = "media:";

// ─── Known auto: tokens (used for error reporting) ───────────────────────────
const AUTO_TOKENS_CHECKLIST   = new Set(["taxonID", "parentNameUsageID", "taxonRank", "scientificName", "scientificNameAuthorship"]);
const AUTO_TOKENS_OCCURRENCES = new Set(["occurrenceID", "taxonRank", "scientificName", "scientificNameAuthorship"]);
const AUTO_TOKENS_ANY         = new Set(["pubDate"]);

// ─── Known taxa: sub-paths (used for error reporting) ────────────────────────
const TAXA_KNOWN_SUBPATHS = new Set(["name", "authority", "lastNamePart"]);

// ─── Pattern for detecting suspicious unknown directive prefixes ──────────────
// Matches 1–10 lowercase letters immediately followed by ":".
// Well-known URL schemes are excluded to avoid false positives on plain-text
// constants like "https://example.org" or "doi:10.1234/foo".
const DIRECTIVE_LIKE_RE = /^([a-z]{1,10}):/;
const URL_SCHEMES = new Set(["http", "https", "ftp", "ftps", "mailto", "urn", "doi", "tel", "file", "data"]);

// ─── Template pattern: column: value that contains [...] blocks ───────────────
const BLOCK_RE = /\[([^\]]*)\]/;

/**
 * @typedef {Object} ResolverContext
 *
 * For CHECKLIST rows:
 * @property {"checklist"|"occurrences"} target
 * @property {import('./DwcTreeExpander.js').TaxonNode} taxonNode
 *   The current checklist taxon node being exported.
 *
 * For OCCURRENCE rows:
 * @property {"checklist"|"occurrences"} target
 * @property {Object} occurrenceEntry
 *   The full compiled checklist entry ({t, d}) for this occurrence row.
 * @property {number} occurrenceLevelIndex
 *   Index in .t that holds the occurrence ID.
 * @property {Array}  taxaColumnDefs
 *   All taxa table rows in declaration order — used for auto:taxonRank and taxa: lookups.
 *
 * Shared:
 * @property {Map<string, Object>}   cddByPath
 *   Map from lowercase column name (e.g. "locality", "collectiondate") to its CDD row.
 *   Must also include "#"-pattern entries for numbered arrays (e.g. "photos#").
 * @property {Object}                customizationData
 *   The already-compiled customization table for the default language as an array
 *   of {item, value} rows. Passed as the raw array; we look up by .item.
 * @property {Object}                dataCustomTypes
 *   The dataCustomTypes map from customTypes/index.js: { text: ..., date: ..., ... }
 * @property {Function}              mediaUrlResolver
 *   (rawSource: string, columnName: string) => string
 *   Callback from DataManager's closure to produce a fully resolved media URL.
 * @property {Function}              [onLog]
 *   Optional diagnostic callback: (level: "error"|"warn", message: string) => void.
 *   The resolver calls this instead of importing Logger, keeping the module
 *   dependency-free.  The compiler is responsible for deduplication so that
 *   per-row errors for a misconfigured column are reported only once.
 */

// ─── Internal logging helper ─────────────────────────────────────────────────

/** @param {ResolverContext} ctx  @param {"error"|"warn"} level  @param {string} msg */
function log(ctx, level, msg) {
    ctx.onLog?.(level, msg);
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Resolve a single value-source directive.
 *
 * @param {string}          directive   Raw value from the "Value source" column
 * @param {ResolverContext} ctx
 * @returns {string|null}  Resolved string, or null if inapplicable / not found
 */
export function resolve(directive, ctx) {
    if (typeof directive !== "string") return null;
    const d = directive.trim();
    if (d === "") return null;

    // ── column: ───────────────────────────────────────────────────────────────
    if (d.startsWith(PREFIX_COLUMN)) {
        const rest = d.slice(PREFIX_COLUMN.length).trim();
        // If the value contains any [...] blocks it is a block-template; otherwise
        // it is a plain column name / subPath accessor.
        if (BLOCK_RE.test(rest)) {
            return resolveBlockTemplate(rest, ctx);
        }
        return resolveColumnName(rest, ctx, /* logMissing */ true);
    }

    // ── config: ───────────────────────────────────────────────────────────────
    if (d.startsWith(PREFIX_CONFIG)) {
        const key = d.slice(PREFIX_CONFIG.length).trim();
        return resolveConfig(key, ctx);
    }

    // ── auto: ─────────────────────────────────────────────────────────────────
    if (d.startsWith(PREFIX_AUTO)) {
        const token = d.slice(PREFIX_AUTO.length).trim();
        return resolveAuto(token, ctx);
    }

    // ── taxa: ─────────────────────────────────────────────────────────────────
    if (d.startsWith(PREFIX_TAXA)) {
        const rest = d.slice(PREFIX_TAXA.length).trim();
        return resolveTaxa(rest, ctx);
    }

    // ── media: ────────────────────────────────────────────────────────────────
    if (d.startsWith(PREFIX_MEDIA)) {
        const rest = d.slice(PREFIX_MEDIA.length).trim();
        return resolveMedia(rest, ctx);
    }

    // ── Literal constant (no recognised prefix) ───────────────────────────────
    // Warn if the value looks like an unknown directive (e.g. "coulmn:foo" is a
    // typo of "column:").  We exclude well-known URL schemes and words longer than
    // 10 characters (those are almost certainly plain text, not typos).
    const prefixMatch = DIRECTIVE_LIKE_RE.exec(d);
    if (prefixMatch) {
        const candidate = prefixMatch[1];
        if (!URL_SCHEMES.has(candidate)) {
            log(ctx, "warn",
                `DwC Value: "${d}" looks like a directive (starts with "${candidate}:") ` +
                `but "${candidate}" is not a known prefix. ` +
                `Known prefixes: column, config, auto, taxa, media. ` +
                `If this is intentional plain text, it will be used verbatim.`
            );
        }
    }

    return d || null;
}

// ─── config: ─────────────────────────────────────────────────────────────────

function resolveConfig(key, ctx) {
    const { customizationData } = ctx;
    if (!key) return null;

    if (!customizationData || !Array.isArray(customizationData)) {
        log(ctx, "error",
            `DwC Value: config: "${key}" — customization data is not available.`
        );
        return null;
    }

    const row = customizationData.find(r => r.item === key);
    if (!row) {
        log(ctx, "error",
            `DwC Value: config: "${key}" — no such item in the Customization table. ` +
            `Check the key spelling; it must match the "Item" column exactly.`
        );
        return null;
    }

    const val = (row.value || "").toString().trim();
    return val || null;
}

// ─── auto: ───────────────────────────────────────────────────────────────────

function resolveAuto(token, ctx) {
    const { target, taxonNode, occurrenceEntry, occurrenceLevelIndex, taxaColumnDefs } = ctx;

    // pubDate is always "today" from the perspective of this export run.
    if (AUTO_TOKENS_ANY.has(token)) {
        if (token === "pubDate") {
            return new Date().toISOString().split("T")[0];
        }
    }

    if (target === "checklist") {
        if (!taxonNode) return null;

        switch (token) {
            case "taxonID":
                return taxonNode.taxonID || null;
            case "parentNameUsageID":
                return taxonNode.parentTaxonID || null;
            case "taxonRank":
                return taxonNode.rankColumnName || null;
            case "scientificName":
                return taxonNode.name || null;
            case "scientificNameAuthorship":
                return taxonNode.authority || null;
            default: {
                // Give a targeted hint when the token is valid for the other target.
                const validForOccurrences = AUTO_TOKENS_OCCURRENCES.has(token);
                log(ctx, "error",
                    `DwC Value: auto: "${token}" is not a recognised token for target "checklist". ` +
                    (validForOccurrences
                        ? `It is valid for "occurrences" — check the "Export to" column.`
                        : `Valid checklist tokens: ${[...AUTO_TOKENS_ANY, ...AUTO_TOKENS_CHECKLIST].join(", ")}.`)
                );
                return null;
            }
        }
    }

    if (target === "occurrences") {
        if (!occurrenceEntry) return null;
        const tArr = occurrenceEntry.t || [];

        switch (token) {
            case "occurrenceID": {
                // The occurrence ID is the name stored at the occurrence rank level
                if (occurrenceLevelIndex < 0) return null;
                const occNode = tArr[occurrenceLevelIndex];
                return occNode ? (occNode.name || null) : null;
            }
            case "taxonRank": {
                // The rank of the deepest non-occurrence taxon level
                const deepestTaxon = findDeepestNonOccurrenceTaxon(tArr, occurrenceLevelIndex, taxaColumnDefs);
                return deepestTaxon ? deepestTaxon.rankColumnName : null;
            }
            case "scientificName": {
                const deepestTaxon = findDeepestNonOccurrenceTaxon(tArr, occurrenceLevelIndex, taxaColumnDefs);
                return deepestTaxon ? deepestTaxon.name : null;
            }
            case "scientificNameAuthorship": {
                const deepestTaxon = findDeepestNonOccurrenceTaxon(tArr, occurrenceLevelIndex, taxaColumnDefs);
                return deepestTaxon ? deepestTaxon.authority : null;
            }
            default: {
                const validForChecklist = AUTO_TOKENS_CHECKLIST.has(token);
                log(ctx, "error",
                    `DwC Value: auto: "${token}" is not a recognised token for target "occurrences". ` +
                    (validForChecklist
                        ? `It is valid for "checklist" — check the "Export to" column.`
                        : `Valid occurrence tokens: ${[...AUTO_TOKENS_ANY, ...AUTO_TOKENS_OCCURRENCES].join(", ")}.`)
                );
                return null;
            }
        }
    }

    return null;
}

/**
 * Walk the .t array backwards to find the last non-null, non-occurrence level.
 * Returns { name, authority, rankColumnName } or null.
 */
function findDeepestNonOccurrenceTaxon(tArr, occurrenceLevelIndex, taxaColumnDefs) {
    for (let i = tArr.length - 1; i >= 0; i--) {
        if (i === occurrenceLevelIndex) continue;
        const node = tArr[i];
        if (node && (node.name || "").trim() !== "") {
            return {
                name: node.name.trim(),
                authority: (node.authority || "").trim(),
                rankColumnName: taxaColumnDefs[i] ? taxaColumnDefs[i].columnName : "",
            };
        }
    }
    return null;
}

// ─── taxa: ───────────────────────────────────────────────────────────────────

/**
 * Resolve taxa:ColName or taxa:ColName.subPath
 * Reads the value stored in the named rank's column from the representative entry.
 */
function resolveTaxa(rest, ctx) {
    // Split on the FIRST dot: "Species.lastNamePart" → ["Species", "lastNamePart"]
    const dotIdx  = rest.indexOf(".");
    const colName = dotIdx === -1 ? rest : rest.slice(0, dotIdx);
    const subPath = dotIdx === -1 ? null  : rest.slice(dotIdx + 1);

    const colNameLo = colName.toLowerCase().trim();
    const { taxaColumnDefs } = ctx;

    // Find the level index for this column name
    const levelIdx = (taxaColumnDefs || []).findIndex(
        row => (row.columnName || "").toLowerCase() === colNameLo
    );
    if (levelIdx === -1) {
        log(ctx, "error",
            `DwC Value: taxa: "${colName}" — no such column in the Taxa table. ` +
            `Available columns: ${(taxaColumnDefs || []).map(r => r.columnName).join(", ")}.`
        );
        return null;
    }

    // Validate sub-path before accessing data — an invalid sub-path is always a
    // configuration error regardless of what data the current row holds.
    if (subPath !== null && !TAXA_KNOWN_SUBPATHS.has(subPath)) {
        log(ctx, "error",
            `DwC Value: taxa: "${rest}" — unknown sub-path ".${subPath}". ` +
            `Known sub-paths: ${[...TAXA_KNOWN_SUBPATHS].join(", ")}.`
        );
        return null;
    }

    // Get the .t array for this entry
    const tArr = ctx.target === "checklist"
        ? (ctx.taxonNode?.t  || [])
        : (ctx.occurrenceEntry?.t || []);

    const taxonAtLevel = tArr[levelIdx];
    if (!taxonAtLevel) return null;

    const name      = (taxonAtLevel.name      || "").trim();
    const authority = (taxonAtLevel.authority  || "").trim();

    if (!subPath) {
        // No sub-path: return the name (the "name" sub-property is the default)
        return name || null;
    }

    switch (subPath.toLowerCase()) {
        case "name":
            return name || null;
        case "authority":
            return authority || null;
        case "lastNamePart": {
            // The last whitespace-delimited token of the name string, nothing if name is a single token
            if (!name) return null;
            const parts = name.trim().split(/\s+/);
            return parts.length > 1 ? parts[parts.length - 1] : null;
        }
        // No default needed: unknown subPath is already caught and returned above.
    }

    return null;
}

// ─── media: ──────────────────────────────────────────────────────────────────

/**
 * Resolve a media: directive.
 * Comma-separated list of column names; trailing # means "expand as array".
 * Returns the resolved URLs joined by |, or null if none.
 */
function resolveMedia(rest, ctx) {
    const parts = rest.split(",").map(s => s.trim()).filter(Boolean);

    if (parts.length === 0) {
        log(ctx, "error",
            `DwC Value: media: directive has no column names. ` +
            `Provide at least one column name after "media:".`
        );
        return null;
    }

    const urls = [];

    const dObj = ctx.target === "checklist"
        ? (ctx.taxonNode?.d || {})
        : (ctx.occurrenceEntry?.d || {});

    for (const part of parts) {
        const expandArray = part.endsWith("#");
        const colBase     = expandArray ? part.slice(0, -1).trim() : part;

        // Validate that the column exists in cddByPath at all (exact or # pattern).
        const cddKeyExact = colBase.toLowerCase();
        const cddKeyHash  = cddKeyExact + "#";
        const colKnown    = ctx.cddByPath?.has(cddKeyExact) || ctx.cddByPath?.has(cddKeyHash);

        if (!colKnown) {
            log(ctx, "error",
                `DwC Value: media: column "${colBase}${expandArray ? "#" : ""}" does not exist ` +
                `in the column definitions. Check the column name spelling.`
            );
            // Continue — collect whatever URLs we can from other parts in the list
            continue;
        }

        if (expandArray) {
            // Expand: colBase1, colBase2, ... until no data found
            let idx = 1;
            while (true) {
                const expandedCol = colBase + idx;
                const val = getValueFromD(dObj, expandedCol);
                if (val === null || val === undefined) break;

                const source = getMediaSource(val);
                if (source) {
                    const resolved = ctx.mediaUrlResolver
                        ? ctx.mediaUrlResolver(source, expandedCol)
                        : source;
                    if (resolved && resolved.trim() !== "") urls.push(resolved.trim());
                }
                idx++;
            }
        } else {
            const val = getValueFromD(dObj, colBase);
            if (val !== null && val !== undefined) {
                const source = getMediaSource(val);
                if (source) {
                    const resolved = ctx.mediaUrlResolver
                        ? ctx.mediaUrlResolver(source, colBase)
                        : source;
                    if (resolved && resolved.trim() !== "") urls.push(resolved.trim());
                }
            }
        }
    }

    return urls.length > 0 ? urls.join("|") : null;
}

/**
 * Extract a source string from a media data value.
 * Media objects have a `.source` property; strings are returned as-is.
 */
function getMediaSource(val) {
    if (!val) return null;
    if (typeof val === "string") return val.trim() || null;
    if (typeof val === "object" && val.source) return String(val.source).trim() || null;
    return null;
}

// ─── column: [...]-block template ────────────────────────────────────────────

/**
 * Resolve a column: template that uses [...]-block notation.
 *
 * Grammar (after the "column:" prefix has been stripped):
 *   value = ( constantText | block )*
 *   block = "[" innerText "]"
 *
 * Rules:
 *  - Constant text outside any [...] is always emitted.
 *  - A [...] block is dropped entirely when any {placeholder} inside it
 *    resolves to empty for this row.
 *  - Junction text that sits between two [...] blocks is suppressed when
 *    either of its neighbouring blocks is dropped.
 *
 * Example: "[Country: {country}], [Province: {province}]"
 *   country="Laos", province=""  →  "Country: Laos"
 *   country="Laos", province="X" →  "Country: Laos, Province: X"
 */
function resolveBlockTemplate(value, ctx) {
    // Tokenise into a flat list of { type: "const"|"block", text } tokens.
    // We scan character by character to preserve junction text precisely.
    const tokens = [];
    let i = 0;
    while (i < value.length) {
        if (value[i] === "[") {
            const end = value.indexOf("]", i);
            if (end === -1) {
                // Unclosed bracket — treat remainder as constant
                tokens.push({ type: "const", text: value.slice(i) });
                break;
            }
            tokens.push({ type: "block", text: value.slice(i + 1, end) });
            i = end + 1;
        } else {
            // Accumulate constant text up to the next "[" or end
            const next = value.indexOf("[", i);
            const end  = next === -1 ? value.length : next;
            tokens.push({ type: "const", text: value.slice(i, end) });
            i = end;
        }
    }

    // Resolve each block (substitute placeholders; null → dropped).
    const resolved = tokens.map(tok => {
        if (tok.type === "const") return { kind: "const", text: tok.text };
        const substituted = substituteBlock(tok.text, ctx);
        return { kind: "block", text: substituted }; // text === null means dropped
    });

    // Build output: emit constants always, but suppress a "const" that sits
    // strictly between two blocks when either neighbour block was dropped.
    let output = "";
    for (let j = 0; j < resolved.length; j++) {
        const tok = resolved[j];

        if (tok.kind === "block") {
            if (tok.text !== null) output += tok.text;
            continue;
        }

        // "const" token — check if it is junction text between two blocks
        const prevBlock = findNearestBlock(resolved, j, -1);
        const nextBlock = findNearestBlock(resolved, j, +1);

        const isJunction = prevBlock !== null && nextBlock !== null;
        if (isJunction && (prevBlock.text === null || nextBlock.text === null)) {
            // Suppress junction: one or both neighbours were dropped
            continue;
        }

        output += tok.text;
    }

    return output.trim() || null;
}

/** Find the nearest block token in direction (+1 or -1), skipping other consts. */
function findNearestBlock(resolved, from, direction) {
    let j = from + direction;
    while (j >= 0 && j < resolved.length) {
        if (resolved[j].kind === "block") return resolved[j];
        j += direction;
    }
    return null;
}

/**
 * Substitute all {placeholder} references inside a single [...] block's inner text.
 * Returns the substituted string, or null if any placeholder resolved to empty.
 * Column-existence errors are reported via resolveColumnName (logMissing=true).
 */
function substituteBlock(innerText, ctx) {
    const placeholderRe = /\{([^}]+)\}/g;
    let result = innerText;
    let match;

    // Reset lastIndex since we reuse the regex
    placeholderRe.lastIndex = 0;

    const placeholders = [];
    while ((match = placeholderRe.exec(innerText)) !== null) {
        placeholders.push({ full: match[0], key: match[1].trim() });
    }

    for (const ph of placeholders) {
        const val = resolveColumnName(ph.key, ctx, /* logMissing */ true);
        if (!val || val.trim() === "") return null; // block is dropped
        result = result.replace(ph.full, val);
    }

    return result;
}

// ─── column: (plain name or sub-path) ────────────────────────────────────────

/**
 * Resolve a column name (optionally with a dot-subPath like "eventDate.ymd").
 * Called after the "column:" prefix has been stripped, or internally by the
 * block-template substitution for individual {placeholder} keys.
 * Looks up the data in .d using the customType.toDwC() method.
 *
 * @param {string}          directive   Column name, optionally with dot-subPath
 * @param {ResolverContext} ctx
 * @param {boolean}         logMissing  When true, emit an error if the base column
 *                                      does not exist in cddByPath at all, and emit
 *                                      an error if a subPath yields null despite the
 *                                      raw data being present (likely a bad subPath).
 *                                      Pass false when the existence check is handled
 *                                      by the caller to avoid duplicate messages.
 */
function resolveColumnName(directive, ctx, logMissing = false) {
    const d = directive.trim();
    if (!d) return null;

    // Split on the LAST dot to get basePath and subPath.
    // "collectionDate.ymd" → basePath="collectionDate", subPath="ymd"
    // "collectedAt.lat"    → basePath="collectedAt",    subPath="lat"
    // "locality"           → basePath="locality",        subPath=null
    const lastDot = d.lastIndexOf(".");
    const basePath = lastDot === -1 ? d : d.slice(0, lastDot);
    const subPath  = lastDot === -1 ? null : d.slice(lastDot + 1);

    const dObj = ctx.target === "checklist"
        ? (ctx.taxonNode?.d || {})
        : (ctx.occurrenceEntry?.d || {});

    // ── Column existence check ────────────────────────────────────────────────
    // Only report an error if the column is completely absent from cddByPath.
    // A column that exists but has no value for this row is not a configuration
    // error and must not be logged (the resolver simply returns null).
    if (logMissing && ctx.cddByPath) {
        const basePathLo = basePath.toLowerCase();
        const known = ctx.cddByPath.has(basePathLo)
            || ctx.cddByPath.has(basePathLo + "#"); // numbered-array pattern fallback
        if (!known) {
            log(ctx, "error",
                `DwC Value: column: "${basePath}" — no such column in the column definitions. ` +
                `Check the column name spelling.`
            );
            return null;
        }
    }

    const rawData = getValueFromD(dObj, basePath);

    // Look up the CDD row to find the dataType
    const cddRow  = ctx.cddByPath?.get(basePath.toLowerCase());
    const dataType = (cddRow?.dataType || "text").toLowerCase().split(/\s+/)[0]; // handle "list text"

    const customType = ctx.dataCustomTypes?.[dataType];

    if (!customType || typeof customType.toDwC !== "function") {
        // Fallback: return as plain string
        if (rawData === null || rawData === undefined) return null;
        const s = String(rawData).trim();
        return s || null;
    }

    const result = customType.toDwC(rawData, subPath);

    // ── Sub-path validation ───────────────────────────────────────────────────
    // If a subPath was requested but toDwC returned null despite rawData being
    // present, the subPath is likely invalid for this column type.  Report it
    // so the user can distinguish a bad sub-path from an empty cell.
    if (subPath !== null && result === null && rawData !== null && rawData !== undefined && logMissing) {
        log(ctx, "error",
            `DwC Value: column: "${d}" — sub-path ".${subPath}" returned no value for ` +
            `column "${basePath}" (type: ${dataType}). The sub-path may be invalid for this type.`
        );
    }

    if (result === null || result === undefined) return null;
    const s = String(result).trim();
    return s || null;
}

// ─── Helper: read from a .d object by dot-path ───────────────────────────────

/**
 * Read a value from a compiled .d object by a simple dot-path string.
 * Only handles dot-separated segments; does not handle # array notation here
 * since for DwC column-name directives the column name is the root key.
 *
 * @param {Object} dObj
 * @param {string} path  e.g. "locality", "collectedAt" (no sub-path)
 * @returns {any}
 */
function getValueFromD(dObj, path) {
    if (!dObj || !path) return null;
    const segments = path.toLowerCase().split(".");
    let current = dObj;
    for (const seg of segments) {
        if (current === null || current === undefined) return null;
        // Try exact key first, then lowercase
        if (Object.prototype.hasOwnProperty.call(current, seg)) {
            current = current[seg];
        } else {
            // Try case-insensitive lookup on the object
            const key = Object.keys(current).find(k => k.toLowerCase() === seg);
            if (key === undefined) return null;
            current = current[key];
        }
    }
    return current === undefined ? null : current;
}
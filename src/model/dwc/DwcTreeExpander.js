/**
 * DwcTreeExpander.js
 *
 * Expands the flat compiled checklist entries (each with a `.t` array of
 * rank-level taxon objects) into an ordered list of unique taxon tree nodes,
 * suitable for writing as rows into a Darwin Core checklist CSV.
 *
 * Each node in the output represents a unique position in the taxonomy tree.
 * Its `taxonID` is a UUID v5 derived deterministically from the full lineage
 * string, so it remains stable across re-exports as long as taxon names and
 * authorities are unchanged.
 *
 * The namespace UUID used for all taxonID derivations is fixed and project-
 * independent so that the same taxon in two different NaturaList projects
 * produces the same UUID (consistent with DwC best practice for stable
 * globally-scoped identifiers when a DOI or LSID is not available).
 */

// ─── UUID v5 implementation (no external dependency) ─────────────────────────
// RFC 4122 §4.3 - name-based UUID using SHA-1.
// We ship a minimal pure-JS SHA-1 rather than relying on the SubtleCrypto API
// because this code may be called synchronously in the compiler loop.

/**
 * Compute a SHA-1 digest of a UTF-8 string.
 * Returns a Uint8Array of 20 bytes.
 * @param {string} message
 * @returns {Uint8Array}
 */
function sha1(message) {
    // Encode message as UTF-8 bytes
    const msgBytes = [];
    for (let i = 0; i < message.length; i++) {
        const code = message.charCodeAt(i);
        if (code < 0x80) {
            msgBytes.push(code);
        } else if (code < 0x800) {
            msgBytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0xd800 || code >= 0xe000) {
            msgBytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        } else {
            // Surrogate pair
            const next = message.charCodeAt(++i);
            const cp = 0x10000 + ((code & 0x3ff) << 10) + (next & 0x3ff);
            msgBytes.push(
                0xf0 | (cp >> 18),
                0x80 | ((cp >> 12) & 0x3f),
                0x80 | ((cp >> 6) & 0x3f),
                0x80 | (cp & 0x3f)
            );
        }
    }

    const msgLen = msgBytes.length;
    // Padding
    msgBytes.push(0x80);
    while ((msgBytes.length % 64) !== 56) msgBytes.push(0x00);
    // Message length in bits as 64-bit big-endian
    const bitLen = msgLen * 8;
    for (let s = 56; s >= 0; s -= 8) msgBytes.push((bitLen / Math.pow(2, s)) & 0xff);

    // Initial hash values
    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;

    function rotl(v, n) { return ((v << n) | (v >>> (32 - n))) >>> 0; }
    function add(...args) { return args.reduce((a, b) => (a + b) >>> 0, 0); }

    for (let i = 0; i < msgBytes.length; i += 64) {
        const w = new Uint32Array(80);
        for (let j = 0; j < 16; j++) {
            w[j] = (msgBytes[i + j * 4] << 24) | (msgBytes[i + j * 4 + 1] << 16) |
                   (msgBytes[i + j * 4 + 2] << 8) | msgBytes[i + j * 4 + 3];
        }
        for (let j = 16; j < 80; j++) w[j] = rotl(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);

        let a = h0, b = h1, c = h2, d = h3, e = h4;
        for (let j = 0; j < 80; j++) {
            let f, k;
            if (j < 20)      { f = (b & c) | (~b & d); k = 0x5A827999; }
            else if (j < 40) { f = b ^ c ^ d;           k = 0x6ED9EBA1; }
            else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
            else             { f = b ^ c ^ d;           k = 0xCA62C1D6; }
            const temp = add(rotl(a, 5), f, e, k, w[j]);
            e = d; d = c; c = rotl(b, 30); b = a; a = temp;
        }
        h0 = add(h0, a); h1 = add(h1, b); h2 = add(h2, c); h3 = add(h3, d); h4 = add(h4, e);
    }

    const result = new Uint8Array(20);
    [h0, h1, h2, h3, h4].forEach((h, i) => {
        result[i * 4]     = (h >>> 24) & 0xff;
        result[i * 4 + 1] = (h >>> 16) & 0xff;
        result[i * 4 + 2] = (h >>> 8)  & 0xff;
        result[i * 4 + 3] = h          & 0xff;
    });
    return result;
}

/**
 * Generate a UUID v5 from a namespace UUID string and a name string.
 *
 * @param {string} namespaceUuid  - The namespace as a UUID string
 *                                  (e.g. "6ba7b810-9dad-11d1-80b4-00c04fd430c8")
 * @param {string} name           - The name to hash into the UUID
 * @returns {string} UUID v5 string in canonical 8-4-4-4-12 hex format
 */
function uuidV5(namespaceUuid, name) {
    // Parse namespace UUID bytes (strip hyphens)
    const hex = namespaceUuid.replace(/-/g, "");
    const nsBytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) nsBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);

    // Encode name as UTF-8 bytes
    const nameBytes = [];
    for (let i = 0; i < name.length; i++) {
        const code = name.charCodeAt(i);
        if (code < 0x80) nameBytes.push(code);
        else if (code < 0x800) nameBytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        else nameBytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }

    // Concatenate namespace bytes and name bytes, then hash
    const combined = String.fromCharCode(...nsBytes) + String.fromCharCode(...nameBytes);
    const hash = sha1(combined);

    // Set version 5 bits
    hash[6] = (hash[6] & 0x0f) | 0x50;  // version 5
    hash[8] = (hash[8] & 0x3f) | 0x80;  // variant bits

    // Format as UUID string
    const h = Array.from(hash).map(b => b.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

// Fixed namespace UUID for NaturaList DwC taxon IDs.
// This UUID was generated once and is hardcoded to ensure cross-project stability.
const NATURALIST_DWC_NAMESPACE = "a3e4b812-4f1c-5d9a-8e2f-1c7b3d6a0e95";

/**
 * Derives a stable taxonID UUID from the full lineage key string.
 * @param {string} lineageKey
 * @returns {string}
 */
export function deriveTaxonId(lineageKey) {
    return uuidV5(NATURALIST_DWC_NAMESPACE, lineageKey);
}

// ─── Tree Expansion ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} TaxonNode
 * @property {string}  taxonID          - UUID v5 derived from full lineage key
 * @property {string}  parentTaxonID    - UUID v5 of parent node, "" for roots
 * @property {number}  level            - Zero-based index into the .t array
 * @property {string}  rankColumnName   - Column name as defined in Taxa table (e.g. "Species")
 * @property {string}  name             - Taxon name at this level
 * @property {string}  authority        - Authority string at this level (may be "")
 * @property {Object}  d                - The `.d` custom-data object from the first
 *                                        representative compiled entry for this node.
 *                                        Used by DwcValueResolver for column-name directives.
 * @property {Array}   t                - Full `.t` array of the representative entry.
 *                                        Used by DwcValueResolver for taxa: directives.
 */

/**
 * Expand a compiled checklist (array of {t, d} entries) into an ordered list
 * of unique taxon tree nodes for checklist CSV export.
 *
 * Occurrence rows (entries whose `.t` array has a non-null value at
 * `occurrenceLevelIndex`) are silently skipped - they belong to the occurrence
 * archive, not the checklist.
 *
 * @param {Array<{t: Array, d: Object}>} compiledEntries
 *   Entries from compiledChecklistCache.versions[langCode].dataset.checklist
 * @param {Array<{columnName: string, taxonName: string}>} taxaColumnDefs
 *   Rows from data.sheets.content.tables.taxa.data[langCode], in declaration order
 * @param {number} occurrenceLevelIndex
 *   The index in `.t` that holds the occurrence ID (-1 when there are no occurrences)
 * @returns {TaxonNode[]} Ordered flat list of taxon nodes in tree order
 */
export function expandToTaxonNodes(compiledEntries, taxaColumnDefs, occurrenceLevelIndex) {
    // nodeMap: lineageKey → TaxonNode, preserving first-seen order
    const nodeMap = new Map();

    // Track insertion order explicitly (Map preserves insertion order in JS)
    // We process in the order entries appear in the compiled checklist, which
    // DataManager has already sorted by taxon columns.

    for (const entry of compiledEntries) {
        const tArr = entry.t || [];

        // Skip occurrence rows
        if (occurrenceLevelIndex >= 0 && tArr[occurrenceLevelIndex] != null &&
            (tArr[occurrenceLevelIndex].name || "").trim() !== "") {
            continue;
        }

        // Walk each rank level and build/find nodes
        let parentLineageKey = null;

        for (let level = 0; level < taxaColumnDefs.length; level++) {
            const taxonDef = taxaColumnDefs[level];

            // Skip the occurrence rank itself
            if (level === occurrenceLevelIndex) continue;

            const taxonAtLevel = tArr[level];
            if (!taxonAtLevel || (taxonAtLevel.name || "").trim() === "") {
                // This entry's taxonomy ends before this level
                break;
            }

            const name      = (taxonAtLevel.name      || "").trim();
            const authority = (taxonAtLevel.authority  || "").trim();

            // Build the lineage key: chain from level 0 up to this level,
            // encoded as "name|authority" segments joined by § so that
            // two taxa with the same name but different authorities at the
            // same rank get different IDs.
            const segmentStr = name + "|" + authority;
            const lineageKey = parentLineageKey !== null
                ? parentLineageKey + "§" + segmentStr
                : segmentStr;

            if (!nodeMap.has(lineageKey)) {
                const taxonID       = deriveTaxonId(lineageKey);
                const parentTaxonID = parentLineageKey !== null
                    ? deriveTaxonId(parentLineageKey)
                    : "";

                /** @type {TaxonNode} */
                const node = {
                    taxonID,
                    parentTaxonID,
                    level,
                    rankColumnName: taxonDef.columnName,
                    name,
                    authority,
                    d: entry.d,   // representative data row
                    t: entry.t,   // representative .t array for taxa: directives
                };

                nodeMap.set(lineageKey, node);
            }
            // else: node already exists; we intentionally don't overwrite d/t
            // so the first-seen representative entry's data is used.

            parentLineageKey = lineageKey;
        }
    }

    return Array.from(nodeMap.values());
}

/**
 * Find the index in the taxaColumnDefs array that corresponds to the
 * occurrence rank (where taxonName === OCCURRENCE_IDENTIFIER, case-insensitive).
 *
 * @param {Array<{columnName: string, taxonName: string}>} taxaColumnDefs
 * @param {string} occurrenceIdentifier  - e.g. "occurrence"
 * @returns {number}  Index, or -1 if no occurrence rank is defined
 */
export function findOccurrenceLevelIndex(taxaColumnDefs, occurrenceIdentifier) {
    const target = occurrenceIdentifier.toLowerCase();
    return taxaColumnDefs.findIndex(
        row => (row.taxonName || "").trim().toLowerCase() === target
    );
}
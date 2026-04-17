/**
 * DwcArchiveCompiler.js
 *
 * Produces Darwin Core Archive (DwC-A) ZIP files from a compiled NaturaList
 * checklist. Generates:
 *   - taxa_dwca.zip         - Tier 1: taxa.csv + meta.xml + eml.xml
 *   - occurrences_dwca.zip  - Tier 2 (when `basisOfRecord` row present):
 *                             occurrences.csv + meta.xml + eml.xml
 *
 * ─── Taxon column name resolution (.name sub-column pattern) ─────────────────
 *
 * NaturaList allows taxa columns to store the name in a `.name` sub-column
 * (e.g. "Species" definition column → actual header "Species.name").  The
 * compiler handles this transparently:
 *
 *   taxaColHeaderIndices  tries exact name first, then "columnName.name"
 *   taxa: directive       same fallback for no-component access
 *   taxa: component path  handled via customTypeTaxon.readData which already
 *                         implements the .name fallback internally
 *
 * ─── Rank guard for taxa: directives ─────────────────────────────────────────
 *
 * When a `taxa:Column.component` directive is processed for a taxon at a
 * HIGHER rank than Column, the result is always "" - a genus row should not
 * inherit the species epithet just because its representative raw row happens
 * to be a species row.  The guard compares the referenced column's position in
 * the taxa hierarchy against the current taxon's rank index.
 *
 * ─── Compound extraction - explicit component keys ───────────────────────────
 *
 *   location.lat              → decimalLatitude
 *   location.long             → decimalLongitude
 *   location.verbatim         → verbatimCoordinates
 *   altitude.from             → minimumElevationInMeters
 *   altitude.to               → maximumElevationInMeters
 *   collectionDate.iso8601    → eventDate
 *   collectionDate.year       → year
 *   taxa:Species.authority    → scientificNameAuthorship
 *   taxa:Species.lastNamePart → specificEpithet
 *   taxa:Species.name         → scientificName (explicit)
 *
 * Disambiguation: exact header lookup wins; compound path applies only when
 * the full dotted path is NOT an existing header AND the suffix is a known
 * compound key for the root column's NL type.
 *
 * ─── EML - Option C Hybrid ───────────────────────────────────────────────────
 *
 * Priority:
 *   1. Customization item "Custom eml.xml location" → fetch from usercontent/ (error if fails)
 *   2. usercontent/eml.xml auto-discovery   → Logger.info if found and used
 *   3. eml: rows in the DwC archive table   → minimal EML built from them
 *      Required when using this path: at least one creator name field must be present
 *   4. None of the above                    → Logger.error, export continues
 *      without eml.xml (GBIF will reject but archive is still produced)
 *
 * ─── Auto directives ─────────────────────────────────────────────────────────
 *
 *   auto:taxonID              → UUID v5 from institutionCode:collectionCode:name:rank
 *   auto:parentNameUsageID    → taxonID of the immediate parent in the hierarchy
 *   auto:taxonRank            → DwC rank vocabulary value from the column name
 *   auto:scientificName       → current taxon's own name at its rank level
 *   auto:scientificNameAuthorship → authority from the rankColumn.authority sub-column
 *   auto:occurrenceID         → occurrence-only; warn if used in taxon rows
 *
 * ─── Sampling Event (Tier 3) ─────────────────────────────────────────────────
 *
 * samplingProtocol / eventID rows are recognised and skipped with a warning.
 * No table changes will be needed when Tier 3 is implemented.
 * There are currently no plans to implement Tier 3 in v1, but the term inventory and compiler are designed to allow it to be added in a future update without breaking changes.
 *
 * External dependency: jszip (npm install jszip)
 */

import JSZip from "jszip";
import { getDwcTerm, normalizeLicense, getLicenseLabel } from "./dwcTermInventory.js";
import { extractCompoundValue, isKnownCompoundKey } from "./dwcCompoundExtractor.js";
import { getAvailableDataTypeNames, loadDataByType } from "../customTypes/index.js";
import { Logger } from "../../components/Logger.js";
import { OCCURRENCE_IDENTIFIER } from "../nlDataStructureSheets.js";
import { relativeToUsercontent, absoluteUsercontent } from "../../components/Utils.js";

// ═══════════════════════════════════════════════════════════════════════════════
// UUID v5 - self-contained, no external dependency (RFC 4122 §4.3)
// ═══════════════════════════════════════════════════════════════════════════════

const UUID_NS_TAXON = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const UUID_NS_OCCURRENCE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

function _uuidToBytes(uuid) {
  const hex = uuid.replace(/-/g, "");
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return b;
}
function _bytesToUuid(b) {
  const h = Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
async function uuidV5(ns, name) {
  const nsB = _uuidToBytes(ns);
  const nB = new TextEncoder().encode(name);
  const buf = new Uint8Array(nsB.length + nB.length);
  buf.set(nsB); buf.set(nB, nsB.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", buf));
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return _bytesToUuid(hash.slice(0, 16));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CSV utilities
// ═══════════════════════════════════════════════════════════════════════════════

function _csvField(v) {
  const s = (v === null || v === undefined) ? "" : String(v);
  return (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r"))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}
function buildCsvString(columns, rows) {
  const lines = [columns.map(_csvField).join(",")];
  for (const row of rows) lines.push(columns.map(c => _csvField(row[c] ?? "")).join(","));
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// meta.xml generation
// ═══════════════════════════════════════════════════════════════════════════════

function buildMetaXml(fieldUris, rowType, dataFile) {
  const fields = fieldUris
    .map((uri, i) => uri ? `    <field index="${i}" term="${uri}"/>` : null)
    .filter(Boolean).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<archive xmlns="http://rs.tdwg.org/dwc/text/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://rs.tdwg.org/dwc/text/ http://rs.tdwg.org/dwc/text/tdwg_dwc_text.xsd">
  <core encoding="UTF-8" fieldsTerminatedBy="," linesTerminatedBy="&#13;&#10;"
        fieldsEnclosedBy="&quot;" ignoreHeaderLines="1"
        rowType="${rowType}">
    <files><location>${dataFile}</location></files>
    <id index="0"/>
${fields}
  </core>
</archive>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EML fetch helper - Option C hybrid
//
// Tries to load an eml.xml file from the usercontent folder.
// Returns the file contents as a string, or null if not found/failed.
// Path traversal is prevented by verifying the resolved URL stays within base.
// ═══════════════════════════════════════════════════════════════════════════════

async function tryFetchEml(relativePath) {
  try {
    // Build the usercontent base URL from the current page location
    const base = new URL(
      "usercontent/",
      window.location.origin + window.location.pathname
    ).href;

    // Resolve the path relative to usercontent/ and validate it stays within
    const url = new URL(relativePath, base).href;
    if (!url.startsWith(base)) {
      Logger.error(
        `DwC Archive: EML path "<b>${relativePath}</b>" resolves outside the usercontent/ ` +
        `directory. Paths containing "../" or starting with "/" are not allowed.`,
        "DwC Archive"
      );
      return null;
    }

    const resp = await fetch(url);

    // 1. Check standard HTTP status
    if (!resp.ok) return null;

    // 2. Guard against SPA "Soft 404" fallback pages
    const contentType = resp.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
      return null;
    }

    return await resp.text();
  } catch (_) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// eml.xml generation - minimal GBIF-valid EML 2.1.1
// ═══════════════════════════════════════════════════════════════════════════════

function buildEmlXml(opts) {
  const e = s => (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

  const c = opts.creator || {};

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

  const geoCoverage = opts.geographicDescription
    ? `    <coverage>\n      <geographicCoverage>\n` +
    `        <geographicDescription>${e(opts.geographicDescription)}</geographicDescription>\n` +
    `      </geographicCoverage>\n    </coverage>\n` : "";

  const taxCoverage = opts.taxonomicDescription
    ? `    <coverage>\n      <taxonomicCoverage>\n` +
    `        <generalTaxonomicCoverage>${e(opts.taxonomicDescription)}</generalTaxonomicCoverage>\n` +
    `      </taxonomicCoverage>\n    </coverage>\n` : "";

  const tempCoverage = opts.temporalDescription
    ? `    <coverage>\n      <temporalCoverage>\n` +
    `        <singleDateTime><calendarDate>${e(opts.temporalDescription)}</calendarDate></singleDateTime>\n` +
    `      </temporalCoverage>\n    </coverage>\n` : "";

  // intellectualRights: use a human-readable label if available, else the URI
  const licenseText = opts.licenseLabel || opts.license || "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<eml:eml xmlns:eml="eml://ecoinformatics.org/eml-2.1.1"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="eml://ecoinformatics.org/eml-2.1.1 http://rs.gbif.org/schema/eml-gbif-profile/1.1/eml.xsd"
         packageId="${e(opts.packageId)}"
         system="http://gbif.org"
         scope="system"
         xml:lang="${e(opts.language)}">
  <dataset>
    <title xml:lang="${e(opts.language)}">${e(opts.title)}</title>
${creatorBlock}${metadataProviderBlock}<pubDate>${e(opts.pubDate)}</pubDate>
    <language>${e(opts.language)}</language>
    <abstract><para>${e(opts.abstract)}</para></abstract>
${geoCoverage}${taxCoverage}${tempCoverage}    <intellectualRights>
      <para><ulink url="${e(opts.license)}"><citetitle>${e(licenseText)}</citetitle></ulink></para>
    </intellectualRights>${contactBlock}
  </dataset>
</eml:eml>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Markdown stripping
// ═══════════════════════════════════════════════════════════════════════════════

function stripMarkdown(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*{1,2}|_{1,2})(.*?)\1/gs, "$2")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/^>\s+/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Source column directive parsing
//
//   config:Checklist name      → { type:"config",   value:"Checklist name",  component:null }
//   eml:creator.email          → { type:"eml",      value:"creator.email",   component:null }
//   auto:taxonRank             → { type:"auto",      value:"taxonRank",       component:null }
//   taxa:Species               → { type:"taxa",      value:"Species",         component:null }
//   taxa:Species.authority     → { type:"taxa",      value:"Species",         component:"authority" }
//   {redlist} | Notes: {notes} → { type:"template",  value:(raw string),      component:null }
//   altitude.from              → { type:"column",    value:"altitude.from",   component:null }
//   recordedBy                 → { type:"column",    value:"recordedBy",      component:null }
//   (blank)                    → { type:"empty",     value:"",                component:null }
//
// For `column` type, compound-path detection happens later in resolveColumnValue.
// ═══════════════════════════════════════════════════════════════════════════════

function parseSourceDirective(raw) {
  const s = (raw || "").toString().trim();
  if (!s) return { type: "empty", value: "", component: null };
  const lo = s.toLowerCase();

  if (lo.startsWith("config:")) return { type: "config", value: s.slice(7).trim(), component: null };
  if (lo.startsWith("eml:")) return { type: "eml", value: s.slice(4).trim(), component: null };
  if (lo.startsWith("auto:")) return { type: "auto", value: s.slice(5).trim(), component: null };

  if (lo.startsWith("taxa:")) {
    const rest = s.slice(5).trim();
    const dot = rest.indexOf(".");
    if (dot >= 0) {
      return { type: "taxa", value: rest.slice(0, dot).trim(), component: rest.slice(dot + 1).trim() || null };
    }
    return { type: "taxa", value: rest, component: null };
  }

  if (lo.startsWith("media:")) return { type: "media", value: s.slice(6).trim(), component: null };

  if (s.includes("{")) return { type: "template", value: s, component: null };
  return { type: "column", value: s, component: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// config: directive resolver
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve a config: directive and return { value, found } so the caller can
 * distinguish "item missing" from "item present but empty".
 */
function resolveConfigDirective(itemName, customizationRows) {
  if (!Array.isArray(customizationRows) || !itemName) return { value: "", found: false };
  const target = itemName.toLowerCase();
  const found = customizationRows.find(r => (r.item || "").toLowerCase() === target);
  if (!found) return { value: "", found: false };
  return { value: (found.value || "").toString().trim(), found: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NL column formatting lookup
// ═══════════════════════════════════════════════════════════════════════════════

function getNlFormatting(columnName, cddRows, taxaColumnDefs) {
  const lo = columnName.toLowerCase();
  if (Array.isArray(cddRows)) {
    const r = cddRows.find(r => (r.columnName || "").toLowerCase() === lo);
    if (r) return ((r.formatting || "text").trim().toLowerCase().split(/\s+/)[0]) || "text";
  }
  if (Array.isArray(taxaColumnDefs)) {
    if (taxaColumnDefs.some(r => (r.columnName || "").toLowerCase() === lo)) return "taxon";
  }
  return "text";
}

// ═══════════════════════════════════════════════════════════════════════════════
// Output format coercion
// ═══════════════════════════════════════════════════════════════════════════════

function coerceOutputFormat(value, outputFormat, termName, nlFormatting, rangeSpec) {
  if (value === null || value === undefined || value === "") return "";
  switch (outputFormat) {
    case "integer": {
      const n = parseFloat(String(value));
      if (isNaN(n)) return "";
      const r = Math.round(n);
      if (termName === "individualCount" && n !== r)
        Logger.warning(`DwC Archive: <b>individualCount</b> "${value}" rounded to ${r}.`, "DwC Archive");
      return r;
    }
    case "decimal": {
      const n = parseFloat(String(value));
      if (isNaN(n)) return "";
      if (rangeSpec && (n < rangeSpec.min || n > rangeSpec.max))
        Logger.warning(`DwC Archive: <b>${termName}</b> value ${n} outside range [${rangeSpec.min},${rangeSpec.max}].`, "DwC Archive");
      return n;
    }
    case "iso8601date": return String(value);
    case "string":
    default:
      return nlFormatting === "markdown" ? stripMarkdown(String(value)) : String(value);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Template rendering  ({col1} prefix | Label: {col2})
// ═══════════════════════════════════════════════════════════════════════════════

function renderTemplate(template, resolveCol) {
  const parts = [];
  for (const seg of template.split("|")) {
    const trimmed = seg.trim();
    const refs = [...trimmed.matchAll(/\{([^}]+)\}/g)];
    let rendered = trimmed, ok = true;
    for (const m of refs) {
      const v = (resolveCol(m[1].trim()) || "").toString().trim();
      if (!v) { ok = false; break; }
      rendered = rendered.replace(m[0], v);
    }
    if (ok && rendered.trim()) parts.push(rendered.trim());
  }
  return parts.join(" | ");
}

// ═══════════════════════════════════════════════════════════════════════════════
// taxonRank from column name
// ═══════════════════════════════════════════════════════════════════════════════

function columnNameToRankVocab(columnName) {
  const lo = columnName.toLowerCase().trim();
  const vocab = getDwcTerm("taxonRank")?.vocabulary || [];
  if (vocab.includes(lo)) return lo;
  const aliases = {
    "ssp": "subspecies", "ssp.": "subspecies", "var": "variety", "var.": "variety",
    "sp": "species", "sp.": "species", "gen": "genus", "fam": "family",
    "ord": "order", "cl": "class",
  };
  if (aliases[lo]) return aliases[lo];
  Logger.warning(
    `DwC Archive: Taxa column "<b>${columnName}</b>" does not match a standard DwC taxonRank ` +
    `value. Using lowercased name "${lo}". Rename to a standard rank for GBIF compliance.`,
    "DwC Archive"
  );
  return lo;
}

/**
 * Expand a single NL media data-path specification into a sorted list of actual
 * checklist header strings.
 *
 * NaturaList represents array columns by appending sequential integers to a base
 * name (e.g. the data-path "lifePhotos#" maps to actual spreadsheet columns
 * "lifePhotos1", "lifePhotos2", …).  The `media:` directive accepts both plain
 * column names and these "#" array paths; this function performs the expansion.
 *
 * Two cases:
 *
 *   Plain path  "specimenPhoto"
 *     → returns ["specimenphoto"] if that header exists, or [] if absent.
 *       The caller emits a warning for the missing-header case.
 *
 *   Array path  "lifePhotos#"  or  "mediacluster.images#"
 *     → strips the trailing "#", scans checklistHeadersLo for every header
 *       whose name equals the base followed only by digits, and returns them
 *       sorted numerically by that suffix.
 *       Returns [] when no numbered columns are found (dataset may be empty
 *       for those items; caller emits a Logger.info, not a warning).
 *
 * All comparisons are case-insensitive; the returned strings are the
 * lowercased header names exactly as they appear in checklistHeadersLo.
 *
 * @param {string}   path                 - A single data path, already trimmed.
 *                                          e.g. "specimenPhoto" or "lifePhotos#"
 * @param {string[]} checklistHeadersLo   - Lowercased checklist headers array.
 * @returns {string[]}  Matched column names, sorted numerically for arrays.
 */
function expandMediaPath(path, checklistHeadersLo) {
  const lo = path.toLowerCase();

  if (lo.endsWith("#")) {
    // ── Array path ─────────────────────────────────────────────────────────
    // Extract the base (everything before the "#") and find all headers of
    // the form <base><integer>.  Sort them numerically so URLs appear in the
    // same order as the columns in the spreadsheet (lifePhotos1 before
    // lifePhotos2, etc.), which gives predictable DwC output regardless of
    // the order columns were inserted into the sheet.
    const base = lo.slice(0, -1); // e.g. "lifephotos"
    const matched = checklistHeadersLo.filter(h =>
      h.startsWith(base) && /^\d+$/.test(h.slice(base.length))
    );
    matched.sort((a, b) =>
      parseInt(a.slice(base.length), 10) - parseInt(b.slice(base.length), 10)
    );
    return matched;
  }

  // ── Plain path ─────────────────────────────────────────────────────────
  return checklistHeadersLo.includes(lo) ? [lo] : [];
}

/**
 * Determine the NL formatting type for a media column, with automatic fallback
 * to the "#" array-item CDD pattern for numbered columns.
 *
 * Standard getNlFormatting() only performs an exact match against CDD row
 * names, which means a numbered array column like "lifePhotos1" would not be
 * found (the CDD entry is "lifePhotos#", not "lifePhotos1").  This function
 * adds the necessary array-item lookup so that the `media:` directive can
 * correctly identify the NL type of every expanded column.
 *
 * Lookup order:
 *   1. Exact match in CDD       "lifePhotos1"   (if explicitly defined)
 *   2. Trailing-digit strip     "lifePhotos1" → "lifePhotos#"
 *   3. Dot-path last-segment    "mediacluster.images1" → "mediacluster.images#"
 *
 * Returns "text" if no match is found, which will cause the caller to skip
 * the column with a warning (non-media text columns carry no URL).
 *
 * @param {string}   columnNameLo  - Lowercased column name (already expanded
 *                                   by expandMediaPath).
 * @param {Object[]} cddRows       - Custom Data Definition rows:
 *                                   { columnName: string, formatting: string, … }
 * @returns {string}  NL formatting type, e.g. "image", "sound", "map", "text".
 */
function getMediaNlFormatting(columnNameLo, cddRows) {
  if (!Array.isArray(cddRows)) return "text";

  // 1. Exact match - covers explicitly defined single columns and plain paths
  const exact = cddRows.find(r => (r.columnName || "").toLowerCase() === columnNameLo);
  if (exact) return (exact.formatting || "text").trim().toLowerCase().split(/\s+/)[0] || "text";

  // 2. Strip trailing digits and append "#"
  //    "lifePhotos1" → "lifePhotos#"
  //    "callsRecs12" → "callsRecs#"
  const hashPath = columnNameLo.replace(/\d+$/, "#");
  if (hashPath !== columnNameLo) {
    const hashMatch = cddRows.find(r => (r.columnName || "").toLowerCase() === hashPath);
    if (hashMatch) return (hashMatch.formatting || "text").trim().toLowerCase().split(/\s+/)[0] || "text";
  }

  // 3. Dot-notated path: strip digits from the last dot-segment and append "#"
  //    "mediacluster.images1" → "mediacluster.images#"
  //    "data.photos3"         → "data.photos#"
  //    Only fires when the path contains at least one dot (hasPath !== lo
  //    already checked so we just guard against producing the same string again).
  const dotHashPath = columnNameLo.replace(/(\.[^.]+?)\d+$/, "$1#");
  if (dotHashPath !== columnNameLo && dotHashPath !== hashPath) {
    const dotHashMatch = cddRows.find(r => (r.columnName || "").toLowerCase() === dotHashPath);
    if (dotHashMatch) return (dotHashMatch.formatting || "text").trim().toLowerCase().split(/\s+/)[0] || "text";
  }

  return "text";
}

const KNOWN_KEYS_BY_TYPE = {
  geopoint: "lat, long, verbatim",
  interval: "from, to",
  taxon: "name, authority, lastNamePart",
  date: "iso8601, year, month, day",
  image: "source",
  sound: "source",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Known directive value sets - used for validation
// ═══════════════════════════════════════════════════════════════════════════════

// All valid auto: keys (lowercase, whitespace stripped)
const KNOWN_AUTO_KEYS = new Set([
  "taxonid", "parentnameusageid", "taxonrank",
  "scientificname", "scientificnameauthorship", "occurrenceid",
]);

// All supported eml: field paths (lowercase)
const KNOWN_EML_PATHS = new Set([
  "title", "abstract",
  "creator.organizationname", "creator.givenname", "creator.surname",
  "creator.email", "creator.url", "creator.userid",
  "pubdate",
  "geographicdescription", "taxonomicdescription", "temporaldescription",
]);

// EML creator fields - at least one of these must be present when using eml: rows
const EML_REQUIRED_CREATOR_FIELDS = ["creator.organizationname", "creator.surname", "creator.givenname"];

// ═══════════════════════════════════════════════════════════════════════════════
// Main entry-point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build and return DwC Archive ZIP blobs.
 *
 * @param {Object}     params
 * @param {Object[]}   params.dwcTableRows       Rows from 'DwC archive' table.
 *                                               Each row: { term, sourceColumn, constantValue }
 * @param {Object}     params.compiledTree        Full compiled checklist (reserved for future use)
 * @param {Object[]}   params.taxaColumnDefs      Taxa Definition rows: { columnName, taxonName, … }
 * @param {Object[]}   params.customizationData   Customization table rows: { item, value }
 * @param {Object[]}   params.cddRows             Custom Data Definition rows: { columnName, formatting, … }
 * @param {string[]}   params.checklistHeaders    Lowercased column headers from the checklist sheet
 * @param {any[][]}    params.checklistRawRows    Raw data rows from the checklist sheet
 * @param {string}     params.defaultLangCode     Application default language code
 *
 * @returns {Promise<{ checklistZip: Blob|null, occurrenceZip: Blob|null }>}
 */
export async function compileDwcArchive(params) {
  const {
    dwcTableRows,
    taxaColumnDefs,
    customizationData,
    cddRows,
    checklistHeaders,
    checklistRawRows,
    /**
     * Optional callback: (rawSourceValue: string, columnName: string, rawRow: any[]) => string
     *
     * When provided, the compiler calls this for every media column `.source`
     * value instead of just applying relativeToUsercontent().  The callback is
     * responsible for running the NL template pipeline (Handlebars substitution
     * + usercontent resolution) so that CDD Template values are honoured in DwC
     * output exactly the same way they are in the viewer.
     *
     * If absent, the compiler falls back to a plain relativeToUsercontent() call
     * (legacy behaviour, no template expansion).
     *
     * Constructed by DataManager.compileDwcArchiveAsync(), which already has
     * access to Handlebars and helpers.processSource.  Keeping this as a
     * callback preserves decoupling: DwcArchiveCompiler has no import dependency
     * on Handlebars or the customTypes helpers layer.
     */
    resolveMediaSource,
  } = params;

  const NULL_RESULT = { checklistZip: null, occurrenceZip: null };
  if (!Array.isArray(dwcTableRows) || dwcTableRows.length === 0) return NULL_RESULT;

  // ───────────────────────────────────────────────────────────────────────────
  // Step 1 - Parse rows
  //
  // eml: rows → rawEmlMappings (for EML building)
  // all other rows → parsedMappings (for CSV)
  // ───────────────────────────────────────────────────────────────────────────

  const parsedMappings = [];
  const rawEmlMappings = []; // { path, directive, constantValue }

  for (const row of dwcTableRows) {
    const termRaw = (row.term || "").toString().trim();
    if (!termRaw) continue;

    const directive = parseSourceDirective(row.sourceColumn);
    const cv = row.constantValue != null && String(row.constantValue).trim() !== ""
      ? String(row.constantValue).trim() : null;

    if (termRaw.toLowerCase().startsWith("eml:")) {
      rawEmlMappings.push({ path: termRaw.slice(4).trim(), directive, constantValue: cv });
    } else {
      parsedMappings.push({ term: termRaw, directive, constantValue: cv });
    }
  }

  const mappingByTerm = new Map();
  for (const m of parsedMappings) {
    if (mappingByTerm.has(m.term)) {
      Logger.warning(`DwC Archive: Duplicate row for term "<b>${m.term}</b>". Only first used.`, "DwC Archive");
    } else {
      mappingByTerm.set(m.term, m);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 2 - Export language
  // ───────────────────────────────────────────────────────────────────────────

  const langMapping = mappingByTerm.get("language");
  if (!langMapping?.constantValue) {
    Logger.error(
      "DwC Archive: The <b>language</b> row is missing or has no Constant value. " +
      "A valid ISO 639-1 two-letter code (e.g. 'en') is required. Export aborted.",
      "DwC Archive"
    );
    return NULL_RESULT;
  }
  const exportLang = langMapping.constantValue.toLowerCase().trim();
  if (!/^[a-z]{2}$/.test(exportLang)) {
    Logger.error(`DwC Archive: <b>language</b> value "${langMapping.constantValue}" is not a valid ISO 639-1 code. Export aborted.`, "DwC Archive");
    return NULL_RESULT;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 3 - Tier 1 validation
  // ───────────────────────────────────────────────────────────────────────────

  const instCodeMapping = mappingByTerm.get("institutionCode");
  if (!instCodeMapping?.constantValue) {
    Logger.error("DwC Archive: <b>institutionCode</b> missing or not a Constant value. Export aborted.", "DwC Archive");
    return NULL_RESULT;
  }
  const institutionCode = instCodeMapping.constantValue;

  const collCodeMapping = mappingByTerm.get("collectionCode");
  const collectionCode = collCodeMapping?.constantValue || "";
  if (!collCodeMapping) Logger.warning("DwC Archive: <b>collectionCode</b> not configured. Recommended.", "DwC Archive");

  const licenseMapping = mappingByTerm.get("license");
  if (!licenseMapping?.constantValue) {
    Logger.error("DwC Archive: <b>license</b> row missing. Export aborted.", "DwC Archive");
    return NULL_RESULT;
  }
  const normalizedLicense = normalizeLicense(licenseMapping.constantValue);
  if (!normalizedLicense) {
    Logger.warning(`DwC Archive: License "${licenseMapping.constantValue}" is not a GBIF-accepted URI. Use CC0, CC BY 4.0, or CC BY-NC 4.0.`, "DwC Archive");
  } else if (normalizedLicense !== licenseMapping.constantValue) {
    Logger.info(`DwC Archive: License alias normalized → "${normalizedLicense}".`, "DwC Archive");
    licenseMapping.constantValue = normalizedLicense;
  }

  if (!mappingByTerm.has("datasetName")) Logger.warning("DwC Archive: <b>datasetName</b> not configured.", "DwC Archive");

  const hasTaxaColumns = Array.isArray(taxaColumnDefs) && taxaColumnDefs.length > 0;
  if (!mappingByTerm.has("scientificName") && !hasTaxaColumns) {
    Logger.error("DwC Archive: <b>scientificName</b> cannot be resolved. Export aborted.", "DwC Archive");
    return NULL_RESULT;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 4 - Tier 2 detection
  // ───────────────────────────────────────────────────────────────────────────

  const borMapping = mappingByTerm.get("basisOfRecord");
  let occurrenceExportEnabled = false;

  if (borMapping) {
    const borVal = borMapping.constantValue || "";
    const borVocab = getDwcTerm("basisOfRecord")?.vocabulary || [];
    if (!borVal) {
      Logger.error(`DwC Archive: <b>basisOfRecord</b> has no Constant value. Allowed: ${borVocab.join(", ")}. Occurrence export disabled.`, "DwC Archive");
    } else if (!borVocab.includes(borVal)) {
      Logger.error(`DwC Archive: <b>basisOfRecord</b> value "${borVal}" not in vocabulary. Allowed: ${borVocab.join(", ")}. Occurrence export disabled.`, "DwC Archive");
    } else {
      occurrenceExportEnabled = true;
    }

    if (occurrenceExportEnabled) {
      if (!mappingByTerm.has("eventDate")) {
        Logger.error("DwC Archive: <b>eventDate</b> required for occurrence export. Occurrence disabled.", "DwC Archive");
        occurrenceExportEnabled = false;
      }
      const hasLat = mappingByTerm.has("decimalLatitude");
      const hasLon = mappingByTerm.has("decimalLongitude");
      const hasDat = mappingByTerm.has("geodeticDatum");
      if ((hasLat || hasLon || hasDat) && !(hasLat && hasLon && hasDat)) {
        Logger.error("DwC Archive: <b>decimalLatitude</b>, <b>decimalLongitude</b>, and <b>geodeticDatum</b> must all be present or all absent.", "DwC Archive");
      }
    }
  }

  for (const t3 of ["samplingProtocol", "eventID"]) {
    if (mappingByTerm.has(t3)) {
      Logger.warning(`DwC Archive: Term <b>${t3}</b> (Tier 3 - Sampling Event) is not yet supported and will be skipped.`, "DwC Archive");
      mappingByTerm.delete(t3);
      const i = parsedMappings.findIndex(m => m.term === t3);
      if (i >= 0) parsedMappings.splice(i, 1);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 5 - Per-row type compatibility AND directive value validation
  //
  // Validates:
  //   - `taxa:ColumnName` references an existing taxa column
  //   - `auto:Key` uses a known auto key
  //   - `config:ItemName` resolves to a non-empty value
  //   - `eml:FieldPath` uses a known EML path
  //   - For `column` directives: NL type compatibility with DwC term
  // ───────────────────────────────────────────────────────────────────────────

  const allTaxaDefs = (taxaColumnDefs || []).filter(t => t?.columnName);
  const taxaColumnNameSet = new Set(allTaxaDefs.map(t => t.columnName.toLowerCase()));

  for (const m of parsedMappings) {
    const { directive, constantValue, term } = m;
    if (constantValue !== null) continue; // constant values need no validation here

    switch (directive.type) {
      case "taxa":
        if (!taxaColumnNameSet.has(directive.value.toLowerCase())) {
          Logger.error(
            `DwC Archive: <b>taxa:${directive.value}</b> references a column "<b>${directive.value}</b>" ` +
            `that does not exist in the Taxa Definition table. ` +
            `Known taxa columns: ${[...taxaColumnNameSet].join(", ")}.`,
            "DwC Archive"
          );
        }
        break;

      case "auto": {
        const ak = directive.value.toLowerCase().replace(/\s+/g, "");
        if (!KNOWN_AUTO_KEYS.has(ak)) {
          Logger.error(
            `DwC Archive: <b>auto:${directive.value}</b> is not a recognised auto directive. ` +
            `Known values: ${[...KNOWN_AUTO_KEYS].join(", ")}.`,
            "DwC Archive"
          );
        }
        break;
      }

      case "config": {
        const { value: configVal, found } = resolveConfigDirective(directive.value, customizationData);
        if (!found) {
          Logger.error(
            `DwC Archive: <b>config:${directive.value}</b> references a Customization item ` +
            `"<b>${directive.value}</b>" that does not exist in the Customization table.`,
            "DwC Archive"
          );
        } else if (!configVal) {
          Logger.error(
            `DwC Archive: <b>config:${directive.value}</b> references Customization item ` +
            `"<b>${directive.value}</b>" which is present but empty.`,
            "DwC Archive"
          );
        }
        break;
      }

      case "column": {
        // Type compatibility check (only for plain column references, not compound paths)
        const termEntry = getDwcTerm(term);
        if (!termEntry?.acceptedNlTypes) break;
        const colName = directive.value;
        const exactIdx = checklistHeaders.indexOf(colName.toLowerCase());
        const rootName = exactIdx < 0 && colName.lastIndexOf(".") > 0
          ? colName.slice(0, colName.lastIndexOf("."))
          : colName;
        const nlFmt = getNlFormatting(rootName, cddRows, taxaColumnDefs);
        if (!termEntry.acceptedNlTypes.includes(nlFmt)) {
          Logger.error(
            `DwC Archive: Term <b>${term}</b> mapped to "<b>${colName}</b>" ` +
            `(NL type: <b>${nlFmt}</b>), but only accepts: ${termEntry.acceptedNlTypes.join(", ")}.`,
            "DwC Archive"
          );
        }
        break;
      }

      case "media": {
        // Validate each comma-separated path listed in the media: directive value.
        //
        // Validation strategy (lenient by design):
        //   - Plain paths that do not exist in the checklist are errors.
        //   - "#" array paths are validated against the CDD rather than the headers,
        //     because numbered columns only exist for taxa that actually have media;
        //     an empty-but-valid dataset should not cause an export error.
        //   - For each resolvable path, the NL type must be image, sound, or map.
        //
        // We deliberately do NOT error on the term name itself: associatedMedia is
        // the canonical use of this directive, but users could theoretically use it
        // for any other free-text term.
        const mediaPaths = directive.value.split(",").map(p => p.trim()).filter(Boolean);
        if (mediaPaths.length === 0) {
          Logger.error(
            `DwC Archive: <b>${term}</b> uses a <b>media:</b> directive but no paths are listed. ` +
            `Syntax: media:columnName, arrayCol#, ...`,
            "DwC Archive"
          );
          break;
        }

        for (const mPath of mediaPaths) {
          if (mPath.endsWith("#")) {
            // Array path: validate via CDD "#" entry
            const hashLo = mPath.toLowerCase();
            const cddEntry = Array.isArray(cddRows)
              ? cddRows.find(r => (r.columnName || "").toLowerCase() === hashLo)
              : null;
            if (!cddEntry) {
              Logger.warning(
                `DwC Archive: <b>${term}</b> media: path "<b>${mPath}</b>" has no entry in the ` +
                `Custom data definition table.  Add a row for "<b>${mPath}</b>" with formatting ` +
                `"image", "sound", or "map" so the type can be resolved during export.`,
                "DwC Archive"
              );
            } else {
              const fmt = (cddEntry.formatting || "text").trim().toLowerCase().split(/\s+/)[0] || "text";
              if (!["image", "sound", "map"].includes(fmt)) {
                Logger.error(
                  `DwC Archive: <b>${term}</b> media: path "<b>${mPath}</b>" resolves to NL type ` +
                  `"<b>${fmt}</b>". Only image, sound, and map columns carry a source URL. ` +
                  `Update the formatting column in your Custom data definition table.`,
                  "DwC Archive"
                );
              }
            }
          } else {
            // Plain path: must exist as a header and be a media type
            const plainLo = mPath.toLowerCase();
            if (!checklistHeaders.includes(plainLo)) {
              Logger.error(
                `DwC Archive: <b>${term}</b> media: path "<b>${mPath}</b>" was not found as a ` +
                `column header in the checklist sheet. Check spelling.`,
                "DwC Archive"
              );
            } else {
              const fmt = getNlFormatting(mPath, cddRows, taxaColumnDefs);
              if (!["image", "sound", "map"].includes(fmt)) {
                Logger.error(
                  `DwC Archive: <b>${term}</b> media: path "<b>${mPath}</b>" resolves to NL type ` +
                  `"<b>${fmt}</b>". Only image, sound, and map columns carry a source URL. ` +
                  `Update the formatting column in your Custom data definition table.`,
                  "DwC Archive"
                );
              }
            }
          }
        }
        break;
      }

      default: break;
    }
  }

  // Validate eml: rows
  for (const em of rawEmlMappings) {
    if (!KNOWN_EML_PATHS.has(em.path.toLowerCase())) {
      Logger.error(
        `DwC Archive: <b>eml:${em.path}</b> is not a recognised EML field path. ` +
        `Known paths: ${[...KNOWN_EML_PATHS].join(", ")}.`,
        "DwC Archive"
      );
    }

    // Validate config: directives inside eml: rows
    if (em.directive.type === "config" && em.constantValue === null) {
      const { value: configVal, found } = resolveConfigDirective(em.directive.value, customizationData);
      if (!found) {
        Logger.error(
          `DwC Archive: <b>eml:${em.path}</b> uses <b>config:${em.directive.value}</b> which ` +
          `does not exist in the Customization table.`,
          "DwC Archive"
        );
      } else if (!configVal) {
        Logger.error(
          `DwC Archive: <b>eml:${em.path}</b> uses <b>config:${em.directive.value}</b> which ` +
          `is present but empty.`,
          "DwC Archive"
        );
      }
    }
  }

  // If eml: rows are present at all, validate required creator fields
  if (rawEmlMappings.length > 0) {
    const emlPathsLo = new Set(rawEmlMappings.map(em => em.path.toLowerCase()));
    const hasCreatorName = EML_REQUIRED_CREATOR_FIELDS.some(f => emlPathsLo.has(f));
    if (!hasCreatorName) {
      Logger.error(
        "DwC Archive: At least one creator name field is required when using <b>eml:</b> rows. " +
        "Add one of: <em>eml:creator.organizationName</em>, <em>eml:creator.surName</em>, " +
        "or <em>eml:creator.givenName</em>.",
        "DwC Archive"
      );
    }
    if (!emlPathsLo.has("creator.email")) {
      Logger.warning(
        "DwC Archive: <b>eml:creator.email</b> is strongly recommended for GBIF compliance.",
        "DwC Archive"
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 6 - Unknown DwC terms
  // ───────────────────────────────────────────────────────────────────────────

  for (const m of parsedMappings) {
    if (m.term === "language") continue;
    if (!getDwcTerm(m.term)) Logger.info(`DwC Archive: Term "<b>${m.term}</b>" not in inventory - output without guardrails.`, "DwC Archive");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Taxa / occurrence column setup
  // ───────────────────────────────────────────────────────────────────────────

  const occurrenceLevelDef = allTaxaDefs.find(t => (t.taxonName || "").toLowerCase() === OCCURRENCE_IDENTIFIER);
  const taxaColumns = allTaxaDefs.filter(t => (t.taxonName || "").toLowerCase() !== OCCURRENCE_IDENTIFIER);

  // taxaColHeaderIndices: for each taxa column definition, find the actual header index.
  // NaturaList allows taxa columns to use a `.name` sub-column (e.g. "Species" definition
  // → actual header "Species.name").  We try the exact name first, then "name.name".
  // This is the FIX for the missing species/subspecies bug.
  const taxaColHeaderIndices = taxaColumns.map(t => {
    const lo = t.columnName.toLowerCase();
    let idx = checklistHeaders.indexOf(lo);
    if (idx < 0) idx = checklistHeaders.indexOf(lo + ".name");
    return idx;
  });

  // Rank lookup map: columnName (lowercase) → index in taxaColumns
  // Used to enforce the rank guard on taxa: component directives.
  const taxaColumnRankIndex = new Map(taxaColumns.map((t, i) => [t.columnName.toLowerCase(), i]));

  const occColHeaderIndex = occurrenceLevelDef
    ? checklistHeaders.indexOf(occurrenceLevelDef.columnName.toLowerCase()) : -1;

  // ───────────────────────────────────────────────────────────────────────────
  // Shared helpers (closures over params)
  // ───────────────────────────────────────────────────────────────────────────

  const buildContext = rawRow => ({ headers: checklistHeaders, row: rawRow, langCode: exportLang });

  /**
   * Read a column value with full compound-path support.
   *
   * 1. If `columnName` exists as an exact header → read directly via loadDataByType.
   * 2. Else, try splitting on last dot (rootName + componentKey):
   *    a. If rootName exists as a header AND componentKey is a known compound key
   *       for rootName's NL type → extract the component.
   *    b. Otherwise → Logger.warning "column not found" and return "".
   *
   * Media sources (image/sound .source) have relativeToUsercontent applied
   * so they are absolute-path URLs suitable for the DwC archive.
   */
  const resolveColumnValue = (termName, columnName, rawRow) => {
    const exactIdx = checklistHeaders.indexOf(columnName.toLowerCase());

    if (exactIdx >= 0) {
      const nlFmt = getNlFormatting(columnName, cddRows, taxaColumnDefs);
      if (!getAvailableDataTypeNames().includes(nlFmt)) {
        Logger.warning(`DwC Archive: Column "<b>${columnName}</b>" has unsupported type "${nlFmt}". Skipped.`, "DwC Archive");
        return "";
      }
      let raw;
      try { raw = loadDataByType(buildContext(rawRow), columnName, { formatting: nlFmt }); }
      catch (ex) { Logger.warning(`DwC Archive: Error reading "<b>${columnName}</b>": ${ex.message}`, "DwC Archive"); return ""; }
      if (raw === null || raw === undefined) return "";
      // For media types, extract .source and apply the full NL source pipeline.
      // Without this, coerceOutputFormat would call String(raw) → "[object Object]".
      if (["image", "sound", "map"].includes(nlFmt)) {
        if (!raw?.source) return "";
        let url = raw.source.toString().trim();
        if (!url) return "";
        if (typeof resolveMediaSource === "function") {
          url = resolveMediaSource(url, columnName, rawRow);
        } else {
          url = relativeToUsercontent(url);
        }
        return absoluteUsercontent(url) || "";
      }
      const te = getDwcTerm(termName);
      return coerceOutputFormat(raw, te?.outputFormat || "string", termName, nlFmt, te?.validationRange);
    }

    // Try compound path
    const lastDot = columnName.lastIndexOf(".");
    if (lastDot > 0) {
      const rootName = columnName.slice(0, lastDot);
      const componentKey = columnName.slice(lastDot + 1);
      const rootIdx = checklistHeaders.indexOf(rootName.toLowerCase());

      if (rootIdx >= 0) {
        const nlFmt = getNlFormatting(rootName, cddRows, taxaColumnDefs);
        if (!isKnownCompoundKey(nlFmt, componentKey)) {
          Logger.warning(
            `DwC Archive: "<b>${columnName}</b>" not found as header, and ` +
            `"<b>${componentKey}</b>" is not a known compound key for type "${nlFmt}". ` +
            `Known keys: ${KNOWN_KEYS_BY_TYPE[nlFmt] || "(none)"}. ` +
            `If "${rootName}.${componentKey}" is a real column, add it to your checklist sheet.`,
            "DwC Archive"
          );
          return "";
        }
        if (!getAvailableDataTypeNames().includes(nlFmt)) {
          Logger.warning(`DwC Archive: Root column "<b>${rootName}</b>" has unsupported type "${nlFmt}". Skipped.`, "DwC Archive");
          return "";
        }
        let raw;
        try { raw = loadDataByType(buildContext(rawRow), rootName, { formatting: nlFmt }); }
        catch (ex) { Logger.warning(`DwC Archive: Error reading "<b>${rootName}</b>": ${ex.message}`, "DwC Archive"); return ""; }
        if (raw === null || raw === undefined) return "";

        let extracted = extractCompoundValue(nlFmt, componentKey, raw, Logger);

        // Apply the full NL media-source pipeline to image/sound .source values.
        //
        // The pipeline is:
        //   1. Handlebars template substitution (CDD "Template" column) - lets
        //      users build dynamic paths like "images/{{name}}.jpg".
        //   2. relativeToUsercontent() - makes the path absolute relative to
        //      the app root so DwC consumers get a usable URL.
        //
        // This is delegated to the `resolveMediaSource` callback supplied by
        // the caller (DataManager) which has access to Handlebars and helpers.
        // If no callback is provided we fall back to plain usercontent resolution
        // (no template expansion) for backward compatibility.
        if ((nlFmt === "image" || nlFmt === "sound") && componentKey === "source" && extracted) {
          if (typeof resolveMediaSource === "function") {
            extracted = resolveMediaSource(String(extracted), rootName, rawRow);
          } else {
            extracted = relativeToUsercontent(String(extracted));
          }
          extracted = absoluteUsercontent(String(extracted));
        }

        const te = getDwcTerm(termName);
        return coerceOutputFormat(extracted, te?.outputFormat || "string", termName, nlFmt, te?.validationRange);
      }
    }

    Logger.warning(`DwC Archive: Column "<b>${columnName}</b>" not found in checklist headers.`, "DwC Archive");
    return "";
  };

  /**
   * Resolve a `media:` directive value into a pipe-separated string of fully
   * resolved media source URLs, ready for the dwc:associatedMedia CSV field.
   *
   * The directive value is the raw string after "media:", e.g.:
   *   "specimenPhoto, lifePhotos#, callsRecs#"
   *   "mediacluster.images#"
   *   "coverPhoto"
   *
   * For each comma-separated path the function:
   *   1. Calls expandMediaPath() to resolve "#" array paths into actual numbered
   *      column names present in the checklist sheet.
   *   2. Calls getMediaNlFormatting() to determine the NL type, using the
   *      "lifePhotos#" CDD fallback for numbered columns.
   *   3. Skips any column whose NL type is not image, sound, or map.
   *   4. Calls loadDataByType() to obtain the { source, title } object for the
   *      current row.
   *   5. Applies the full NL media source pipeline via the resolveMediaSource
   *      callback (Handlebars template substitution + usercontent resolution),
   *      exactly replicating what CustomTypeImage/Sound/Map.render() does so
   *      the URLs in the DwC archive are identical to those displayed in the viewer.
   *   6. Falls back to relativeToUsercontent() if no callback is provided
   *      (no template expansion - legacy compatibility).
   *
   * Resolved URLs are joined with " | " (space–pipe–space), the separator
   * recommended by GBIF for multi-value free-text DwC fields.
   *
   * Empty or null sources, columns not found, and read errors are silently
   * skipped (with a Logger.warning for unexpected cases); this ensures that a
   * taxon with only some photos still produces a valid, non-empty output rather
   * than failing the entire export.
   *
   * @param {string}  mediaSpec  - Raw "media:" value, e.g.
   *                               "specimenPhoto, lifePhotos#, callsRecs#"
   * @param {any[]}   rawRow     - The checklist raw data row for the current record.
   * @returns {string}  Pipe-separated resolved URL string, or "" if none found.
   */
  const resolveAssociatedMedia = (mediaSpec, rawRow) => {
    // Split on commas; trim each path; discard blanks
    const rawPaths = mediaSpec.split(",").map(p => p.trim()).filter(Boolean);

    const resolvedUrls = [];

    for (const path of rawPaths) {

      // ── Step 1: expand "#" array paths to real column names ──────────────
      const expandedCols = expandMediaPath(path, checklistHeaders);

      if (expandedCols.length === 0) {
        // No matching headers found for this path specification.
        if (path.endsWith("#")) {
          // Array path with no numbered columns present in the sheet.
          // This is expected for an empty dataset or when no photos have been
          // added yet; emit info rather than a warning to avoid noise.
          Logger.info(
            `DwC Archive: <b>associatedMedia</b> - media: path "<b>${path}</b>" matched no ` +
            `numbered columns in the checklist (e.g. no "${path.slice(0, -1)}1" header found). ` +
            `If this column is intentional, add at least one numbered column to the data sheet.`,
            "DwC Archive"
          );
        } else {
          // Plain column path that simply does not exist - likely a typo.
          Logger.warning(
            `DwC Archive: <b>associatedMedia</b> - media: path "<b>${path}</b>" was not found ` +
            `as a column header in the checklist sheet. Check spelling.`,
            "DwC Archive"
          );
        }
        continue;
      }

      // ── Step 2–5: read and resolve each expanded column ──────────────────
      for (const col of expandedCols) {

        // Determine NL type, using the "#"-item CDD fallback for numbered cols
        const nlFmt = getMediaNlFormatting(col, cddRows);

        // Only image, sound, and map columns carry a source URL
        if (!["image", "sound", "map"].includes(nlFmt)) {
          Logger.warning(
            `DwC Archive: <b>associatedMedia</b> - media: column "<b>${col}</b>" has NL type ` +
            `"<b>${nlFmt}</b>", which is not a media type (expected: image, sound, or map). ` +
            `Skipped. Check the formatting column in your Custom data definition table.`,
            "DwC Archive"
          );
          continue;
        }

        // Read { source, title } for this row via the standard NL data pipeline
        let raw;
        try {
          raw = loadDataByType(buildContext(rawRow), col, { formatting: nlFmt });
        } catch (ex) {
          Logger.warning(
            `DwC Archive: <b>associatedMedia</b> - error reading column "<b>${col}</b>": ${ex.message}`,
            "DwC Archive"
          );
          continue;
        }

        // A null result means this row simply has no value for this column (normal)
        if (raw === null || raw === undefined || !raw.source) continue;

        let url = raw.source.toString().trim();
        if (!url) continue;

        // ── Step 5: apply the full NL media source pipeline ──────────────────
        //
        // This mirrors what CustomTypeImage/Sound/Map.render() does via
        // helpers.processSource():
        //   1. Handlebars template substitution - lets users write dynamic
        //      paths like "images/{{name}}.jpg" in the CDD Template column.
        //   2. relativeToUsercontent() - converts a relative path like
        //      "usercontent/images/frog.jpg" to an absolute URL usable by
        //      external consumers of the DwC archive.
        //
        // The resolveMediaSource callback is constructed by DataManager and
        // has access to Handlebars and the compiled Checklist context.  If it
        // is not provided (legacy mode) we fall back to plain usercontent resolution
        // with no template expansion.
        if (typeof resolveMediaSource === "function") {
          url = resolveMediaSource(url, col, rawRow);
        } else {
          url = relativeToUsercontent(url);
        }

        url = absoluteUsercontent(url);
        if (url) resolvedUrls.push(url);
      }
    }

    // Join with " | " - the GBIF-recommended multi-value separator for free-text DwC fields
    return resolvedUrls.join(" | ");
  };

  const checkVocabulary = (termName, value) => {
    if (!value || value === "") return value;
    const te = getDwcTerm(termName);
    if (!te?.vocabulary?.length) return value;
    if (!te.vocabulary.includes(String(value)))
      Logger.warning(`DwC Archive: Value "<b>${value}</b>" for <b>${termName}</b> not in vocabulary (${te.vocabulary.join(", ")}). Output as-is.`, "DwC Archive");
    return value;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Step 7 - Unique taxon paths + taxonID pre-computation
  //
  // With the taxaColHeaderIndices fix, columns like "Species" that use a
  // ".name" sub-column pattern (actual header: "species.name") are now
  // correctly resolved.  This ensures species-level and subspecies-level
  // taxa appear in the output instead of being silently mapped to their
  // genus because the column index was -1.
  // ───────────────────────────────────────────────────────────────────────────

  const uniqueTaxaMap = new Map();
  for (const rawRow of (checklistRawRows || [])) {
    const path = taxaColumns.map((_, i) => {
      const idx = taxaColHeaderIndices[i];
      return idx >= 0 && rawRow[idx] != null ? rawRow[idx].toString().trim() : "";
    });
    let deepest = -1;
    for (let i = 0; i < path.length; i++) if (path[i]) deepest = i;
    for (let i = 0; i <= deepest; i++) {
      if (!path[i]) continue;
      const key = JSON.stringify(path.slice(0, i + 1));
      if (!uniqueTaxaMap.has(key))
        uniqueTaxaMap.set(key, {
          path: path.slice(0, i + 1),
          rankIndex: i,
          rankColumnName: taxaColumns[i].columnName,
          representativeRawRow: rawRow,
        });
    }
  }

  const taxonIdByKey = new Map();
  for (const [key, taxon] of uniqueTaxaMap) {
    const idInput = `${institutionCode}:${collectionCode}:${taxon.path[taxon.rankIndex]}:${columnNameToRankVocab(taxon.rankColumnName)}`;
    taxonIdByKey.set(key, await uuidV5(UUID_NS_TAXON, idInput));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Output column order
  // ───────────────────────────────────────────────────────────────────────────

  const seenExplicit = new Set();
  const orderedExplicitTerms = parsedMappings
    .map(m => m.term)
    .filter(t => t !== "language")
    .filter(t => { if (seenExplicit.has(t)) return false; seenExplicit.add(t); return true; });

  const autoAddTerms = [];
  for (const req of ["taxonID", "scientificName", "taxonRank"])
    if (!seenExplicit.has(req)) autoAddTerms.push(req);
  if (!seenExplicit.has("parentNameUsageID") && taxaColumns.length > 1)
    autoAddTerms.push("parentNameUsageID");

  const allTaxonTerms = [
    "taxonID",
    ...orderedExplicitTerms.filter(t => t !== "taxonID"),
    ...autoAddTerms.filter(t => t !== "taxonID"),
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // Taxon row value resolver
  //
  // KEY BEHAVIOURS:
  //
  //   taxa:ColumnName (no component)
  //     Reads the raw column value from the representative row.
  //     Also tries "ColumnName.name" if exact header not found (mirroring the
  //     taxaColHeaderIndices fix so users don't need to know about .name columns).
  //     Returns "" for rows where that column is empty (correct: a MajorGroup-level
  //     taxon has no Family value).
  //
  //   taxa:ColumnName.component (with component)
  //     RANK GUARD: returns "" if the referenced column is at a deeper rank than
  //     the current taxon.  This prevents a genus row (whose representative raw
  //     row happens to contain a species) from inheriting specificEpithet etc.
  //     Then loads via taxon type and extracts the named component.
  //
  //   auto:scientificName
  //     The current taxon's own name (taxon.path[taxon.rankIndex]), not any
  //     specific column.  Always correct regardless of column naming.
  //
  //   auto:scientificNameAuthorship
  //     Looks at the "rankColumnName.authority" header (e.g. "species.authority")
  //     in the representative raw row.  Falls back to customTypeTaxon.authority.
  //
  //   auto:taxonRank
  //     Vocabulary value inferred from the column name (e.g. "Species" → "species").
  // ───────────────────────────────────────────────────────────────────────────

  const resolveForTaxon = (mapping, taxon) => {
    const { term, directive, constantValue } = mapping;
    const rawRow = taxon.representativeRawRow;

    if (constantValue !== null) return checkVocabulary(term, constantValue);

    switch (directive.type) {

      case "config": {
        const { value: cv } = resolveConfigDirective(directive.value, customizationData);
        return cv; // already validated non-empty in Step 5
      }

      case "taxa": {
        const { value: colName, component } = directive;

        if (!component) {
          // No component: read raw column value.
          // Try exact header first, then ".name" fallback (same logic as taxaColHeaderIndices).
          let ci = checklistHeaders.indexOf(colName.toLowerCase());
          if (ci < 0) ci = checklistHeaders.indexOf(colName.toLowerCase() + ".name");
          return ci >= 0 && rawRow[ci] != null ? rawRow[ci].toString().trim() : "";
        }

        // Component path: taxa:ColumnName.component
        // Rank guard: if the referenced column is deeper than the current taxon's rank,
        // return "" - a Family-level taxon should not inherit specificEpithet even if
        // its representative raw row is a species row.
        const refRankIdx = taxaColumnRankIndex.get(colName.toLowerCase()) ?? -1;
        if (refRankIdx > taxon.rankIndex) return "";

        // Load via taxon type and extract the component
        const taxonData = loadDataByType(buildContext(rawRow), colName, { formatting: "taxon" });
        if (!taxonData) return "";
        const ext = extractCompoundValue("taxon", component, taxonData, Logger);
        if (ext === null || ext === undefined) return "";
        const te = getDwcTerm(term);
        return coerceOutputFormat(ext, te?.outputFormat || "string", term, "taxon", te?.validationRange);
      }

      case "auto": {
        const ak = directive.value.toLowerCase().replace(/\s+/g, "");
        switch (ak) {
          case "taxonid":
            return taxonIdByKey.get(JSON.stringify(taxon.path)) || "";

          case "parentnameusageid":
            if (taxon.rankIndex === 0) return "";
            return taxonIdByKey.get(JSON.stringify(taxon.path.slice(0, taxon.rankIndex))) || "";

          case "taxonrank":
            return columnNameToRankVocab(taxon.rankColumnName);

          case "scientificname":
            return taxon.path[taxon.rankIndex] || "";

          case "scientificnameauthorship": {
            // Look for the authority sub-column: rankColumnName + ".authority"
            // This matches NaturaList's convention where "Species.authority" is
            // the authority sub-column of the "Species" taxa column.
            const authHeader = taxon.rankColumnName.toLowerCase() + ".authority";
            const authIdx = checklistHeaders.indexOf(authHeader);
            if (authIdx >= 0 && rawRow[authIdx] != null) {
              const val = rawRow[authIdx].toString().trim();
              if (val) return val;
            }
            // Fallback: try loading the taxon-typed column and reading .authority
            // (handles pipe-separated "Name|Authority" cells)
            const taxonData = loadDataByType(buildContext(rawRow), taxon.rankColumnName, { formatting: "taxon" });
            return taxonData?.authority || "";
          }

          case "occurrenceid":
            // occurrenceID has no meaning on taxon rows; return "" silently.
            return "";

          default:
            // Already validated in Step 5 - this branch should not be reached
            return "";
        }
      }

      case "template":
        return renderTemplate(directive.value, cn => resolveColumnValue("_template", cn, rawRow) || "");

      case "column":
        return checkVocabulary(term, resolveColumnValue(term, directive.value, rawRow));

      case "media":
        // Collect, resolve, and pipe-join all media source URLs for this taxon.
        //
        // For taxon-level records the "representative raw row" is the single
        // checklist row that was chosen to represent the taxon.  The media:
        // directive simply reads media columns from that row; all URLs present
        // in those columns for that row are included.
        //
        // This means associatedMedia on a genus-level taxon will contain the
        // photos of the first species row encountered for that genus - which is
        // the same behaviour used for all other data columns on taxon rows.
        // If only species-level photos are needed, the DwC export should be
        // configured as occurrence-based (Tier 2) rather than taxon-based.
        return resolveAssociatedMedia(directive.value, rawRow);

      default: return "";
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Build taxon CSV rows
  // ───────────────────────────────────────────────────────────────────────────

  const taxonCsvRows = [];
  for (const [pathKey, taxon] of uniqueTaxaMap) {
    const row = {};
    const myTaxonId = taxonIdByKey.get(pathKey);
    row["taxonID"] = myTaxonId;

    for (const term of allTaxonTerms) {
      if (term === "taxonID") { row[term] = myTaxonId; continue; }

      if (term === "parentNameUsageID") {
        const m = mappingByTerm.get(term);
        row[term] = m ? resolveForTaxon(m, taxon)
          : (taxon.rankIndex === 0 ? "" : taxonIdByKey.get(JSON.stringify(taxon.path.slice(0, taxon.rankIndex))) || "");
        continue;
      }
      if (term === "taxonRank") {
        const m = mappingByTerm.get(term);
        row[term] = m ? resolveForTaxon(m, taxon) : columnNameToRankVocab(taxon.rankColumnName);
        continue;
      }
      if (term === "scientificName") {
        const m = mappingByTerm.get(term);
        row[term] = m ? resolveForTaxon(m, taxon) : (taxon.path[taxon.rankIndex] || "");
        continue;
      }
      const m = mappingByTerm.get(term);
      if (m) row[term] = resolveForTaxon(m, taxon);
    }
    taxonCsvRows.push(row);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 8 - Build occurrence CSV rows (Tier 2)
  //
  // Taxonomy fields use uniform inheritance:
  //   1. Try reading the mapped column from the occurrence raw row.
  //   2. If empty, fall back to the same column on the parent taxon's
  //      representative raw row.
  // The rank guard applies here too - taxa: component directives for columns
  // deeper than the parent taxon's rank return "".
  // ───────────────────────────────────────────────────────────────────────────

  const occurrenceCsvRows = [];
  const TAXONOMY_TERMS = new Set([
    "scientificName", "scientificNameAuthorship", "taxonRank",
    "specificEpithet", "infraspecificEpithet",
    "kingdom", "phylum", "class", "order", "family", "genus", "subgenus",
  ]);

  if (occurrenceExportEnabled) {
    if (occColHeaderIndex < 0)
      Logger.warning("DwC Archive: Occurrence export enabled but no 'Occurrence' level found. No occurrence archive.", "DwC Archive");

    const occTerms = ["occurrenceID", ...orderedExplicitTerms.filter(t => t !== "occurrenceID")];
    const needsAutoId = !seenExplicit.has("occurrenceID");
    const catMapping = mappingByTerm.get("catalogNumber");

    for (const rawRow of (checklistRawRows || [])) {
      if (occColHeaderIndex < 0) continue;
      const occCell = rawRow[occColHeaderIndex];
      if (occCell == null || String(occCell).trim() === "") continue;

      // Find parent taxon
      const taxonPath = taxaColumns.map((_, i) => {
        const idx = taxaColHeaderIndices[i];
        return idx >= 0 && rawRow[idx] != null ? rawRow[idx].toString().trim() : "";
      });
      let deepestTaxonIdx = -1;
      for (let i = 0; i < taxonPath.length; i++) if (taxonPath[i]) deepestTaxonIdx = i;
      const parentKey = deepestTaxonIdx >= 0 ? JSON.stringify(taxonPath.slice(0, deepestTaxonIdx + 1)) : null;
      const parentTaxon = parentKey ? uniqueTaxaMap.get(parentKey) : null;

      // occurrenceID generation
      let occurrenceId = "";
      if (!needsAutoId) {
        // resolved in term loop
      } else if (catMapping?.directive.type === "column") {
        const catNum = resolveColumnValue("catalogNumber", catMapping.directive.value, rawRow);
        if (catNum) occurrenceId = collectionCode
          ? `${institutionCode}:${collectionCode}:${catNum}`
          : `${institutionCode}:${catNum}`;
      }
      if (needsAutoId && !occurrenceId) {
        // No catalogNumber produced an ID above — fall back to a UUID v5 derived
        // from the taxon name, occurrence cell, date, and coordinates so that the
        // ID is at least stable across re-exports of the same data.
        const sciName = parentTaxon ? (parentTaxon.path[parentTaxon.rankIndex] || "") : "";
        const edMap = mappingByTerm.get("eventDate");
        const edVal = edMap?.directive.type === "column" ? (resolveColumnValue("eventDate", edMap.directive.value, rawRow) || "") : "";
        const latMap = mappingByTerm.get("decimalLatitude");
        const latVal = latMap?.directive.type === "column" ? (resolveColumnValue("decimalLatitude", latMap.directive.value, rawRow) || "") : "";
        const lonMap = mappingByTerm.get("decimalLongitude");
        const lonVal = lonMap?.directive.type === "column" ? (resolveColumnValue("decimalLongitude", lonMap.directive.value, rawRow) || "") : "";
        // Include the occurrence cell value (e.g. ACCNO) in the hash to guarantee
        // row-level uniqueness.  Without it, two occurrences of the same taxon on
        // the same date at the same location produce identical UUIDs.
        const occCellStr = String(occCell).trim();
        occurrenceId = await uuidV5(UUID_NS_OCCURRENCE, `${sciName}:${occCellStr}:${edVal}:${latVal}:${lonVal}`);
        Logger.warning("DwC Archive: No catalogNumber available - UUID v5 fallback used for <b>occurrenceID</b>.", "DwC Archive");
      } else if (!occurrenceId) {
        // User provided an explicit occurrenceID mapping (e.g. auto:occurrenceID).
        // Pre-compute the UUID so the auto:occurrenceID directive can use it in the
        // term loop.  No warning — the user knowingly chose auto-generation.
        const sciName = parentTaxon ? (parentTaxon.path[parentTaxon.rankIndex] || "") : "";
        const edMap = mappingByTerm.get("eventDate");
        const edVal = edMap?.directive.type === "column" ? (resolveColumnValue("eventDate", edMap.directive.value, rawRow) || "") : "";
        const latMap = mappingByTerm.get("decimalLatitude");
        const latVal = latMap?.directive.type === "column" ? (resolveColumnValue("decimalLatitude", latMap.directive.value, rawRow) || "") : "";
        const lonMap = mappingByTerm.get("decimalLongitude");
        const lonVal = lonMap?.directive.type === "column" ? (resolveColumnValue("decimalLongitude", lonMap.directive.value, rawRow) || "") : "";
        const occCellStr = String(occCell).trim();
        occurrenceId = await uuidV5(UUID_NS_OCCURRENCE, `${sciName}:${occCellStr}:${edVal}:${latVal}:${lonVal}`);
      }

      const occRow = { occurrenceID: occurrenceId };

      for (const term of occTerms) {
        if (term === "occurrenceID") { occRow[term] = occurrenceId; continue; }
        const mapping = mappingByTerm.get(term);
        if (!mapping) continue;
        const { directive, constantValue } = mapping;

        if (constantValue !== null) { occRow[term] = checkVocabulary(term, constantValue); continue; }

        let value = "";

        if (directive.type === "taxa" && TAXONOMY_TERMS.has(term)) {
          // Uniform inheritance: try occurrence row, fallback to parent row.
          const readFromRow = (sourceRow) => {
            const { value: colName, component } = directive;
            if (!component) {
              let ci = checklistHeaders.indexOf(colName.toLowerCase());
              if (ci < 0) ci = checklistHeaders.indexOf(colName.toLowerCase() + ".name");
              return ci >= 0 && sourceRow[ci] != null ? sourceRow[ci].toString().trim() : "";
            }
            // Rank guard
            if (parentTaxon) {
              const refRankIdx = taxaColumnRankIndex.get(colName.toLowerCase()) ?? -1;
              if (refRankIdx > parentTaxon.rankIndex) return "";
            }
            const taxonData = loadDataByType(buildContext(sourceRow), colName, { formatting: "taxon" });
            if (!taxonData) return "";
            const ext = extractCompoundValue("taxon", component, taxonData, Logger);
            return ext ? String(ext) : "";
          };

          value = readFromRow(rawRow);
          if (!value && parentTaxon) value = readFromRow(parentTaxon.representativeRawRow);
          occRow[term] = checkVocabulary(term, value);
          continue;
        }

        switch (directive.type) {
          case "config": {
            const { value: cv } = resolveConfigDirective(directive.value, customizationData);
            value = cv;
            break;
          }
          case "auto": {
            const ak = directive.value.toLowerCase().replace(/\s+/g, "");
            if (ak === "occurrenceid") value = occurrenceId;
            else if (ak === "scientificname") value = parentTaxon ? (parentTaxon.path[parentTaxon.rankIndex] || "") : "";
            else if (ak === "taxonrank") value = parentTaxon ? columnNameToRankVocab(parentTaxon.rankColumnName) : "";
            else if (ak === "taxonid") value = parentKey ? (taxonIdByKey.get(parentKey) || "") : "";
            else if (ak === "scientificnameauthorship") {
              if (parentTaxon) {
                const authHeader = parentTaxon.rankColumnName.toLowerCase() + ".authority";
                const authIdx = checklistHeaders.indexOf(authHeader);
                if (authIdx >= 0 && parentTaxon.representativeRawRow[authIdx] != null) {
                  value = parentTaxon.representativeRawRow[authIdx].toString().trim();
                }
                if (!value) {
                  const td = loadDataByType(buildContext(parentTaxon.representativeRawRow), parentTaxon.rankColumnName, { formatting: "taxon" });
                  value = td?.authority || "";
                }
              }
            }
            break;
          }
          case "taxa": {
            const { value: colName, component } = directive;
            if (!component) {
              let ci = checklistHeaders.indexOf(colName.toLowerCase());
              if (ci < 0) ci = checklistHeaders.indexOf(colName.toLowerCase() + ".name");
              value = ci >= 0 && rawRow[ci] != null ? rawRow[ci].toString().trim() : "";
            } else {
              const taxonData = loadDataByType(buildContext(rawRow), colName, { formatting: "taxon" });
              if (taxonData) { const ext = extractCompoundValue("taxon", component, taxonData, Logger); value = ext ? String(ext) : ""; }
            }
            break;
          }
          case "template":
            value = renderTemplate(directive.value, cn => resolveColumnValue("_template", cn, rawRow) || "");
            break;
          case "media":
            // Collect, resolve, and pipe-join all media source URLs for this
            // occurrence record.
            //
            // For occurrence rows the raw row IS the full data row for that
            // specific occurrence, so all media columns are read directly from it.
            // This is the most useful tier for associatedMedia because each
            // occurrence can legitimately have a different set of photographs.
            value = resolveAssociatedMedia(directive.value, rawRow);
            break;
          case "column":
            value = resolveColumnValue(term, directive.value, rawRow);
            break;
          default: value = "";
        }
        occRow[term] = checkVocabulary(term, value);
      }

      const occStatus = (occRow["occurrenceStatus"] || "").toString().toLowerCase();
      const indCount = occRow["individualCount"];
      if (occStatus === "absent" && indCount !== "" && indCount !== undefined && Number(indCount) !== 0)
        Logger.warning(`DwC Archive: Row has occurrenceStatus="absent" but individualCount="${indCount}". Should be 0.`, "DwC Archive");

      occurrenceCsvRows.push(occRow);
    }

    if (occurrenceExportEnabled && occurrenceCsvRows.length === 0)
      Logger.warning("DwC Archive: Occurrence export enabled but no occurrence rows found.", "DwC Archive");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EML - Option C Hybrid
  //
  // Priority order:
  //   1. Customization item "Custom eml.xml location" → fetch from usercontent/ (error if fails)
  //   2. Auto-discover usercontent/eml.xml      → Logger.info if found
  //   3. Build from eml: rows                  → validate required fields
  //   4. None available                         → Logger.error, no eml.xml in archive
  // ───────────────────────────────────────────────────────────────────────────

  let emlXml = null;

  // Option C.1 - explicit path via Customization table
  const emlLocationConfig = resolveConfigDirective("Custom eml.xml location", customizationData);
  if (emlLocationConfig.found && emlLocationConfig.value) {
    const fetched = await tryFetchEml(emlLocationConfig.value);
    if (fetched) {
      emlXml = fetched;
      Logger.info(`DwC Archive: Using EML file from Customization "Custom eml.xml location": <em>${emlLocationConfig.value}</em>.`, "DwC Archive");
    } else {
      Logger.error(
        `DwC Archive: Customization item "Custom eml.xml location" is set to "<b>${emlLocationConfig.value}</b>" ` +
        `but the file could not be fetched from usercontent/${emlLocationConfig.value}. Check the path and that the file exists on your server.`,
        "DwC Archive eml.xml"
      );
      // Do not continue to fallback - the explicit path was wrong; fail loudly.
    }
  }

  // Option C.2 - auto-discover usercontent/eml.xml (only if no explicit path was set)
  if (!emlXml && !emlLocationConfig.found) {
    const fetched = await tryFetchEml("eml.xml");
    if (fetched) {
      emlXml = fetched;
      Logger.info(
        "DwC Archive: Found <em>usercontent/eml.xml</em> and included it in the archive. " +
        "Any <em>eml:</em> rows in your DwC archive table were ignored in favour of this file.",
        "DwC Archive eml.xml"
      );
    }
  }

  // Option C.3 - build from eml: rows (only if no external file found/used)
  if (!emlXml && rawEmlMappings.length > 0) {
    const emlFieldValues = {};
    for (const em of rawEmlMappings) {
      let val = "";
      if (em.constantValue !== null) {
        val = em.constantValue;
      } else if (em.directive.type === "config") {
        const { value: cv } = resolveConfigDirective(em.directive.value, customizationData);
        val = cv;
      } else if (em.directive.type === "column" && checklistRawRows?.length > 0) {
        val = resolveColumnValue("_eml", em.directive.value, checklistRawRows[0]);
      }
      emlFieldValues[em.path.toLowerCase()] = val;
    }

    const emlTitle = emlFieldValues["title"] || resolveConfigDirective("Checklist name", customizationData).value || "Untitled dataset";
    const emlAbstract = stripMarkdown(emlFieldValues["abstract"] || resolveConfigDirective("About section", customizationData).value || "");
    const emlPubDate = emlFieldValues["pubdate"] || new Date().toISOString().slice(0, 10);
    const emlPackageId = await uuidV5(UUID_NS_TAXON, `eml:${institutionCode}:${emlTitle}`);

    emlXml = buildEmlXml({
      title: emlTitle,
      abstract: emlAbstract,
      language: exportLang,
      license: licenseMapping.constantValue || "",
      licenseLabel: getLicenseLabel(licenseMapping.constantValue) || licenseMapping.constantValue || "",
      pubDate: emlPubDate,
      packageId: emlPackageId,
      creator: {
        organizationName: emlFieldValues["creator.organizationname"] || "",
        givenName: emlFieldValues["creator.givenname"] || "",
        surName: emlFieldValues["creator.surname"] || "",
        email: emlFieldValues["creator.email"] || "",
        url: emlFieldValues["creator.url"] || "",
        userId: emlFieldValues["creator.userid"] || "",
      },
      geographicDescription: emlFieldValues["geographicdescription"] || "",
      taxonomicDescription: emlFieldValues["taxonomicdescription"] || "",
      temporalDescription: emlFieldValues["temporaldescription"] || "",
    });
  }

  // Option C.4 - no EML available
  if (!emlXml) {
    Logger.error(
      "DwC Archive: No EML metadata could be generated. " +
      "Add <em>eml:</em> rows to your DwC archive table, place an <em>eml.xml</em> file in " +
      "usercontent/, or set the <em>Custom eml.xml location</em> item in the Customization table. " +
      "The archive will be produced without eml.xml but GBIF will reject datasets without EML.",
      "DwC Archive eml.xml"
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 9 - meta.xml
  // ───────────────────────────────────────────────────────────────────────────

  const termToUri = t => getDwcTerm(t)?.uri || `http://rs.tdwg.org/dwc/terms/${t}`;
  const taxonFieldUris = allTaxonTerms.map(t => termToUri(t));
  const taxonMetaXml = buildMetaXml(taxonFieldUris, "http://rs.tdwg.org/dwc/terms/Taxon", "taxa.csv");

  let occMetaXml = null;
  if (occurrenceExportEnabled && occurrenceCsvRows.length > 0) {
    const ot = ["occurrenceID", ...orderedExplicitTerms.filter(t => t !== "occurrenceID")];
    occMetaXml = buildMetaXml(ot.map(t => termToUri(t)), "http://rs.tdwg.org/dwc/terms/Occurrence", "occurrences.csv");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 10 - ZIP and return
  // ───────────────────────────────────────────────────────────────────────────

  let checklistZip = null, occurrenceZip = null;

  if (taxonCsvRows.length > 0) {
    const zip = new JSZip();
    zip.file("taxa.csv", buildCsvString(allTaxonTerms, taxonCsvRows));
    zip.file("meta.xml", taxonMetaXml);
    if (emlXml) zip.file("eml.xml", emlXml);
    checklistZip = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    Logger.info(
      `DwC Archive: Checklist archive ready - ${taxonCsvRows.length} taxon record(s) across ${taxaColumns.length} rank level(s).`,
      "DwC Archive"
    );
  } else {
    Logger.warning("DwC Archive: No taxon rows generated. Check checklist sheet and Taxa Definition table.", "DwC Archive");
  }

  if (occurrenceExportEnabled && occurrenceCsvRows.length > 0) {
    const ot = ["occurrenceID", ...orderedExplicitTerms.filter(t => t !== "occurrenceID")];
    const zip = new JSZip();
    zip.file("occurrences.csv", buildCsvString(ot, occurrenceCsvRows));
    zip.file("meta.xml", occMetaXml);
    if (emlXml) zip.file("eml.xml", emlXml); // same EML for both archives
    occurrenceZip = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    Logger.info(`DwC Archive: Occurrence archive ready - ${occurrenceCsvRows.length} occurrence record(s).`, "DwC Archive");
  }

  return { checklistZip, occurrenceZip };
}
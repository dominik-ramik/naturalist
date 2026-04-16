/**
 * DwcArchiveCompiler.js
 *
 * Produces Darwin Core Archive (DwC-A) ZIP files from a compiled NaturaList
 * checklist. Generates:
 *   - taxa_dwca.zip         — always when Tier 1 passes. Contains taxa.csv,
 *                             meta.xml, and eml.xml.
 *   - occurrences_dwca.zip  — additionally when `basisOfRecord` is present and
 *                             Tier 2 passes. Contains occurrences.csv, meta.xml,
 *                             and eml.xml (same EML as above).
 *
 * ─── Compound extraction (issue 3) ───────────────────────────────────────────
 *
 * Sub-values of compound NL types are addressed EXPLICITLY in the DwC archive
 * table Source column using a dotted suffix.  Nothing is inferred silently.
 * The user writes the full path including the component key:
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
 * Disambiguation with real sub-columns (e.g. origPub.author):
 *   1. Try the full path as an exact header in checklistHeaders.
 *   2. If found → real column, read directly (no compound extraction).
 *   3. If not found → split on last dot → check isKnownCompoundKey(type, suffix).
 *   4. Known compound key → compound extraction on root column.
 *   5. Otherwise → Logger.warning "column not found".
 *
 * ─── taxonRank (issue 2) ─────────────────────────────────────────────────────
 *
 * `taxa:ColumnName` no longer has a special case for `taxonRank`.
 * `taxa:Species` with term `taxonRank` would just read the Species column value,
 * which is a taxon name, not a rank — wrong and confusing.
 *
 * Users MUST write `auto:taxonRank` to get the rank inferred from the column's
 * position in the taxa hierarchy.  This is explicit and self-documenting.
 *
 * `taxa:ColumnName` now means exactly: "read the value in ColumnName for this row"
 * (plus optional component suffix for taxon-typed columns).
 *
 * ─── EML generation (issue 1) ────────────────────────────────────────────────
 *
 * A minimal GBIF-valid eml.xml is generated automatically.  It draws on:
 *   - title    ← resolved from `config:Checklist name` (auto)
 *   - abstract ← resolved from `config:About section` (auto, markdown stripped)
 *   - language ← `language` row
 *   - license  ← `license` row
 *   - pubDate  ← today (auto), overridable via `eml:pubDate`
 *
 * Additional EML fields are supplied via `eml:` prefix rows in the DwC archive
 * table.  The supported paths are:
 *
 *   eml:creator.organizationName
 *   eml:creator.givenName
 *   eml:creator.surName
 *   eml:creator.email
 *   eml:creator.url
 *   eml:creator.userId           (ORCID or similar)
 *   eml:pubDate                  (overrides auto date; YYYY-MM-DD)
 *   eml:geographicDescription
 *   eml:taxonomicDescription
 *   eml:temporalDescription
 *
 * If no eml: rows are present, a Logger.warning is emitted but export continues.
 * GBIF will accept the dataset with an empty creator block, but it is strongly
 * recommended to add at least eml:creator.organizationName and eml:creator.email.
 *
 * ─── Sampling Event (Tier 3) ─────────────────────────────────────────────────
 *
 * `samplingProtocol` and `eventID` rows are recognised and logged as warnings
 * but otherwise skipped.  Tier 3 support is planned for a future release.
 * No changes to the table structure will be required to enable it.
 *
 * The resulting packages should always pass https://www.gbif.org/tools/data-validator/
 */

import JSZip from "jszip";
import { getDwcTerm, normalizeLicense, getLicenseLabel } from "./dwcTermInventory.js";
import { extractCompoundValue, isKnownCompoundKey } from "./dwcCompoundExtractor.js";
import { getAvailableDataTypeNames, loadDataByType } from "../customTypes/index.js";
import { Logger } from "../../components/Logger.js";
import { OCCURRENCE_IDENTIFIER } from "../nlDataStructureSheets.js";

// ═══════════════════════════════════════════════════════════════════════════════
// UUID v5 — self-contained, no external dependency (RFC 4122 §4.3)
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
  const fields = fieldUris.slice(1)
    .map((uri, i) => uri ? `    <field index="${i + 1}" term="${uri}"/>` : null)
    .filter(Boolean).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<archive xmlns="http://rs.tdwg.org/dwc/text/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://rs.tdwg.org/dwc/text/ http://rs.tdwg.org/dwc/text/tdwg_dwc_text.xsd">
  <core encoding="UTF-8" fieldsTerminatedBy="," linesTerminatedBy="&#10;"
        fieldsEnclosedBy="&quot;" ignoreHeaderLines="1"
        rowType="${rowType}">
    <files><location>${dataFile}</location></files>
    <id index="0"/>
${fields}
  </core>
</archive>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// eml.xml generation
//
// Produces a minimal EML 2.1.1 document that satisfies GBIF's indexing
// requirements.  Only non-empty fields are emitted; optional coverage blocks
// are omitted entirely if their values are empty.
// ═══════════════════════════════════════════════════════════════════════════════

function buildEmlXml(opts) {
  /** XML-escape a string for safe embedding in element content and attributes. */
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
${creatorBlock}${metadataProviderBlock}    <pubDate>${e(opts.pubDate)}</pubDate>
    <language>${e(opts.language)}</language>
    <abstract><para>${e(opts.abstract)}</para></abstract>
${geoCoverage}${taxCoverage}${tempCoverage}    <intellectualRights>
      <para>This work is licensed under a <ulink url="${e(opts.license)}"><citetitle>${e(opts.licenseLabel)}</citetitle></ulink>.</para>
    </intellectualRights>
${contactBlock}
  </dataset>
</eml:eml>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Markdown stripping (for EML abstract and DwC string fields sourced from markdown)
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
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Source column directive parsing
//
// Supported directive types and examples:
//
//   config:Checklist name      → type:"config",   value:"Checklist name",  component:null
//   eml:creator.email          → type:"eml",      value:"creator.email",   component:null
//   taxa:Species               → type:"taxa",      value:"Species",         component:null
//   taxa:Species.authority     → type:"taxa",      value:"Species",         component:"authority"
//   taxa:Species.lastNamePart  → type:"taxa",      value:"Species",         component:"lastNamePart"
//   auto:taxonRank             → type:"auto",      value:"taxonRank",       component:null
//   {redlist} | Notes: {notes} → type:"template",  value:(raw string),      component:null
//   location.lat               → type:"column",    value:"location.lat",    component:null
//   recordedBy                 → type:"column",    value:"recordedBy",      component:null
//   (blank)                    → type:"empty",     value:"",                component:null
//
// Note: for `column` type, the compound-path detection (e.g. "altitude.from")
// happens later in resolveColumnValue, not here.  This keeps the parser simple.
// ═══════════════════════════════════════════════════════════════════════════════

function parseSourceDirective(raw) {
  const s = (raw || "").toString().trim();
  if (!s) return { type: "empty", value: "", component: null };
  const lo = s.toLowerCase();

  if (lo.startsWith("config:")) return { type: "config", value: s.slice(7).trim(), component: null };
  if (lo.startsWith("eml:")) return { type: "eml", value: s.slice(4).trim(), component: null };
  if (lo.startsWith("auto:")) return { type: "auto", value: s.slice(5).trim(), component: null };

  if (lo.startsWith("taxa:")) {
    const rest = s.slice(5).trim();        // e.g. "Species.authority"
    const dot = rest.indexOf(".");
    if (dot >= 0) {
      return { type: "taxa", value: rest.slice(0, dot).trim(), component: rest.slice(dot + 1).trim() || null };
    }
    return { type: "taxa", value: rest, component: null };
  }

  if (s.includes("{")) return { type: "template", value: s, component: null };
  return { type: "column", value: s, component: null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// config: directive resolver
// ═══════════════════════════════════════════════════════════════════════════════

function resolveConfigDirective(itemName, customizationRows) {
  if (!Array.isArray(customizationRows) || !itemName) return "";
  const target = itemName.toLowerCase();
  const found = customizationRows.find(r => (r.item || "").toLowerCase() === target);
  return found ? (found.value || "").toString().trim() : "";
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

// Known compound keys per NL type — used in warning messages
const KNOWN_KEYS_BY_TYPE = {
  geopoint: "lat, long, verbatim",
  interval: "from, to",
  taxon: "name, authority, lastNamePart",
  date: "iso8601, year, month, day",
  image: "source",
  sound: "source",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main entry-point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build and return DwC Archive ZIP blobs.
 *
 * @param {Object}     params
 * @param {Object[]}   params.dwcTableRows       Rows from 'DwC archive' table.
 *                                               Each row: { term, sourceColumn, constantValue }
 * @param {Object}     params.compiledTree        Full compiled checklist (available for future use)
 * @param {Object[]}   params.taxaColumnDefs      Taxa Definition table rows: { columnName, taxonName, … }
 * @param {Object[]}   params.customizationData   Customization table rows: { item, value }
 * @param {Object[]}   params.cddRows             Custom Data Definition rows: { columnName, formatting, … }
 * @param {string[]}   params.checklistHeaders    Lowercased column-header array from the checklist sheet
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
  } = params;

  const NULL_RESULT = { checklistZip: null, occurrenceZip: null };
  if (!Array.isArray(dwcTableRows) || dwcTableRows.length === 0) return NULL_RESULT;

  // ───────────────────────────────────────────────────────────────────────────
  // Step 1 — Parse table rows
  //
  // Rows beginning with `eml:` go into rawEmlMappings (for EML generation).
  // All other rows go into parsedMappings (for CSV generation).
  // ───────────────────────────────────────────────────────────────────────────

  const parsedMappings = []; // DwC CSV mappings
  const rawEmlMappings = []; // eml: rows (resolved later)

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
  // Step 2 — Export language
  // ───────────────────────────────────────────────────────────────────────────

  const langMapping = mappingByTerm.get("language");
  if (!langMapping?.constantValue) {
    Logger.error(
      "DwC Archive: <b>language</b> row is missing or has no Constant value. " +
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
  // Step 3 — Tier 1 validation
  // ───────────────────────────────────────────────────────────────────────────

  const instCodeMapping = mappingByTerm.get("institutionCode");
  if (!instCodeMapping?.constantValue) {
    Logger.error(
      "DwC Archive: <b>institutionCode</b> is missing or not a Constant value. Required. Export aborted.",
      "DwC Archive"
    );
    return NULL_RESULT;
  }
  const institutionCode = instCodeMapping.constantValue;

  const collCodeMapping = mappingByTerm.get("collectionCode");
  const collectionCode = collCodeMapping?.constantValue || "";
  if (!collCodeMapping) Logger.warning("DwC Archive: <b>collectionCode</b> not configured. Recommended for GBIF.", "DwC Archive");

  const licenseMapping = mappingByTerm.get("license");
  if (!licenseMapping?.constantValue) {
    Logger.error("DwC Archive: <b>license</b> row missing. Export aborted.", "DwC Archive");
    return NULL_RESULT;
  }
  const normalizedLicense = normalizeLicense(licenseMapping.constantValue);
  if (!normalizedLicense) {
    Logger.warning(
      `DwC Archive: License "${licenseMapping.constantValue}" is not a GBIF-accepted URI. ` +
      `Use CC0, CC BY 4.0, or CC BY-NC 4.0 for GBIF submission.`, "DwC Archive"
    );
  } else if (normalizedLicense !== licenseMapping.constantValue) {
    Logger.info(`DwC Archive: License alias normalized → "${normalizedLicense}".`, "DwC Archive");
    licenseMapping.constantValue = normalizedLicense;
  }

  if (!mappingByTerm.has("datasetName"))
    Logger.warning("DwC Archive: <b>datasetName</b> not configured. Recommended.", "DwC Archive");

  const hasTaxaColumns = Array.isArray(taxaColumnDefs) && taxaColumnDefs.length > 0;
  if (!mappingByTerm.has("scientificName") && !hasTaxaColumns) {
    Logger.error("DwC Archive: <b>scientificName</b> cannot be resolved. Export aborted.", "DwC Archive");
    return NULL_RESULT;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 4 — Tier 2 detection
  // ───────────────────────────────────────────────────────────────────────────

  const borMapping = mappingByTerm.get("basisOfRecord");
  let occurrenceExportEnabled = false;

  if (borMapping) {
    const borVal = borMapping.constantValue || "";
    const borVocab = getDwcTerm("basisOfRecord")?.vocabulary || [];
    if (!borVal) {
      Logger.error(`DwC Archive: <b>basisOfRecord</b> present but has no Constant value. Allowed: ${borVocab.join(", ")}. Occurrence export disabled.`, "DwC Archive");
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
      const hasLat = mappingByTerm.has("decimalLatitude"), hasLon = mappingByTerm.has("decimalLongitude"), hasDatum = mappingByTerm.has("geodeticDatum");
      if ((hasLat || hasLon || hasDatum) && !(hasLat && hasLon && hasDatum)) {
        Logger.error("DwC Archive: <b>decimalLatitude</b>, <b>decimalLongitude</b>, and <b>geodeticDatum</b> must all be present or all absent.", "DwC Archive");
      }
    }
  }

  for (const t3 of ["samplingProtocol", "eventID"]) {
    if (mappingByTerm.has(t3)) {
      Logger.warning(`DwC Archive: Term <b>${t3}</b> (Tier 3 — Sampling Event) is not yet supported and will be skipped.`, "DwC Archive");
      mappingByTerm.delete(t3);
      const i = parsedMappings.findIndex(m => m.term === t3);
      if (i >= 0) parsedMappings.splice(i, 1);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 5 — Per-row type compatibility check
  // ───────────────────────────────────────────────────────────────────────────

  for (const m of parsedMappings) {
    if (m.directive.type !== "column") continue;
    const termEntry = getDwcTerm(m.term);
    if (!termEntry?.acceptedNlTypes) continue;
    const colName = m.directive.value;
    const exactIdx = checklistHeaders.indexOf(colName.toLowerCase());
    const rootName = exactIdx < 0 && colName.lastIndexOf(".") > 0
      ? colName.slice(0, colName.lastIndexOf("."))
      : colName;
    const nlFmt = getNlFormatting(rootName, cddRows, taxaColumnDefs);
    if (!termEntry.acceptedNlTypes.includes(nlFmt)) {
      Logger.error(
        `DwC Archive: Term <b>${m.term}</b> mapped to "<b>${colName}</b>" (NL type: <b>${nlFmt}</b>), ` +
        `but only accepts: ${termEntry.acceptedNlTypes.join(", ")}.`, "DwC Archive"
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 6 — Unknown terms
  // ───────────────────────────────────────────────────────────────────────────

  for (const m of parsedMappings) {
    if (m.term === "language") continue;
    if (!getDwcTerm(m.term)) Logger.info(`DwC Archive: Term "<b>${m.term}</b>" not in inventory — output without guardrails.`, "DwC Archive");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Shared helpers (closures over params)
  // ───────────────────────────────────────────────────────────────────────────

  const buildContext = rawRow => ({ headers: checklistHeaders, row: rawRow, langCode: exportLang });

  /**
   * Read a column value, supporting both exact headers and explicit compound paths.
   *
   * "altitude.from" → if "altitude.from" is not a real header, reads "altitude"
   * (interval type) and extracts component "from" via extractCompoundValue.
   * "origPub.author" → found as exact header → reads directly.
   */
  const resolveColumnValue = (termName, columnName, rawRow) => {
    const exactIdx = checklistHeaders.indexOf(columnName.toLowerCase());

    if (exactIdx >= 0) {
      // Real column
      const nlFmt = getNlFormatting(columnName, cddRows, taxaColumnDefs);
      if (!getAvailableDataTypeNames().includes(nlFmt)) {
        Logger.warning(`DwC Archive: Column "<b>${columnName}</b>" has unsupported type "${nlFmt}". Skipped.`, "DwC Archive");
        return "";
      }
      let raw;
      try { raw = loadDataByType(buildContext(rawRow), columnName, { formatting: nlFmt }); }
      catch (ex) { Logger.warning(`DwC Archive: Error reading "<b>${columnName}</b>": ${ex.message}`, "DwC Archive"); return ""; }
      if (raw === null || raw === undefined) return "";
      const te = getDwcTerm(termName);
      return coerceOutputFormat(raw, te?.outputFormat || "string", termName, nlFmt, te?.validationRange);
    }

    // Try compound path: split on last dot
    const lastDot = columnName.lastIndexOf(".");
    if (lastDot > 0) {
      const rootName = columnName.slice(0, lastDot);
      const componentKey = columnName.slice(lastDot + 1);
      const rootIdx = checklistHeaders.indexOf(rootName.toLowerCase());

      if (rootIdx >= 0) {
        const nlFmt = getNlFormatting(rootName, cddRows, taxaColumnDefs);
        if (!isKnownCompoundKey(nlFmt, componentKey)) {
          Logger.warning(
            `DwC Archive: "<b>${columnName}</b>" not found as header, and "<b>${componentKey}</b>" ` +
            `is not a known compound key for type "${nlFmt}". ` +
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
        const extracted = extractCompoundValue(nlFmt, componentKey, raw, Logger);
        const te = getDwcTerm(termName);
        return coerceOutputFormat(extracted, te?.outputFormat || "string", termName, nlFmt, te?.validationRange);
      }
    }

    Logger.warning(`DwC Archive: Column "<b>${columnName}</b>" not found in checklist headers.`, "DwC Archive");
    return "";
  };

  const checkVocabulary = (termName, value) => {
    if (!value || value === "") return value;
    const te = getDwcTerm(termName);
    if (!te?.vocabulary?.length) return value;
    if (!te.vocabulary.includes(String(value)))
      Logger.warning(`DwC Archive: Value "<b>${value}</b>" for <b>${termName}</b> not in controlled vocabulary (${te.vocabulary.join(", ")}). Output as-is.`, "DwC Archive");
    return value;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Taxa / occurrence column indexes
  // ───────────────────────────────────────────────────────────────────────────

  const allTaxaDefs = (taxaColumnDefs || []).filter(t => t?.columnName);
  const occurrenceLevelDef = allTaxaDefs.find(t => (t.taxonName || "").toLowerCase() === OCCURRENCE_IDENTIFIER);
  const taxaColumns = allTaxaDefs.filter(t => (t.taxonName || "").toLowerCase() !== OCCURRENCE_IDENTIFIER);
  const taxaColHeaderIndices = taxaColumns.map(t => checklistHeaders.indexOf(t.columnName.toLowerCase()));
  const occColHeaderIndex = occurrenceLevelDef
    ? checklistHeaders.indexOf(occurrenceLevelDef.columnName.toLowerCase()) : -1;

  // ───────────────────────────────────────────────────────────────────────────
  // Step 7 — Unique taxon paths + taxonID pre-computation
  // ───────────────────────────────────────────────────────────────────────────

  const uniqueTaxaMap = new Map(); // path-key → { path, rankIndex, rankColumnName, representativeRawRow }
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
        uniqueTaxaMap.set(key, { path: path.slice(0, i + 1), rankIndex: i, rankColumnName: taxaColumns[i].columnName, representativeRawRow: rawRow });
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
  // Core value resolver for taxon rows
  //
  // Directive semantics:
  //
  //   taxa:ColumnName           → read ColumnName column value for this raw row.
  //                               EMPTY for rows at a rank higher than ColumnName
  //                               (correct and expected — use auto:scientificName
  //                               if you want the current taxon's own name).
  //
  //   taxa:ColumnName.component → load ColumnName as taxon-typed, extract component.
  //
  //   auto:taxonRank            → inferred from column position in taxa hierarchy.
  //   auto:taxonID              → UUID v5 for this taxon.
  //   auto:parentNameUsageID    → UUID v5 of the immediate parent taxon.
  //   auto:scientificName       → current taxon's own name at its rank level.
  //   auto:scientificNameAuthorship       → current taxon's own authorship at its rank level.
  //
  // There is NO implicit dispatch on DwC term name.  The user declares exactly
  // what they want via the directive.
  // ───────────────────────────────────────────────────────────────────────────

  const resolveForTaxon = (mapping, taxon) => {
    const { term, directive, constantValue } = mapping;
    const rawRow = taxon.representativeRawRow;

    if (constantValue !== null) return checkVocabulary(term, constantValue);

    switch (directive.type) {

      case "config":
        return resolveConfigDirective(directive.value, customizationData);

      case "taxa": {
        const { value: colName, component } = directive;
        if (!component) {
          // Read the column value for this row.  For higher-rank rows the
          // lower columns will be empty — this is the correct behaviour.
          // Users wanting the current taxon's own name use `auto:scientificName`.
          const ci = checklistHeaders.indexOf(colName.toLowerCase());
          return ci >= 0 && rawRow[ci] != null ? rawRow[ci].toString().trim() : "";
        }
        // Component suffix → load as taxon type, extract named component
        const taxonData = loadDataByType(buildContext(rawRow), colName, { formatting: "taxon" });
        if (!taxonData) return "";
        const ext = extractCompoundValue("taxon", component, taxonData, Logger);
        const te = getDwcTerm(term);
        return coerceOutputFormat(ext ?? "", te?.outputFormat || "string", term, "taxon", te?.validationRange);
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
            // This is the ONLY valid way to get the DwC taxonRank inferred from the
            // column hierarchy.  `taxa:Species` with term `taxonRank` does NOT do
            // this — it would just read the Species column value (a taxon name, not
            // a rank).  `auto:taxonRank` is explicit and unambiguous.
            return columnNameToRankVocab(taxon.rankColumnName);
          case "scientificname":
            // The current taxon's own name at its rank level, regardless of which
            // column it lives in.  Distinct from `taxa:Species` which is only
            // non-empty for species-level rows.
            return taxon.path[taxon.rankIndex] || "";
          case "scientificnameauthorship":
            // The current taxon's own authorship at its rank level, regardless of which
            // column it lives in.  Distinct from `taxa:Species` which is only
            // non-empty for species-level rows.
            return taxon.path[taxon.rankIndex + 1] || "";
          case "occurrenceid":
            Logger.warning("DwC Archive: <b>auto:occurrenceID</b> is only valid in occurrence rows.", "DwC Archive");
            return "";
          default:
            Logger.warning(`DwC Archive: Unknown auto: directive "auto:${directive.value}" for <b>${term}</b>.`, "DwC Archive");
            return "";
        }
      }

      case "template":
        return renderTemplate(directive.value, cn => resolveColumnValue("_template", cn, rawRow) || "");

      case "column":
        return checkVocabulary(term, resolveColumnValue(term, directive.value, rawRow));

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
  // Step 8 — Build occurrence CSV rows (Tier 2)
  //
  // Taxonomy fields are inherited from the parent taxon when the occurrence
  // row itself has an empty value in the mapped source column.  This uses the
  // same readFromRow helper for both the occurrence row and the parent's
  // representative row — no special-casing per DwC term.
  // ───────────────────────────────────────────────────────────────────────────

  const occurrenceCsvRows = [];

  // These terms trigger inheritance logic when their directive is taxa:-typed
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
        // Will be overwritten in the term loop
      } else if (catMapping?.directive.type === "column") {
        const catNum = resolveColumnValue("catalogNumber", catMapping.directive.value, rawRow);
        if (catNum) occurrenceId = collectionCode ? `${institutionCode}:${collectionCode}:${catNum}` : `${institutionCode}:${catNum}`;
      }
      if (!occurrenceId) {
        const sciName = parentTaxon ? (parentTaxon.path[parentTaxon.rankIndex] || "") : "";
        const edMap = mappingByTerm.get("eventDate");
        const edVal = edMap?.directive.type === "column" ? (resolveColumnValue("eventDate", edMap.directive.value, rawRow) || "") : "";
        const latMap = mappingByTerm.get("decimalLatitude");
        const latVal = latMap?.directive.type === "column" ? (resolveColumnValue("decimalLatitude", latMap.directive.value, rawRow) || "") : "";
        const lonMap = mappingByTerm.get("decimalLongitude");
        const lonVal = lonMap?.directive.type === "column" ? (resolveColumnValue("decimalLongitude", lonMap.directive.value, rawRow) || "") : "";
        occurrenceId = await uuidV5(UUID_NS_OCCURRENCE, `${sciName}:${edVal}:${latVal}:${lonVal}`);
        Logger.warning("DwC Archive: No catalogNumber — UUID v5 fallback used for <b>occurrenceID</b>. Add a catalogNumber for stable IDs.", "DwC Archive");
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
          // Uniform inheritance: try occurrence row, fall back to parent row.
          // No term-specific dispatch — the component suffix in the directive
          // (e.g. .authority, .lastNamePart) fully describes what to extract.
          const readFromRow = (sourceRow) => {
            const { value: colName, component } = directive;
            if (!component) {
              const ci = checklistHeaders.indexOf(colName.toLowerCase());
              return ci >= 0 && sourceRow[ci] != null ? sourceRow[ci].toString().trim() : "";
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
          case "config":
            value = resolveConfigDirective(directive.value, customizationData); break;
          case "auto": {
            const ak = directive.value.toLowerCase().replace(/\s+/g, "");
            if (ak === "occurrenceid") value = occurrenceId;
            else if (ak === "scientificname") value = parentTaxon ? (parentTaxon.path[parentTaxon.rankIndex] || "") : "";
            else if (ak === "taxonrank") value = parentTaxon ? columnNameToRankVocab(parentTaxon.rankColumnName) : "";
            else if (ak === "taxonid") value = parentKey ? (taxonIdByKey.get(parentKey) || "") : "";
            else Logger.warning(`DwC Archive: Unknown auto: directive "auto:${directive.value}" in occurrence row.`, "DwC Archive");
            break;
          }
          case "taxa": {
            const { value: colName, component } = directive;
            if (!component) {
              const ci = checklistHeaders.indexOf(colName.toLowerCase());
              value = ci >= 0 && rawRow[ci] != null ? rawRow[ci].toString().trim() : "";
            } else {
              const taxonData = loadDataByType(buildContext(rawRow), colName, { formatting: "taxon" });
              if (taxonData) { const ext = extractCompoundValue("taxon", component, taxonData, Logger); value = ext ? String(ext) : ""; }
            }
            break;
          }
          case "template":
            value = renderTemplate(directive.value, cn => resolveColumnValue("_template", cn, rawRow) || ""); break;
          case "column":
            value = resolveColumnValue(term, directive.value, rawRow); break;
          default: value = "";
        }
        occRow[term] = checkVocabulary(term, value);
      }

      // Cross-field: absent ↔ individualCount=0
      const occStatus = (occRow["occurrenceStatus"] || "").toString().toLowerCase();
      const indCount = occRow["individualCount"];
      if (occStatus === "absent" && indCount !== "" && indCount !== undefined && Number(indCount) !== 0)
        Logger.warning(`DwC Archive: Row has <b>occurrenceStatus="absent"</b> but <b>individualCount="${indCount}"</b>. Should be 0.`, "DwC Archive");

      occurrenceCsvRows.push(occRow);
    }

    if (occurrenceExportEnabled && occurrenceCsvRows.length === 0)
      Logger.warning("DwC Archive: Occurrence export enabled but no occurrence rows found. Verify Taxa Definition has an 'Occurrence' row.", "DwC Archive");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // EML — resolve eml: rows then build
  // ───────────────────────────────────────────────────────────────────────────

  const emlFieldValues = {};
  for (const em of rawEmlMappings) {
    let val = "";
    if (em.constantValue !== null) {
      val = em.constantValue;
    } else if (em.directive.type === "config") {
      val = resolveConfigDirective(em.directive.value, customizationData);
    } else if (em.directive.type === "column" && checklistRawRows?.length > 0) {
      val = resolveColumnValue("_eml", em.directive.value, checklistRawRows[0]);
    }
    emlFieldValues[em.path] = val;
  }

  if (!Object.keys(emlFieldValues).some(k => k.startsWith("creator."))) {
    Logger.warning(
      "DwC Archive: No <b>eml:</b> creator rows found. The EML will have an empty creator. " +
      "Add <em>eml:creator.organizationName</em> and <em>eml:creator.email</em> rows to your DwC archive table.",
      "DwC Archive"
    );
  }

  const emlTitle = emlFieldValues["title"] || resolveConfigDirective("Checklist name", customizationData) || "Untitled dataset";
  const emlAbstract = stripMarkdown(emlFieldValues["abstract"] || resolveConfigDirective("About section", customizationData) || "");
  const emlPubDate = emlFieldValues["pubDate"] || new Date().toISOString().slice(0, 10);
  const emlPackageId = await uuidV5(UUID_NS_TAXON, `eml:${institutionCode}:${emlTitle}`);

  const emlXml = buildEmlXml({
    title: emlTitle, abstract: emlAbstract, language: exportLang,
    license: licenseMapping.constantValue || "",
    licenseLabel: getLicenseLabel(licenseMapping.constantValue) || licenseMapping.constantValue || "",
    pubDate: emlPubDate,
    packageId: emlPackageId,
    creator: {
      organizationName: emlFieldValues["creator.organizationName"] || "",
      givenName: emlFieldValues["creator.givenName"] || "",
      surName: emlFieldValues["creator.surName"] || "",
      email: emlFieldValues["creator.email"] || "",
      url: emlFieldValues["creator.url"] || "",
      userId: emlFieldValues["creator.userId"] || "",
    },
    geographicDescription: emlFieldValues["geographicDescription"] || "",
    taxonomicDescription: emlFieldValues["taxonomicDescription"] || "",
    temporalDescription: emlFieldValues["temporalDescription"] || "",
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Step 9 — meta.xml
  // ───────────────────────────────────────────────────────────────────────────

  const termToUri = t => getDwcTerm(t)?.uri || `http://rs.tdwg.org/dwc/terms/${t}`;
  const taxonFieldUris = allTaxonTerms.map((t, i) => i === 0 ? null : termToUri(t));
  const taxonMetaXml = buildMetaXml(taxonFieldUris, "http://rs.tdwg.org/dwc/terms/Taxon", "taxa.csv");

  let occMetaXml = null;
  if (occurrenceExportEnabled && occurrenceCsvRows.length > 0) {
    const ot = ["occurrenceID", ...orderedExplicitTerms.filter(t => t !== "occurrenceID")];
    occMetaXml = buildMetaXml(ot.map((t, i) => i === 0 ? null : termToUri(t)), "http://rs.tdwg.org/dwc/terms/Occurrence", "occurrences.csv");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Step 10 — ZIP and return
  // ───────────────────────────────────────────────────────────────────────────

  let checklistZip = null, occurrenceZip = null;

  if (taxonCsvRows.length > 0) {
    const zip = new JSZip();
    zip.file("taxa.csv", buildCsvString(allTaxonTerms, taxonCsvRows));
    zip.file("meta.xml", taxonMetaXml);
    zip.file("eml.xml", emlXml);
    checklistZip = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    Logger.info(`DwC Archive: Checklist archive ready — ${taxonCsvRows.length} taxon record(s) across ${taxaColumns.length} rank level(s).`, "DwC Archive");
  } else {
    Logger.warning("DwC Archive: No taxon rows generated. Check checklist sheet and Taxa Definition table.", "DwC Archive");
  }

  if (occurrenceExportEnabled && occurrenceCsvRows.length > 0) {
    const ot = ["occurrenceID", ...orderedExplicitTerms.filter(t => t !== "occurrenceID")];
    const zip = new JSZip();
    zip.file("occurrences.csv", buildCsvString(ot, occurrenceCsvRows));
    zip.file("meta.xml", occMetaXml);
    zip.file("eml.xml", emlXml); // same EML for both archives
    occurrenceZip = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    Logger.info(`DwC Archive: Occurrence archive ready — ${occurrenceCsvRows.length} occurrence record(s).`, "DwC Archive");
  }

  return { checklistZip, occurrenceZip };
}
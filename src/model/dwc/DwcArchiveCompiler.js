/**
 * DwcArchiveCompiler.js
 *
 * Replaces the retired DwC compiler entirely.
 *
 * Exports a single async function `compileDwcArchive(opts)` that:
 *   1. Segments the dwcArchive table rows by exportTo target.
 *   2. For each non-empty target (checklist / occurrences):
 *      a. Validates DwC term namespaces and required terms.
 *      b. Handles EML (precomposed file or assembled from eml: rows).
 *      c. Builds the CSV via DwcTreeExpander + DwcValueResolver.
 *      d. Builds meta.xml.
 *      e. Packages the ZIP blob.
 *   3. Returns { checklist: Blob|null, occurrences: Blob|null }.
 *
 * All errors and warnings are routed through Logger - never thrown - so that
 * ManageView's Logger.hasErrors() gate works correctly.
 */

import { Logger } from "../../components/Logger.js";
import { prefixToNamespace, termsMeta } from "./termInventory.js";
import { buildCsvString } from "./buildCsv.js";
import { buildMetaXml } from "./buildMeta.js";
import { buildEmlXml } from "./buildEml.js";
import { buildZip } from "./buildZip.js";
import { expandToTaxonNodes, findOccurrenceLevelIndex } from "./DwcTreeExpander.js";
import { resolve } from "./DwcValueResolver.js";
import { DWC_ARCHIVE_TYPES, OCCURRENCE_IDENTIFIER } from "../nlDataStructureSheets.js";
import { DEFAULT_LOCALE_CODE } from "../../i18n/availableLocalesInfo.js";

const LOG_TAG = "DwC Archive";

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Compile DwC archives from the compiled checklist and configuration tables.
 *
 * @param {Object}   opts
 * @param {Object[]} opts.dwcTableRows
 *   Already-resolved rows from data.sheets.content.tables.dwcArchive.data[defaultLangCode].
 *   Each row: { exportTo, term, valueSource }
 * @param {Object}   opts.compiledChecklist
 *   The full compiledChecklistCache object (not just one version).
 * @param {Array}    opts.taxaColumnDefs
 *   Rows from data.sheets.content.tables.taxa.data[defaultLangCode].
 *   Each row has: { columnName, taxonName, ... }
 * @param {Array}    opts.customizationData
 *   data.sheets.appearance.tables.customization.data[defaultLangCode]
 * @param {Array}    opts.cddRows
 *   data.sheets.content.tables.customDataDefinition.data[defaultLangCode]
 * @param {string}   opts.defaultLangCode
 * @param {Function} opts.mediaUrlResolver
 *   (rawSource: string, columnName: string) => string
 *   Callback that resolves a raw media source to a full URL. Lives in the
 *   DataManager closure because it requires window.location context.
 *
 * @returns {Promise<{checklist: Blob|null, occurrences: Blob|null}>}
 */
export async function compileDwcArchive(opts) {
  const {
    dwcTableRows,
    compiledChecklist,
    taxaColumnDefs,
    customizationData,
    cddRows,
    defaultLangCode,
    mediaUrlResolver,
  } = opts;

  const result = { checklist: null, occurrences: null };

  if (!dwcTableRows || dwcTableRows.length === 0) return result;

  // Abort if compilation produced errors - no point writing corrupt archives.
  if (Logger.hasErrors && Logger.hasErrors()) {
    Logger.warning(
      "DwC archive compilation skipped because the checklist has errors. " +
      "Fix all errors first, then re-compile.",
      LOG_TAG
    );
    return result;
  }

  // ── Pre-build cddByPath: Map<lowercaseColName, cddRow> ──────────────────
  const cddByPath = buildCddByPath(cddRows);

  // ── Locate the occurrence rank level index ───────────────────────────────
  const occurrenceLevelIndex = findOccurrenceLevelIndex(
    taxaColumnDefs,
    OCCURRENCE_IDENTIFIER
  );

  // ── Get the compiled checklist entries for the default language ──────────
  const compiledEntries =
    compiledChecklist?.versions?.[defaultLangCode]?.dataset?.checklist || [];

  if (compiledEntries.length === 0) {
    Logger.warning("DwC Archive: no compiled checklist entries found.", LOG_TAG);
    return result;
  }

  // ── Segment rows by target ───────────────────────────────────────────────
  const rowsByTarget = {};
  for (const archiveType of Object.keys(DWC_ARCHIVE_TYPES)) {
    rowsByTarget[archiveType] = dwcTableRows.filter(
      r => (r.exportTo || "").trim().toLowerCase() === archiveType
    );
  }

  // ── Compile each non-empty target ────────────────────────────────────────
  for (const [archiveType, typeConfig] of Object.entries(DWC_ARCHIVE_TYPES)) {
    const rows = rowsByTarget[archiveType] || [];
    if (rows.length === 0) continue;

    const blob = await compileTarget({
      archiveType,
      typeConfig,
      rows,
      compiledEntries,
      taxaColumnDefs,
      customizationData,
      cddByPath,
      occurrenceLevelIndex,
      mediaUrlResolver,
      cddRows,
    });

    result[archiveType] = blob;
  }

  return result;
}

// ─── Per-target compilation ───────────────────────────────────────────────────

async function compileTarget(opts) {
  const {
    archiveType,
    typeConfig,
    rows,
    compiledEntries,
    taxaColumnDefs,
    customizationData,
    cddByPath,
    occurrenceLevelIndex,
    mediaUrlResolver,
    cddRows,
  } = opts;

  // ── 1. Separate eml: rows from DwC term rows ─────────────────────────────
  const emlRows = rows.filter(r => (r.term || "").startsWith("eml:"));
  const dwcRows = rows.filter(r => !(r.term || "").startsWith("eml:"));

  // ── 2. Validate DwC term namespace prefixes ──────────────────────────────
  let namespaceErrors = 0;
  for (const row of dwcRows) {
    const term = (row.term || "").trim();
    const colonIdx = term.indexOf(":");
    if (colonIdx === -1) {
      Logger.error(
        `DwC Archive (${archiveType}): term "${term}" has no namespace prefix. ` +
        `Use e.g. "dwc:scientificName".`,
        LOG_TAG
      );
      namespaceErrors++;
      continue;
    }
    const prefix = term.slice(0, colonIdx);
    if (!prefixToNamespace(prefix)) {
      Logger.error(
        `DwC Archive (${archiveType}): unknown namespace prefix "${prefix}" in term "${term}". ` +
        `Supported: dwc, dcterms, dwciri, dc.`,
        LOG_TAG
      );
      namespaceErrors++;
    }
  }
  if (namespaceErrors > 0) return null;

  // ── 3. Validate required / optional terms ────────────────────────────────
  const targetTermsMeta = termsMeta[archiveType] || [];
  const configuredTerms = new Set(dwcRows.map(r => (r.term || "").trim()));

  for (const termDef of targetTermsMeta) {
    if (configuredTerms.has(termDef.term)) continue;

    if (termDef.presence === "required" || termDef.presence === "critical") {
      Logger.warning(
        `DwC Archive (${archiveType}): required term "${termDef.term}" is not configured. ` +
        `Add a row with exportTo="${archiveType}" and term="${termDef.term}".`,
        LOG_TAG
      );
    } else if (termDef.presence === "optional") {
      Logger.info &&
        Logger.info(
          `DwC Archive (${archiveType}): optional term "${termDef.term}" is absent.`,
          LOG_TAG
        );
    }
  }

  // ── 4. Handle EML ────────────────────────────────────────────────────────
  let emlContent = null;
  const precomposedRow = emlRows.find(r => r.term === "eml:precomposed");

  if (precomposedRow) {
    const vs = (precomposedRow.valueSource || "").trim();
    if (vs === "") {
      Logger.error(
        `DwC Archive (${archiveType}): "eml:precomposed" row has an empty value source.`,
        LOG_TAG
      );
      // Continue without EML
    } else {
      // F-directives are already resolved by DataManager's pre-pass,
      // so the value is the raw XML string.
      emlContent = vs;
    }
  } else if (emlRows.length > 0) {
    // Assemble EML from individual eml: rows
    emlContent = buildEmlFromRows(emlRows, archiveType, customizationData);
  }

  if (!emlContent) {
    Logger.warning(
      `DwC Archive (${archiveType}): no EML metadata configured. ` +
      `Add "eml:precomposed" or individual "eml:*" rows.`,
      LOG_TAG
    );
  }

  // ── 5. Build the field list (term columns) ───────────────────────────────
  // Order: as declared in the user's dwcArchive table.
  // We deduplicate by term (first occurrence wins) in case of accidental duplicates.
  const seenTerms = new Set();
  const termColumns = []; // { term, valueSource, uri }

  for (const row of dwcRows) {
    const term = (row.term || "").trim();
    if (!term || seenTerms.has(term)) continue;
    seenTerms.add(term);

    const colonIdx = term.indexOf(":");
    const prefix = term.slice(0, colonIdx);
    const localPart = term.slice(colonIdx + 1);
    const ns = prefixToNamespace(prefix);
    const uri = ns ? ns + localPart : null;

    termColumns.push({ term, localPart, valueSource: (row.valueSource || "").trim(), uri });
  }

  if (termColumns.length === 0) {
    Logger.error(
      `DwC Archive (${archiveType}): no DwC term rows found. Nothing to export.`,
      LOG_TAG
    );
    return null;
  }

  // ── 6. Build the data rows ───────────────────────────────────────────────
  const { csvColumns, csvRows } = buildDataRows({
    archiveType,
    termColumns,
    compiledEntries,
    taxaColumnDefs,
    customizationData,
    cddByPath,
    occurrenceLevelIndex,
    mediaUrlResolver,
  });

  if (csvRows.length === 0) {
    Logger.warning(
      `DwC Archive (${archiveType}): no rows were generated. ` +
      `Check that your data sheet has rows matching this archive type.`,
      LOG_TAG
    );
  }

  // ── 7. Build CSV ──────────────────────────────────────────────────────────
  const csvContent = buildCsvString(csvColumns, csvRows);

  // ── 8. Build meta.xml ────────────────────────────────────────────────────
  const fieldUris = termColumns.map(tc => tc.uri);
  const emlFileName = emlContent ? "eml.xml" : null;
  // Determine the ID term URI so <id index="N"/> points to the right column.
  const idTermLocalName = archiveType === "occurrences" ? "occurrenceID" : "taxonID";
  const idTermUri = "http://rs.tdwg.org/dwc/terms/" + idTermLocalName;

  const metaXml = buildMetaXml(
    fieldUris,
    typeConfig.rowTypeDwcUri,
    typeConfig.csvFileName,
    emlFileName,
    idTermUri
  );

  // ── 9. Package ZIP ────────────────────────────────────────────────────────
  const files = [
    { fileName: typeConfig.csvFileName, fileContent: csvContent },
    { fileName: "meta.xml", fileContent: metaXml },
  ];
  if (emlContent) {
    files.push({ fileName: "eml.xml", fileContent: emlContent });
  }

  try {
    const blob = await buildZip(files, { compression: "DEFLATE", type: "blob" });
    return blob;
  } catch (err) {
    Logger.error(
      `DwC Archive (${archiveType}): failed to build ZIP: ${err.message}`,
      LOG_TAG
    );
    return null;
  }
}

// ─── Data row generation ──────────────────────────────────────────────────────

function buildDataRows({
  archiveType,
  termColumns,
  compiledEntries,
  taxaColumnDefs,
  customizationData,
  cddByPath,
  occurrenceLevelIndex,
  mediaUrlResolver,
}) {
  // The CSV columns are the bare local part of each term (e.g. "scientificName" not "dwc:scientificName")
  const csvColumns = termColumns.map(tc => tc.localPart);

  /** @type {Object[]} */
  const csvRows = [];

  // ── Shared resolver context base (properties common to both targets) ──────
  const _seenLogMessages = new Set();

  function makeBaseContext() {
    return {
      target: archiveType,
      taxaColumnDefs,
      customizationData,
      cddByPath,
      mediaUrlResolver,
      dataCustomTypes: getDataCustomTypes(),
      onLog(level, msg) {
        if (_seenLogMessages.has(msg)) return; // deduplicate across rows
        _seenLogMessages.add(msg);
        if (level === "error") Logger.error(msg, LOG_TAG);
        else Logger.warning(msg, LOG_TAG);
      },
    };
  }

  // ── CHECKLIST ─────────────────────────────────────────────────────────────
  if (archiveType === "checklist") {
    const taxonNodes = expandToTaxonNodes(
      compiledEntries,
      taxaColumnDefs,
      occurrenceLevelIndex
    );

    for (const taxonNode of taxonNodes) {
      const ctx = {
        ...makeBaseContext(),
        taxonNode,
      };

      const row = {};
      for (const tc of termColumns) {
        const val = resolve(tc.valueSource, ctx);
        row[tc.localPart] = val !== null ? val : "";
      }
      csvRows.push(row);
    }
  }

  // ── OCCURRENCES ───────────────────────────────────────────────────────────
  else if (archiveType === "occurrences") {
    if (occurrenceLevelIndex === -1) {
      Logger.warning(
        "DwC Archive (occurrences): no occurrence rank is defined in your Taxa table. " +
        "Add a row whose Taxon name is \"Occurrence\" to enable occurrence export.",
        LOG_TAG
      );
      return { csvColumns, csvRows };
    }

    const occurrenceEntries = compiledEntries.filter(entry => {
      const tArr = entry.t || [];
      const occNode = tArr[occurrenceLevelIndex];
      return occNode != null && (occNode.name || "").trim() !== "";
    });

    for (const occurrenceEntry of occurrenceEntries) {
      const ctx = {
        ...makeBaseContext(),
        occurrenceEntry,
        occurrenceLevelIndex,
      };

      const row = {};
      for (const tc of termColumns) {
        const val = resolve(tc.valueSource, ctx);
        row[tc.localPart] = val !== null ? val : "";
      }
      csvRows.push(row);
    }
  }

  return { csvColumns, csvRows };
}

// ─── EML assembly from individual eml: rows ───────────────────────────────────

function buildEmlFromRows(emlRows, archiveType, customizationData) {
  // Minimal resolver context for EML-level directives (config:, auto:, literals).
  // Row-level directives (column:, taxa:, media:) are not meaningful in EML.
  const emlCtx = {
    target: archiveType,
    customizationData,
    onLog(level, msg) {
      if (level === "error") Logger.error(msg, LOG_TAG);
      else Logger.warning(msg, LOG_TAG);
    },
  };

  function getVal(term) {
    const row = emlRows.find(r => r.term === term);
    if (!row) return "";
    const vs = (row.valueSource || "").trim();
    if (!vs) return "";
    // Resolve all directives (config:, auto:, literals) via the shared resolver
    const resolved = resolve(vs, emlCtx);
    return resolved !== null ? resolved : "";
  }

  // Validate required EML terms
  const required = termsMeta.eml.filter(t => t.presence === "required" || t.presence === "critical");
  let missingRequired = [];
  for (const termDef of required) {
    if (termDef.term === "eml:precomposed") continue; // handled separately
    if (!getVal(termDef.term)) {
      Logger.warning(
        `DwC Archive (${archiveType}): EML required term "${termDef.term}" is missing or empty.`,
        LOG_TAG
      );
      if (termDef.presence === "critical") missingRequired.push(termDef.term);
    }
  }
  if (missingRequired.length > 0) {
    Logger.error(
      `DwC Archive (${archiveType}): critical EML terms are missing. EML will not be generated. Either use "eml:precomposed" with a full EML XML, or add individual "eml:*" rows for the required terms: ${missingRequired.join(", ")}`,
      LOG_TAG
    );
    return null;
  }

  const opts = {
    packageId: getVal("eml:packageId"),
    language: getVal("eml:language") || DEFAULT_LOCALE_CODE,
    title: getVal("eml:title"),
    pubDate: getVal("eml:pubDate") || new Date().toISOString().split("T")[0],
    abstract: getVal("eml:abstract"),
    licenseUri: getVal("eml:licenseUri"),
    licenseLabel: getVal("eml:licenseLabel"),
    geographicDescription: getVal("eml:geographicDescription"),
    taxonomicDescription: getVal("eml:generalTaxonomicCoverage"),
    creator: {
      givenName: getVal("eml:creatorGivenName"),
      surName: getVal("eml:creatorSurName"),
      email: getVal("eml:creatorEmail"),
      organizationName: getVal("eml:creatorOrganizationName"),
      url: getVal("eml:creatorUrl"),
      userId: getVal("eml:creatorUserId"),
    },
  };

  try {
    return buildEmlXml(opts);
  } catch (err) {
    Logger.error(
      `DwC Archive (${archiveType}): failed to build EML XML: ${err.message}`,
      LOG_TAG
    );
    return null;
  }
}

// ─── CDD by-path map builder ─────────────────────────────────────────────────

/**
 * Build a Map<lowercaseColumnName, cddRow> from the CDD rows array.
 * Also indexes "#" pattern entries for numbered-array columns:
 * a row with columnName="photos#" will match lookups for "photos1", "photos2", etc.
 * The exact name is always indexed; the "#" form is a fallback.
 *
 * @param {Array} cddRows
 * @returns {Map<string, Object>}
 */
function buildCddByPath(cddRows) {
  const map = new Map();
  if (!cddRows) return map;

  for (const row of cddRows) {
    const name = (row.columnName || "").toLowerCase().trim();
    if (!name) continue;
    map.set(name, row);
  }

  return map;
}

// ─── Lazy dataCustomTypes import ─────────────────────────────────────────────

let _cachedDataCustomTypes = null;

function getDataCustomTypes() {
  if (_cachedDataCustomTypes) return _cachedDataCustomTypes;
  try {
    // Dynamic require-style access: in the ES module environment the
    // customTypes/index.js export is already loaded by DataManager.
    // We import it here lazily to avoid a circular dependency at module
    // load time (DataManager → DwcArchiveCompiler → customTypes → ...).
    // In practice this module will always be loaded after DataManager,
    // so the import resolves immediately from the module cache.
    // eslint-disable-next-line no-undef
    _cachedDataCustomTypes = globalThis.__nl_dataCustomTypes;
  } catch {
    _cachedDataCustomTypes = {};
  }
  return _cachedDataCustomTypes || {};
}

/**
 * Called once by DataManager immediately after it imports dataCustomTypes,
 * so that DwcArchiveCompiler can access them without a circular import.
 *
 * Usage in DataManager.js (after the import line):
 *   import { dataCustomTypes } from "./customTypes/index.js";
 *   import { registerDataCustomTypes } from "./dwc/DwcArchiveCompiler.js";
 *   registerDataCustomTypes(dataCustomTypes);
 *
 * @param {Object} types  The dataCustomTypes map
 */
export function registerDataCustomTypes(types) {
  _cachedDataCustomTypes = types;
}
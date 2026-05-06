import * as XLSX from "xlsx-js-style";
import { indexOfCaseInsensitive, isArrayOfEmptyStrings, pad } from "./Utils.js";
import { Logger } from "./Logger.js";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { AVAILABLE_LOCALES_INFO, DEFAULT_LOCALE_CODE } from "../i18n/availableLocalesInfo.js";

registerMessages(selfKey, {
  en: {
    dm_cannot_have_language_indicators: "Column {0} in table {1} cannot have language indicators ({2})",
    dm_verify_doc: "Verify the documentation to be on the same page with the latest format of the configuration sheets.",
    dm_required_sheet_missing: "Required sheet '{0}' is missing from the spreadsheet. The project cannot be compiled without it.",
    dm_optional_sheet_missing: "Optional sheet '{0}' was not found. All its tables will be treated as empty.",
    dm_required_table_missing_in_sheet: "Required table '{0}' was not found in sheet '{1}'.",
    dm_optional_table_missing: "Optional table '{0}' was not found in sheet '{1}'. It will be treated as empty.",
    dm_required_table_columns_missing: "Required table '{0}' is missing mandatory columns: {1}.",
    dm_optional_table_columns_missing: "Table '{0}' is present in the spreadsheet but is missing expected columns: {1}.",
    dm_column_not_found: "Could not find column {0} in table {1}",
    dm_empty_row_in_data: "Empty row detected in sheet '{0}' at line {1}.",
    dm_data_after_empty_row_ignored: "Data found after the empty row will be ignored.",
  },
  fr: {
    dm_cannot_have_language_indicators: "La colonne {0} dans le tableau {1} ne peut pas avoir d'indicateurs de langue ({2})",
    dm_verify_doc: "Vérifiez la documentation pour être sûr d'être à jour avec le dernier format des feuilles de configuration.",
    dm_required_sheet_missing: "La feuille requise '{0}' est manquante du classeur. Le projet ne peut pas être compilé sans elle.",
    dm_optional_sheet_missing: "La feuille optionnelle '{0}' est manquante du classeur. Toutes ses tables seront traitées comme vides.",
    dm_required_table_missing_in_sheet: "La table requise '{0}' est manquante de la feuille '{1}'.",
    dm_optional_table_missing: "La table optionnelle '{0}' est manquante de la feuille '{1}'. Elle sera traitée comme vide.",
    dm_required_table_columns_missing: "La table requise '{0}' est manquante de colonnes obligatoires : {1}.",
    dm_optional_table_columns_missing: "La table '{0}' est présente dans le classeur mais manque des colonnes attendues : {1}. Ajoutez les colonnes manquantes ou supprimez la table entièrement.",
    dm_column_not_found: "Impossible de trouver la colonne {0} dans le tableau {1}",
    dm_empty_row_in_data: "Ligne vide détectée dans la feuille '{0}' à la ligne {1}.",
    dm_data_after_empty_row_ignored: "Les données trouvées après la ligne vide seront ignorées.",
  }
});


// =============================================================================
// HELPER FUNCTIONS (Stateless / Pure)
// =============================================================================

/**
 * Reads the raw Excel file into a Workbook object.
 */
function readWorkbook(excelFile) {
  return XLSX.read(excelFile, {
    type: "binary",
    cellText: false,
    cellDates: true,
    cellNF: true,
  });
}

/**
 * Parses a specific sheet from the workbook into a 2D array (Row x Col).
 * Handles lookahead for empty rows to ensure data isn't cut off prematurely,
 * but stops reading at the FIRST empty row and logs a warning if data is found after it.
 */
function parseSheetData(workbook, sheetName) {
  if (workbook.SheetNames.indexOf(sheetName) < 0) {
    // SILENTLY return null. 
    // The caller (processMetaStructure) now handles logging 
    // the critical error or warning based on the 'required' flag.
    return null;
  }

  //console.log("Reading sheet " + sheetName);
  const worksheet = workbook.Sheets[sheetName];
  // fallback for empty sheets
  if (!worksheet["!ref"]) return [];

  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const rawSheetData = [];
  const LOOKAHEAD_ROWS_NUMBER = 5;

  for (let row = range.s.r; row <= range.e.r; row++) {
    const rowData = buildRowArray(worksheet, row, range);

    if (!isRowArrayEmpty(rowData)) {
      rawSheetData.push(rowData);
      continue;
    }

    // Empty row encountered -> perform lookahead and stop reading data
    // ------------------------------------------------------------------
    const maxLookahead = Math.min(LOOKAHEAD_ROWS_NUMBER, range.e.r - row);
    let foundNonEmpty = false;

    for (let la = 1; la <= maxLookahead; la++) {
      const laRowData = buildRowArray(worksheet, row + la, range);
      if (!isRowArrayEmpty(laRowData)) {
        foundNonEmpty = true;
        break;
      }
    }

    // If data is found after the first empty row, issue a warning.
    if (foundNonEmpty) {
      Logger.warning(
        tf("dm_empty_row_in_data", [sheetName, row + 1]) +
        " " +
        t("dm_data_after_empty_row_ignored")
      );
    }

    // In ALL cases where an empty row is found, the data reading must stop
    // to enforce "table ends with first empty row".
    break;
  }

  return rawSheetData;
}

/**
 * Helper to build a single row array from the worksheet object.
 */
function buildRowArray(worksheet, rowIndex, range) {
  const rowArray = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: col })];

    let cellValue = "";
    if (cell && cell.v !== undefined && cell.v !== null) {
      if (typeof cell.v === "string") {
        cellValue = cell.v.trim();
      } else if (cell.t === "n" && typeof cell.z === "string" && cell.z.includes("%")) {
        // Percentage-formatted numeric cell. Wrap in a sentinel so schema-aware
        // consumers downstream can reconstruct "X%" if they need to, while all
        // other consumers receive the raw decimal as before.
        cellValue = { __percentageValue: cell.v };
      } else {
        cellValue = cell.v;
      }
    }
    rowArray.push(cellValue);
  }
  return rowArray;
}

function isRowArrayEmpty(rowArray) {
  if (!Array.isArray(rowArray)) return true;
  return rowArray.every((cell) => cell === "" || cell === null || cell === undefined);
}

/**
 * Locates a sub-table within a 2D sheet array based on the table name.
 * Returns the sliced 2D array containing just that table.
 */
/**
 * Locates a sub-table within a 2D sheet array based on the table name.
 * Returns:
 *   []    – table not found but is optional (treated as empty)
 *   rows  – table found (may be length 1 if only header row exists)
 *   null  – table not found and is required (critical error already logged)
 */
function extractSubTableData(sheetData, sheetName, tableName, tableInfo, langCode, defaultLangCode) {
  const tableRequired = tableInfo && tableInfo.required !== false;

  const tableStartCol = (sheetData && sheetData.length >= 1)
    ? indexOfCaseInsensitive(sheetData[0], tableName)
    : -1;

  if (tableStartCol < 0) {
    if (!tableRequired) {
      Logger.info(tf("dm_optional_table_missing", [tableName, sheetName]), "Table missing");
      return [];
    }
    Logger.critical(
      tf("dm_required_table_missing_in_sheet", [tableName, sheetName]) + " " + t("dm_verify_doc"),
      "Table missing"
    );
    return null;
  }

  let tableEndCol = (sheetData.length >= 2) ? sheetData[1].indexOf("", tableStartCol) : -1;
  if (tableEndCol < 0) {
    tableEndCol = sheetData[1]?.length ?? tableStartCol + 1;
  }

  const subTable = [];
  for (let row = 1; row < sheetData.length; row++) {
    const cells = sheetData[row].slice(tableStartCol, tableEndCol);
    if (isArrayOfEmptyStrings(cells)) break;
    subTable.push(cells);
  }

  if (subTable.length > 0) {
    validateColumnNames(subTable[0], tableName, tableInfo, langCode, defaultLangCode);
  }

  return subTable;
}

/**
 * Validates the headers of a sub-table against the expected schema.
 *
 * Required table  → any missing column is a critical error (aborts further column checks).
 * Optional table  → missing columns are reported as a single error listing all absent names;
 *                   processing continues so other checks still run.
 */
function validateColumnNames(headers, tableName, tableInfo, langCode, defaultLangCode) {
  // 1. Check for ambiguous columns
  for (const header of headers) {
    if (
      header.indexOf(":") > 0 &&
      indexOfCaseInsensitive(headers, header + ":" + defaultLangCode) >= 0
    ) {
      throw `You have both '${header}' and '${header}:${defaultLangCode}' in table '${tableName}' - to prevent ambiguity, keep only the '${header}' column`;
    }
    if (header.split(":").length > 2) {
      throw `Column name '${header}' in table '${tableName}' is malformed - only one symbol ':' is allowed.`;
    }
  }

  // 2. Check for missing expected columns
  const expectedHeaders = Object.values(tableInfo.columns).map((c) => c.name);
  const missingColumns = expectedHeaders.filter((expectedHeader) =>
    !headers.find((header) => {
      const h = header.toLowerCase();
      const eh = expectedHeader.toLowerCase();
      return h === eh || h.startsWith(eh + ":");
    })
  );

  if (missingColumns.length > 0) {
    if (tableInfo.required !== false) {
      // Required table: first missing column is fatal
      const missingColMigrations = Object.values(tableInfo.columns)
        .filter(c => missingColumns.includes(c.name) && c.integrity?.migration)
        .map(c => c.integrity.migration);
      const migrationSuffix = missingColMigrations.length > 0
        ? " " + missingColMigrations.join(" ")
        : "";

      Logger.critical(
        tf("dm_required_table_columns_missing", [tableInfo.name, missingColumns.join(", ")]) +
        migrationSuffix + " " + t("dm_verify_doc"),
        "Column missing"
      );
      // Do NOT return here - let further checks run so other issues are surfaced too.
    } else {
      // Optional table present in the file but columns are missing → error (not critical,
      // so compilation continues and runManualIntegrityChecks can still run its checks).
      const missingColObjects = Object.values(tableInfo.columns)
        .filter(c => missingColumns.includes(c.name));

      missingColObjects.forEach(function (colMeta) {
        const migrationHint = colMeta.integrity?.migration
          ? " " + colMeta.integrity.migration
          : "";
        Logger.error(
          tf("dm_optional_table_columns_missing", [tableInfo.name, colMeta.name]) +
          migrationHint,
          "Column missing"
        );
      });
      // Do NOT return here - let further checks run so other issues are surfaced too.
    }
  }

  // 3. Integrity check for multilingual support
  if (tableInfo) {
    Object.keys(tableInfo.columns).forEach((key) => {
      const columnMeta = tableInfo.columns[key];
      if (!columnMeta.integrity.supportsMultilingual) {
        const multilingualCols = [];
        headers.forEach((header) => {
          if (header.toLowerCase() === columnMeta.name.toLowerCase() + ":" + langCode?.toLowerCase()) {
            multilingualCols.push(header.substring(columnMeta.name.length));
          }
        });

        if (multilingualCols.length > 0) {
          Logger.error(tf("dm_cannot_have_language_indicators", [columnMeta.name, tableInfo.name, multilingualCols.join(", ")]), "Unexpected multilingual columns");
        }
      }
    });
  }
}

/**
 * Finds the correct column index for a given attribute considering language fallbacks.
 */
function getMultilingualColumnIndex(headers, columnName, languageCode, defaultLanguageCode) {
  // 1. Try Specific Language
  let colIndex = indexOfCaseInsensitive(headers, columnName + ":" + languageCode);
  // 2. Try Default Language Explicit
  if (colIndex < 0) {
    colIndex = indexOfCaseInsensitive(headers, columnName + ":" + defaultLanguageCode);
  }
  // 3. Try Base Column Name
  if (colIndex < 0) {
    colIndex = indexOfCaseInsensitive(headers, columnName);
  }
  return colIndex;
}

/**
 * Converts a raw sub-table (array of arrays) into an array of objects based on schema.
 */
function mapSubTableToObject(rawSubTable, tableInfo, langCode, defaultLangCode) {
  const loadedData = [];

  if (!rawSubTable || rawSubTable.length === 0) {
    return loadedData;
  }

  const headers = rawSubTable[0];

  for (let row = 1; row < rawSubTable.length; row++) {
    const lineObject = {};
    let hasError = false;

    Object.keys(tableInfo.columns).forEach((columnKey) => {
      const colName = tableInfo.columns[columnKey].name;
      const colIndex = getMultilingualColumnIndex(headers, colName, langCode, defaultLangCode);

      if (colIndex < 0) {
        // Column-missing was already reported by validateColumnNames; elevate to critical
        // only for required tables to avoid duplicate messages.
        if (tableInfo.required !== false) {
          Logger.critical(tf("dm_column_not_found", [colName, tableInfo.name]), "Column missing");
        }
        hasError = true;
      } else {
        let value = rawSubTable[row][colIndex];

        // Unwrap percentage sentinel for columns that explicitly require it.
        // For all other columns the sentinel object passes through and would
        // never normally appear (no other column is formatted as % in Excel).
        if (
          tableInfo.columns[columnKey].integrity?.readPercentageNumbersAsPercentageString &&
          value !== null &&
          typeof value === "object" &&
          "__percentageValue" in value
        ) {
          value = Math.round(value.__percentageValue * 100) + "%";
        }

        lineObject[columnKey] = value;
      }
    });

    if (!hasError) loadedData.push(lineObject);
  }

  return loadedData;
}

// =============================================================================
// MAIN LOGIC PROCESSORS
// =============================================================================

function processLanguages(workbook, schema) {
  // Reset before populating to prevent language entries from accumulating
  // across multiple compilations (nlDataStructure is a module-level singleton).
  schema.common.languages.supportedLanguages = [];

  const appearanceSheetName = schema.sheets.appearance.name;
  const generalSheetData = parseSheetData(workbook, appearanceSheetName);

  if (!generalSheetData) {
    schema.common.languages.defaultLanguageCode = DEFAULT_LOCALE_CODE;
    pushLanguage(DEFAULT_LOCALE_CODE, AVAILABLE_LOCALES_INFO[DEFAULT_LOCALE_CODE], "");
    return;
  }

  const tableName = schema.common.languages.languagesTableName;
  const tableInfo = schema.sheets.appearance.tables.supportedLanguages;

  // Use null for lang codes here as we are bootstrapping languages
  const languageTable = extractSubTableData(generalSheetData, appearanceSheetName, tableName, tableInfo, null, null);

  if (!languageTable || languageTable.length < 2) {
    Logger.info(`The '${tableName}' table is empty, using ${AVAILABLE_LOCALES_INFO[DEFAULT_LOCALE_CODE]} as default language.`);
    schema.common.languages.defaultLanguageCode = DEFAULT_LOCALE_CODE;
    pushLanguage(DEFAULT_LOCALE_CODE, AVAILABLE_LOCALES_INFO[DEFAULT_LOCALE_CODE], "");
    return;
  }

  const nCode = "Code";
  const nName = "Name of language";
  const nFallback = "Fallback language";
  const headers = languageTable[0];

  // Simple index lookup for the bootstrap table
  const codeIdx = indexOfCaseInsensitive(headers, nCode);
  const nameIdx = indexOfCaseInsensitive(headers, nName);
  const fallbackIdx = indexOfCaseInsensitive(headers, nFallback);

  if (codeIdx < 0 || nameIdx < 0 || fallbackIdx < 0) {
    Logger.critical(`Missing required columns (Code, Name, Fallback) in '${tableName}' on sheet '${appearanceSheetName}'`);
    return null;
  }

  for (let row = 1; row < languageTable.length; row++) {
    const langCode = languageTable[row][codeIdx] || "";
    const langName = languageTable[row][nameIdx] || "";
    const fallbackLang = languageTable[row][fallbackIdx] || "";

    if (langCode.trim() === "" || langName.trim() === "") {
      throw `Language code/name in table '${tableName}' on line ${row} cannot be empty`;
    }

    if (row === 1) {
      schema.common.languages.defaultLanguageCode = langCode;
    }

    pushLanguage(langCode, langName, fallbackLang);
  }

  function pushLanguage(langCode, langName, fallbackLang) {
    schema.common.languages.supportedLanguages.push({
      code: langCode,
      name: langName,
      fallbackLanguage: fallbackLang,
    });
  }
}

function processMetaStructure(workbook, schema) {
  Object.keys(schema.sheets).forEach((sheetKey) => {
    const sheetDef = schema.sheets[sheetKey];
    if (sheetDef.type !== "meta") return;

    const sheetData = parseSheetData(workbook, sheetDef.name);
    const sheetRequired = sheetDef.required !== false;

    if (!sheetData) {
      if (sheetRequired) {
        Logger.critical(tf("dm_required_sheet_missing", [sheetDef.name]), "Sheet missing");
      } else {
        Logger.info(tf("dm_optional_sheet_missing", [sheetDef.name]), "Sheet missing");
      }
      // Whether required or optional: initialise all table data to empty arrays so
      // downstream code never sees undefined for tableDef.data[lang.code].
      Object.keys(sheetDef.tables).forEach((tableKey) => {
        const tableDef = sheetDef.tables[tableKey];
        tableDef.data = {};
        schema.common.languages.supportedLanguages.forEach((lang) => {
          tableDef.data[lang.code] = [];
        });
      });
      return;
    }

    Object.keys(sheetDef.tables).forEach((tableKey) => {
      const tableDef = sheetDef.tables[tableKey];
      const tableRequired = tableDef.required !== false;
      tableDef.data = {};

      schema.common.languages.supportedLanguages.forEach((lang) => {
        // extractSubTableData returns:
        //   null  → table not found in sheet (already logged appropriately)
        //   []    → table found but empty (or optional+missing)
        //   rows  → table found with data
        const rawSubTable = extractSubTableData(
          sheetData,
          sheetDef.name,
          tableDef.name,
          tableDef,
          lang.code,
          schema.common.languages.defaultLanguageCode
        );

        // null means the table was absent:
        //   required  → critical already logged by extractSubTableData; use [] to avoid crashes
        //   optional  → info already logged; use []
        tableDef.data[lang.code] = rawSubTable
          ? mapSubTableToObject(rawSubTable, tableDef, lang.code, schema.common.languages.defaultLanguageCode)
          : [];
      });
    });
  });
}

// =============================================================================
// DATA SHEET MERGING (pure helpers)
// =============================================================================

/**
 * Reads one data sheet from the workbook and returns a raw 2-D table
 * (header row + data rows) exactly as the original getRawChecklistData did,
 * but for an arbitrary named sheet.
 *
 * Returns null when the sheet cannot be found (caller decides how to log).
 *
 * @param {object} workbook        – XLSX workbook object
 * @param {string} sheetName       – Name of the sheet to read
 * @param {number} headerRowIndex  – 0-based index of the header row
 * @returns {any[][]|null}
 */
function readOneDataSheet(workbook, sheetName, headerRowIndex) {
  const sheetData = parseSheetData(workbook, sheetName);
  if (!sheetData) return null;

  // Clamp headerRowIndex defensively
  const safeHeaderIdx =
    headerRowIndex >= 0 && headerRowIndex < sheetData.length ? headerRowIndex : 0;

  const headerRow = sheetData[safeHeaderIdx];

  // Determine usable table width from the header row (mirrors original logic)
  let tableEndCol = 1;
  if (headerRow) {
    headerRow.forEach((header, index) => {
      if (header !== undefined && header.toString().trim() !== "") {
        tableEndCol = index + 1;
      }
    });
  }

  const result = [];

  for (let row = 0; row < sheetData.length; row++) {
    const cells = sheetData[row].slice(0, tableEndCol);

    // Date Conversion Logic (unchanged from original getRawChecklistData)
    for (let column = 0; column < cells.length; column++) {
      let cell = cells[column];
      if (cell instanceof Date) {
        cell = new Date(cell - cell.getTimezoneOffset() * 60 * 1000);
        cells[column] =
          cell.getFullYear() +
          "-" +
          pad((cell.getMonth() + 1).toString(), 2, "0") +
          "-" +
          pad(cell.getDate().toString(), 2, "0");
      }
    }

    if (isArrayOfEmptyStrings(cells)) break;
    result.push(cells);
  }

  return result;
}

/**
 * Merges multiple per-sheet raw checklist tables into a single unified table.
 *
 * Contract:
 *  - The header row from the PRIMARY (first) sheet is the canonical header.
 *  - Columns from subsequent sheets are matched by lowercase-trimmed name, so
 *    column-order differences between sheets do not corrupt data.
 *  - Every data row gets a non-enumerable `_sourceSheet` string so that Logger
 *    calls downstream can report the exact originating sheet name without
 *    affecting JSON serialisation, header-based column lookups, or any other
 *    existing row-processing code.
 *  - When only one sheet is provided the output is structurally identical to
 *    what the original single-sheet code path returned.
 *
 * @param {Array<{ sheetName: string, table: any[][] }>} sheetTables
 *   Ordered array of { sheetName, table } where table[0] is the header row
 *   and table[1..] are data rows.
 * @returns {any[][]}  Merged table: canonical header at [0], annotated data rows after.
 */
function mergeChecklistSheetTables(sheetTables) {
  if (sheetTables.length === 0) return [];

  // Primary sheet provides the canonical header row
  const primaryHeaders = sheetTables[0].table[0].map((h) =>
    (h || "").toString().toLowerCase().trim()
  );

  const mergedRows = [sheetTables[0].table[0]]; // keep the original header row object

  for (const { sheetName, table } of sheetTables) {
    if (table.length <= 1) continue; // header-only or empty sheet → nothing to merge

    const thisHeaders = table[0].map((h) =>
      (h || "").toString().toLowerCase().trim()
    );

    // Build a column-remap index: for each primary header position, find the
    // matching column index in this sheet's headers (or -1 if absent).
    const colRemap = primaryHeaders.map((ph) => thisHeaders.indexOf(ph));

    for (let r = 1; r < table.length; r++) {
      const sourceRow = table[r];

      // Re-order cells to align with the primary header layout
      const alignedRow = colRemap.map((srcIdx) =>
        srcIdx >= 0 ? sourceRow[srcIdx] : ""
      );

      // Attach lightweight, invisible meta flags for Logger attribution.
      // defineProperty keeps these out of for..in and JSON.stringify,
      // so they are invisible to all existing row-processing code.
      // _sourceRow is the 1-based spreadsheet row number within the source
      // sheet (r=1 → row 2 in Excel because row 1 is the header).
      Object.defineProperty(alignedRow, "_sourceSheet", {
        value: sheetName,
        enumerable: false,
        writable: false,
        configurable: false,
      });
      Object.defineProperty(alignedRow, "_sourceRow", {
        value: r + 1, // r is 1-based over data rows; +1 accounts for the header row
        enumerable: false,
        writable: false,
        configurable: false,
      });

      mergedRows.push(alignedRow);
    }
  }

  return mergedRows;
}

// =============================================================================
// EXPORT
// =============================================================================

export let ExcelBridge = function (excelFile) {
  // 1. READ FILE ONCE ON INITIALIZATION
  const workbook = readWorkbook(excelFile);
  let data = null; // Internal reference to the schema data

  return {
    loadMeta: function (dataManagerData) {
      data = dataManagerData;
      //console.log("### Loading meta from Excel ######################");

      // 1. Load Languages (bootstraps the schema with lang codes)
      processLanguages(workbook, data);

      // 2. Load Meta Structure (uses the bootstrapped lang codes)
      processMetaStructure(workbook, data);
    },

    getRawChecklistData: function () {
      // No re-read of workbook here, uses closure 'workbook'.
      //
      // data.sheets.checklist.name is set by postprocessMetadata() from the
      // "Data sheets names" Customization row before this is called.
      // It may now contain a comma-separated list of sheet names.
      const sheetNames = data.sheets.checklist.sheetsNames;

      if (sheetNames.length === 0) {
        Logger.critical("No data sheet supplied. Please specify at least one sheet name in the 'Data sheets names' customization row.");
        return null;
      }

      const headerRowIndex = 0;

      const sheetTables = [];

      for (const sheetName of sheetNames) {
        const table = readOneDataSheet(workbook, sheetName, headerRowIndex);

        if (table == null) {
          Logger.critical("Could not locate data sheet '" + sheetName + "'");
          return null;
        }

        if (table.length <= 1) {
          Logger.warning(
            "Data sheet '" + sheetName + "' contains no data rows. " +
            "Add at least one data row and recompile."
          );
          return null;
        }

        sheetTables.push({ sheetName, table });
      }

      if (sheetTables.length === 0) return null;

      // Merge all sheets into one unified raw table and return it.
      // When only one sheet is present this is a transparent pass-through.
      return mergeChecklistSheetTables(sheetTables);
    },
  };
};
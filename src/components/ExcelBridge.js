import * as XLSX from "xlsx-js-style";
import { indexOfCaseInsensitive, isArrayOfEmptyStrings, pad } from "./Utils.js";
import { Logger } from "./Logger.js";

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
  });
}

/**
 * Parses a specific sheet from the workbook into a 2D array (Row x Col).
 * Handles lookahead for empty rows to ensure data isn't cut off prematurely,
 * but stops reading at the FIRST empty row and logs a warning if data is found after it.
 */
function parseSheetData(workbook, sheetName) {
  if (workbook.SheetNames.indexOf(sheetName) < 0) {
    Logger.critical(tf("dm_cannot_find_sheet", [sheetName]));
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
    // ------------------------------------------------------------------
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
      cellValue = typeof cell.v === "string" ? cell.v.trim() : cell.v;
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
function extractSubTableData(sheetData, sheetName, tableName, tableInfo, langCode, defaultLangCode) {
  if (!sheetData || sheetData.length < 2) {
    Logger.critical(tf("dm_cannot_find_table_in_worksheet", [tableName, sheetName]) + " " + t("dm_verify_doc"));
    return null;
  }

  const headers = sheetData[0];
  const tableStartCol = indexOfCaseInsensitive(headers, tableName);

  if (tableStartCol < 0) {
    Logger.critical(tf("dm_cannot_find_table_in_worksheet", [tableName, sheetName]) + " " + t("dm_verify_doc"));
    return null;
  }

  let tableEndCol = sheetData[1].indexOf("", tableStartCol);
  if (tableEndCol < 0) {
    tableEndCol = sheetData[1].length;
  }

  const subTable = [];
  // Start at row 1 (skipping the meta-header row which contains the table name)
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
  for (const expectedHeader of expectedHeaders) {
    const match = headers.find((header) => {
      const h = header.toLowerCase();
      const eh = expectedHeader.toLowerCase();
      return h === eh || h.startsWith(eh + ":");
    });

    if (match === undefined) {
      Logger.critical(`Could not find expected column '${expectedHeader}' in table ${tableInfo.name} ${t("dm_verify_doc")}`);
      return;
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
          Logger.error(tf("dm_cannot_have_language_indicators", [columnMeta.name, tableInfo.name, multilingualCols.join(", ")]));
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
  const headers = rawSubTable[0];

  for (let row = 1; row < rawSubTable.length; row++) {
    const lineObject = {};
    let hasError = false;

    Object.keys(tableInfo.columns).forEach((columnKey) => {
      const colName = tableInfo.columns[columnKey].name;
      const colIndex = getMultilingualColumnIndex(headers, colName, langCode, defaultLangCode);

      if (colIndex < 0) {
        Logger.error(tf("dm_column_not_found", [colName, tableInfo.name]));
        hasError = true;
      } else {
        lineObject[columnKey] = rawSubTable[row][colIndex];
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
  const appearanceSheetName = schema.sheets.appearance.name;
  const generalSheetData = parseSheetData(workbook, appearanceSheetName);

  if (!generalSheetData) return null; // Error already logged in parseSheetData

  const tableName = schema.common.languages.languagesTableName;
  const tableInfo = schema.sheets.appearance.tables.supportedLanguages;

  // Use null for lang codes here as we are bootstrapping languages
  const languageTable = extractSubTableData(generalSheetData, appearanceSheetName, tableName, tableInfo, null, null);

  if (!languageTable || languageTable.length < 2) {
    Logger.critical(`The '${tableName}' table needs at least one row (default language).`);
    return null;
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
    if (sheetDef.type === "meta") {
      // READ SHEET ONCE PER SHEET DEFINITION
      const sheetData = parseSheetData(workbook, sheetDef.name);
      if (!sheetData) return;

      Object.keys(sheetDef.tables).forEach((tableKey) => {
        const tableDef = sheetDef.tables[tableKey];
        tableDef.data = {};

        schema.common.languages.supportedLanguages.forEach((lang) => {
          // Extract raw sub-table for specific language context
          const rawSubTable = extractSubTableData(
            sheetData,
            sheetDef.name,
            tableDef.name,
            tableDef,
            lang.code,
            schema.common.languages.defaultLanguageCode
          );

          if (rawSubTable) {
            tableDef.data[lang.code] = mapSubTableToObject(
              rawSubTable,
              tableDef,
              lang.code,
              schema.common.languages.defaultLanguageCode
            );
          }
        });
      });
    }
  });
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
      // No re-read of workbook here, uses closure 'workbook'
      const sheetName = data.sheets.checklist.name;
      const sheetData = parseSheetData(workbook, sheetName);

      if (!sheetData) {
        Logger.critical("Could not locate checklist sheet");
        return null;
      }

      let headerRowIndex = -1;
      if (data.common && data.common.checklistHeadersStartRow) {
        headerRowIndex = data.common.checklistHeadersStartRow - 1;
      }
      else{
        headerRowIndex = 0;
      }

      // Ensure we don't go out of bounds if the sheet is empty/small
      if (headerRowIndex < 0) headerRowIndex = 0;
      if (headerRowIndex >= sheetData.length) headerRowIndex = 0;

      const headerRow = sheetData[headerRowIndex];

      // 2. Determine table width based on the ACTUAL header row, not sheetData[0]
      let tableEndCol = 1;
      if (headerRow) {
        headerRow.forEach((header, index) => {
          if (header !== undefined && header.toString().trim() !== "") {
            tableEndCol = index + 1;
          }
        });
      }

      console.log("Table end column:", tableEndCol);

      const rawChecklistTable = [];

      // Process rows
      for (let row = 0; row < sheetData.length; row++) {
        const cells = sheetData[row].slice(0, tableEndCol);

        // Date Conversion Logic
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
        rawChecklistTable.push(cells);
      }

      //console.log("Raw checklist data:", rawChecklistTable);

      return rawChecklistTable;
    },
  };
};
import * as XLSX from "xlsx-js-style"
import { nlDataStructureSheets } from "./nlDataStructureSheets";

export function exportTemplateSpreadsheetFilled() {
  localExportSpreadsheetFromNLData(nlDataStructure, false);
}

export function exportTemplateSpreadsheetEmpty() {
  localExportSpreadsheetFromNLData(nlDataStructure, true);
}

function localExportSpreadsheetFromNLData(nlDataStructure, completelyBlank = false) {
  const wb = XLSX.utils.book_new();

  // --- Styles ---
  const separatorStyle = { fill: { fgColor: { rgb: "ACB9CA" } } }; // #ACB9CA
  const separatorColWidth = { wpx: 20 };

  const tableNameStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "44546A" } } // Dark Slate
  };

  const headerStyle = { font: { bold: true } };

  const FIXED_WIDTHS = {
    "Customization": { "Value": 180 },
    "Step": { "Value": 150 },
    "Single-access keys": { "Value": 480 },
    "Target": { "Value": 180 },
    "Bibliography": { "Value": 480 },
  };

  // --- Helper: Get Data from new row-based templateData ---
  function getTableData(table, tableKey) {
    const colKeys = Object.keys(table.columns || {});
    
    // 1. Build Headers
    const headers = colKeys.map(k => table.columns[k].name);

    // 2. Build Rows
    const rows = [headers]; // Row 0 is headers

    if (!completelyBlank && table.templateData && Array.isArray(table.templateData)) {
      table.templateData.forEach((rowObj) => {
        const row = colKeys.map(k => {
          // Fallback check for property key (k) or explicit column name string
          const colName = table.columns[k].name;
          if (rowObj[k] !== undefined) return rowObj[k];
          if (rowObj[colName] !== undefined) return rowObj[colName];
          return "";
        });
        rows.push(row);
      });
    }

    return rows;
  }

  // --- Helper: Calculate Column Widths ---
  function calculateColumnWidths(tableName, rows) {
    if (!rows || rows.length === 0) return [];
    const numCols = rows[0].length;
    const widths = [];

    for (let c = 0; c < numCols; c++) {
      const headerName = rows[0][c];
      if (FIXED_WIDTHS[tableName] && FIXED_WIDTHS[tableName][headerName]) {
        widths.push({ wpx: FIXED_WIDTHS[tableName][headerName] });
        continue;
      }
      let maxLen = 0;
      for (let r = 0; r < rows.length; r++) {
        const cellVal = rows[r][c];
        const len = cellVal ? cellVal.toString().length : 0;
        if (len > maxLen) maxLen = len;
      }

      // Always cap max width to 80 regardless of other rules
      widths.push({ wch: Math.min(maxLen + 2, 80) });
    }
    return widths;
  }

  // --- Helper: Build Checklist Sheet ---
  function buildChecklistSheet() {
    const checklistDataConfig = nlDataStructure.sheets.checklist?.templateData || [];

    // Build headerKeys by scanning every checklist row's own keys,
    // preserving first-seen order and deduplicating.
    const headerKeys = [];
    if (checklistDataConfig.length > 0) {
      const seen = new Set();
      checklistDataConfig.forEach(row => {
        if (row && typeof row === 'object') {
          Object.keys(row).forEach(k => {
            if (!seen.has(k)) {
              seen.add(k);
              headerKeys.push(k);
            }
          });
        }
      });
    }

    const sheetData = [];
    const blankMessageA1 = "Your data will go into this sheet";
    const blankMessageA2 = "Configure the nl_content and nl_appearance sheets following the documentation on naturalist.netlify.app";
    const blankMessageA4 = "https://naturalist.netlify.app";

    // When completelyBlank is requested, put a helpful placeholder into A1
    if (completelyBlank) {
      const ws = {};
      ws['A1'] = { v: blankMessageA1, t: 's', s: { font: { color: { rgb: "FF0000" } } } };
      ws['A2'] = { v: blankMessageA2, t: 's', s: { font: { color: { rgb: "FF0000" } } } };
      ws['A4'] = { v: blankMessageA4, t: 's', s: { font: { color: { rgb: "0000FF" }, underline: true } }, l: { Target: blankMessageA4 } };
      ws['!ref'] = 'A1:A4';
      return ws;
    }

    if (!completelyBlank && headerKeys.length > 0) {
      sheetData.push(headerKeys);
      
      // Iterate over the row array directly
      checklistDataConfig.forEach((rowObj) => {
        const row = headerKeys.map(header => {
          if (rowObj[header] !== undefined) return rowObj[header];
          // Legacy mapping support for "Species.name" if needed
          if (header === "Species" && rowObj["Species.name"] !== undefined) return rowObj["Species.name"];
          return "";
        });
        sheetData.push(row);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    if (sheetData.length > 0) {
      // Bold Headers
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
        if (ws[cellRef]) ws[cellRef].s = headerStyle;
      }
      ws['!cols'] = calculateColumnWidths("checklist", sheetData);
    }
    return ws;
  }

  // --- Main Execution ---

  // 1. Checklist Sheet
  if (nlDataStructure.sheets.checklist) {
    const checklistWs = buildChecklistSheet();
    XLSX.utils.book_append_sheet(wb, checklistWs, "checklist");
  }

  // 2. Content & Appearance Sheets
  ["content", "appearance"].forEach(sheetKey => {
    if (!nlDataStructure.sheets[sheetKey]) return;
    const sheetDef = nlDataStructure.sheets[sheetKey];
    const tables = sheetDef.tables;
    if (!tables) return;

    const builtTables = [];
    let maxSheetRows = 0;

    Object.keys(tables).forEach(tableKey => {
      const table = tables[tableKey];
      // Pass tableKey to help identify (no longer needs special support but passed for consistency)
      const tableRows = getTableData(table, tableKey);
      const tableColWidths = calculateColumnWidths(table.name, tableRows);

      builtTables.push({
        name: table.name,
        rows: tableRows,
        colWidths: tableColWidths
      });

      if (tableRows.length + 1 > maxSheetRows) maxSheetRows = tableRows.length + 1;
    });

    if (builtTables.length === 0) return;

    const ws = {};
    let currentStartCol = 0;
    const allColsInfo = [];

    builtTables.forEach((t, index) => {
      const isLast = index === builtTables.length - 1;
      const tableWidth = t.rows[0].length;

      // A. Table Name Row
      // Create merge range for table name across all columns
      const mergeRange = {
        s: { c: currentStartCol, r: 0 },
        e: { c: currentStartCol + tableWidth - 1, r: 0 }
      };
      for (let c = 0; c < tableWidth; c++) {
        const cellRef = XLSX.utils.encode_cell({ c: currentStartCol + c, r: 0 });
        // First cell gets text, others are empty ""
        // Having v="" with a background style allows overflow in Excel
        const val = (c === 0) ? t.name : undefined;
        ws[cellRef] = { v: val, t: "s", s: tableNameStyle };
      }
      if (!ws['!merges']) ws['!merges'] = [];
      ws['!merges'].push(mergeRange);

      // B. Data Rows
      t.rows.forEach((row, rIndex) => {
        row.forEach((val, cIndex) => {
          const cellRef = XLSX.utils.encode_cell({ c: currentStartCol + cIndex, r: 1 + rIndex });
          const type = (typeof val === 'number') ? 'n' : 's';
          const cellObj = { v: val, t: type };

          // Apply Header Style to Row 1
          if (rIndex === 0) {
            cellObj.s = headerStyle;
            cellObj.t = 's';
          }
          ws[cellRef] = cellObj;
        });
      });

      allColsInfo.push(...t.colWidths);
      currentStartCol += tableWidth;

      // C. Separator
      if (!isLast) {
        allColsInfo.push(separatorColWidth);
        for (let r = 0; r < maxSheetRows + 2; r++) {
          const sepRef = XLSX.utils.encode_cell({ c: currentStartCol, r: r });
          ws[sepRef] = { v: "", t: "s", s: separatorStyle };
        }
        currentStartCol++;
      }
    });

    ws['!ref'] = XLSX.utils.encode_range({
      s: { c: 0, r: 0 },
      e: { c: currentStartCol - 1, r: maxSheetRows + 2 }
    });
    ws['!cols'] = allColsInfo;

    XLSX.utils.book_append_sheet(wb, ws, sheetDef.name || sheetKey);
  });

  const outFilename = completelyBlank ? "nl_template_blank.xlsx" : "nl_template_sample_data.xlsx";
  XLSX.writeFile(wb, outFilename);
}

export function getAllColumnInfos(nlDataStructure, langCode) {
  // Pure function: does not mutate input, returns new array
  const result = [];

  const tableKeys = Object.keys(nlDataStructure.sheets.content.tables);

  // Sort to ensure 'taxa' comes first
  tableKeys.sort((a, b) => {
    if (a === "taxa") return -1;
    if (b === "taxa") return 1;
    return 0;
  });

  const taxaColumnNames = new Set();

  tableKeys.forEach(function (tableKey) {
    const table = nlDataStructure.sheets.content.tables[tableKey];
    Object.keys(table.columns).forEach(function (columnKey) {
      if (columnKey == "columnName" && table.data[langCode]) {
        table.data[langCode].forEach(function (row) {
          let dataType = "text";
          if (tableKey == "taxa") {
            dataType = "checklist-taxon";
          } else if (tableKey == "customDataDefinition") {
            dataType = row["dataType"] || "text";
          }
          if (row[columnKey] === undefined) {
            // eslint-disable-next-line no-console
            console.log(row, columnKey, table.name, dataType, row);
            return;
          }
          result.push({
            name: row[columnKey].toLowerCase(),
            table: table.name,
            dataType: dataType,
            fullRow: row,
          });
        });
      }
    });
  });
  return result;
}

export let nlDataStructure = {
  common: {
    languages: {
      languagesTableName: "Supported languages",
      defaultLanguageCode: "",
      supportedLanguages: [], // first is default | {code: "en", name: "English", fallbackLanguage: "en"}
      templateData: [
        {
          "Code": "en",
          "Name of language": ["English"],
        },
      ]
    },
    allUsedDataPaths: {}, // allUsedDataPaths[lang.code] = dataPath

    _columnInfosCache: {}, // Add cache object
  },
  sheets: nlDataStructureSheets,
};

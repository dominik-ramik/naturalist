import * as XLSX from "xlsx-js-style"
import { nlDataStructureSheets } from "./nlDataStructureSheets";

export function exportTemplateSpreadsheet() {
  localExportSpreadsheetFromNLData(nlDataStructure);
}

function localExportSpreadsheetFromNLData(nlDataStructure) {
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

  // --- Helper: Get Data Map from various sources ---
  function getTableData(table, tableKey) {
    const colKeys = Object.keys(table.columns);

    // 1. Build Headers
    const headers = colKeys.map(k => table.columns[k].name);

    // 2. Collect Data
    const dataMap = {};
    let maxRows = 0;

    // Source A: Column Definitions (Standard)
    colKeys.forEach((colKey) => {
      const colDef = table.columns[colKey];
      if (colDef.templateData && Array.isArray(colDef.templateData)) {
        dataMap[colDef.name] = colDef.templateData;
      }
    });

    // Source B: common.languages.templateData (Specific Override)
    if (tableKey === 'supportedLanguages' && nlDataStructure.common?.languages?.templateData) {
      const commonData = nlDataStructure.common.languages.templateData;
      commonData.forEach(item => {
        // Handle [{columnName: "X", templateData: [...]}] format
        if (item.columnName && Array.isArray(item.templateData)) {
          dataMap[item.columnName] = item.templateData;
        }
        // Handle loose format from snippet [{ "Code": "en", "Name": ["Eng"] }]
        else {
          Object.keys(item).forEach(key => {
            const val = item[key];
            // If value is scalar, wrap in array; if array, use as is
            dataMap[key] = Array.isArray(val) ? val : [val];
          });
        }
      });
    }

    // Determine max rows from the aggregated map
    Object.values(dataMap).forEach(arr => {
      if (arr.length > maxRows) maxRows = arr.length;
    });

    // 3. Build Rows
    const rows = [headers]; // Row 0 is headers

    for (let i = 0; i < maxRows; i++) {
      const row = colKeys.map(k => {
        const colName = table.columns[k].name;
        return dataMap[colName] && dataMap[colName][i] !== undefined ? dataMap[colName][i] : "";
      });
      rows.push(row);
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

      // Always cap max width to 480 regardless of other rules
      widths.push({ wch: Math.min(maxLen + 2, 480) });
    }
    return widths;
  }

  // --- Helper: Build Checklist Sheet ---
  function buildChecklistSheet() {
    const taxaTable = nlDataStructure.sheets.content?.tables?.taxa;
    const customTable = nlDataStructure.sheets.content?.tables?.customDataDefinition;

    const getDefinedHeaders = (table) => {
      if (table?.columns?.columnName?.templateData) {
        return table.columns.columnName.templateData;
      }
      return [];
    };

    const taxaHeaders = getDefinedHeaders(taxaTable);
    const customHeaders = getDefinedHeaders(customTable);
    let headerKeys = [...taxaHeaders, ...customHeaders];

    const checklistDataConfig = nlDataStructure.sheets.checklist?.templateData || [];
    const dataMap = {};

    checklistDataConfig.forEach(item => {
      dataMap[item.columnName] = item.templateData;
      if (!headerKeys.includes(item.columnName)) {
        if (headerKeys.length === 0) headerKeys.push(item.columnName);
      }
    });

    const sheetData = [];
    if (headerKeys.length > 0) {
      sheetData.push(headerKeys);
      let maxRows = 0;
      Object.values(dataMap).forEach(arr => {
        if (arr && arr.length > maxRows) maxRows = arr.length;
      });

      for (let i = 0; i < maxRows; i++) {
        const row = headerKeys.map(header => {
          if (dataMap[header]) return dataMap[header][i];
          if (header === "Species" && dataMap["Species.name"]) return dataMap["Species.name"][i];
          return "";
        });
        sheetData.push(row);
      }
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
  ["appearance", "content"].forEach(sheetKey => {
    if (!nlDataStructure.sheets[sheetKey]) return;
    const sheetDef = nlDataStructure.sheets[sheetKey];
    const tables = sheetDef.tables;
    if (!tables) return;

    const builtTables = [];
    let maxSheetRows = 0;

    Object.keys(tables).forEach(tableKey => {
      const table = tables[tableKey];
      // Pass tableKey to help identify supportedLanguages
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

  XLSX.writeFile(wb, "checklist_template.xlsx");
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
          let formatting = "text";
          if (tableKey == "taxa") {
            formatting = "checklist-taxon";
          } else if (tableKey == "customDataDefinition") {
            formatting = row["formatting"] || "text";
          }
          if (row[columnKey] === undefined) {
            // eslint-disable-next-line no-console
            console.log(row, columnKey, table.name, formatting, row);
            return;
          }
          result.push({
            name: row[columnKey].toLowerCase(),
            table: table.name,
            formatting: formatting,
            fullRow: row,
          });
        });
      }
    });
  });
  return result;
}

export function getItem(tableData, itemName, langCode, defaultValue, Logger) {
  if (!tableData || !tableData[langCode]) {
    return defaultValue;
  }

  // Pure function: does not mutate input, returns value or default
  const item = tableData[langCode].find(function (row) {
    return row.item == itemName;
  });
  if (item === undefined) {
    if (Logger && typeof Logger.warning === "function") {
      Logger.warning(
        "In sheet <b>nl_appearance</b>, table <b>Customization</b>, could not find the option <b>" +
        itemName +
        "</b>"
      );
    }
    return defaultValue;
  }
  const value = item.value;
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value;
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

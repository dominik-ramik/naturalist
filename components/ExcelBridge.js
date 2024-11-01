import { dataPath } from "../model/DataManager.js";
import { _t, _tf } from "../model/I18n.js";
import { indexOfCaseInsensitive, isArrayOfEmptyStrings, pad } from "./Utils.js";

export let ExcelBridge = function(excelFile) {

    function loadMetaStructure(workbook) {
        Object.keys(data.sheets).forEach(function(sheetKey) {
            let sheet = data.sheets[sheetKey];
            if (sheet.type == "meta") {
                Object.keys(sheet.tables).forEach(function(tableKey) {
                    let table = sheet.tables[tableKey];
                    table.data = {};
                    data.common.languages.supportedLanguages.forEach(function(lang) {
                        table.data[lang.code] = subTableToMultilingualObject(workbook, sheet.name, table, lang);
                    });
                });
            }
        });
    }

    function loadKnownLanguages(workbook) {
        let generalSheet = loadSheet(workbook, data.sheets.appearance.name);
        let languageTable = getSubTable(data.sheets.appearance.name, generalSheet, data.common.languages.languagesTableName);
        if (languageTable.length < 2) {
            throw "The '" + data.common.languages.languagesTableName + "' table needs to have at least one row, which contains the default language of the checklist";
        }

        let nCode = "Code";
        let nName = "Name of language";
        let nFallback = "Fallback language";

        let codeColumn = indexOfCaseInsensitive(languageTable[0], nCode);
        if (codeColumn < 0) {
            throw "Cannot find column 'Code' in the '" + data.common.languages.languagesTableName + "' table on sheet " + data.sheets.appearance.name;
        }
        let nameColumn = indexOfCaseInsensitive(languageTable[0], nName);
        if (codeColumn < 0) {
            throw "Cannot find column 'Name of language' in the '" + data.common.languages.languagesTableName + "' table on sheet " + data.sheets.appearance.name;
        }
        let fallbackColumn = indexOfCaseInsensitive(languageTable[0], nFallback);
        if (codeColumn < 0) {
            throw "Cannot find column 'Fallback language' in the '" + data.common.languages.languagesTableName + "' table on sheet " + data.sheets.appearance.name;
        }

        for (let row = 1; row < languageTable.length; row++) {
            const line = languageTable[row];
            let langCode = getCellFromSubTable(languageTable, row, nCode, "", data.common.languages.languagesTableName);
            let langName = getCellFromSubTable(languageTable, row, nName, "", data.common.languages.languagesTableName);
            let fallbackLang = getCellFromSubTable(languageTable, row, nFallback, "", data.common.languages.languagesTableName);

            /*
            //do not assig a fallback language, let's warn the user later on
            if (!fallbackLang || fallbackLang.toString().length == 0) {
                fallbackLang = "";
            }
            */

            if (langCode.trim() == "") {
                throw "Language code in the table '" + data.common.languages.languagesTableName + "' on line " + row + " cannot be empty";
            }
            if (langName.trim() == "") {
                throw "Language name in the table '" + data.common.languages.languagesTableName + "' on line " + row + " cannot be empty";
            }

            if (row == 1) {
                data.common.languages.defaultLanguageCode = langCode;
            }
            data.common.languages.supportedLanguages.push({ code: langCode, name: langName, fallbackLanguage: fallbackLang });
        }
    }

    function getMultilingualBestFitColumnIndex(headers, columnName, language, subTableName) {
        //try with given language
        let colIndex = indexOfCaseInsensitive(headers, columnName + ":" + language);
        //try with default language code
        if (colIndex < 0) {
            colIndex = indexOfCaseInsensitive(headers, columnName + ":" + data.common.languages.defaultLanguageCode);
        }
        //try without default language code
        if (colIndex < 0) {
            colIndex = indexOfCaseInsensitive(headers, columnName);
        }
        if (colIndex < 0) {
            throw _tf("dm_column_not_found", [columnName, subTableName]);
        }
        return colIndex;
    }

    function getCellFromSubTable(subTable, rowIndex, columnName, language, subTableName) {
        let colIndex = getMultilingualBestFitColumnIndex(subTable[0], columnName, language, subTableName);

        let value = subTable[rowIndex][colIndex];
        return value;
    }

    function subTableToMultilingualObject(workbook, sheetName, tableInfo, lang) {
        let loadedData = [];

        let sheetData = loadSheet(workbook, sheetName);
        let rawSubTable = getSubTable(sheetName, sheetData, tableInfo.name, tableInfo, lang);

        for (let row = 1; row < rawSubTable.length; row++) {
            let lineObject = {}
            Object.keys(tableInfo.columns).forEach(function(columnKey) {
                lineObject[columnKey] = getCellFromSubTable(rawSubTable, row, tableInfo.columns[columnKey].name, lang.code, tableInfo.name);
            });
            loadedData.push(lineObject);
        }

        return loadedData;
    }

    function getSubTable(sheetName, sheetData, tableName, tableInfo, lang) {
        if (sheetData.length < 2) {
            throw 'Cannot find table ' + tableName + ' in the worksheet ' + sheetName;
        }

        let tableStartCol = indexOfCaseInsensitive(sheetData[0], tableName);
        if (tableStartCol < 0) {
            throw 'Cannot find table ' + tableName + ' in the worksheet ' + sheetName;
        }

        let tableEndCol = sheetData[1].indexOf("", tableStartCol);
        if (tableEndCol < 0) {
            tableEndCol = sheetData[1].length;
        }

        let subTable = [];
        for (let row = 1; row < sheetData.length; row++) {
            const cells = sheetData[row].slice(tableStartCol, tableEndCol);

            if (isArrayOfEmptyStrings(cells)) {
                break;
            }
            subTable.push(cells);
        }

        checkCollumnNames(subTable[0]);

        return subTable;

        function checkCollumnNames(headers) {

            headers.forEach(function(header) {
                //check if we have a situation where there is both "column" and "column:defaultLanguage" column names, which woudl be ambiguous
                if (header.indexOf(":") > 0 && indexOfCaseInsensitive(headers, header + ":" + data.common.languages.defaultLanguageCode) >= 0) {
                    throw "You have both '" + header + "' and '" + header + ":" + data.common.languages.defaultLanguageCode + "' in table '" + tableName + "' - to prevent ambiguity, keep only the '" + header + "' column";
                }
                //check if we have more than one : in the column name
                if (header.split(":").length > 2) {
                    throw "Colum name '" + header + "'  in table '" + tableName + "' is malformed - only one symbol ':' is allowed, which separates the column name from the language code";
                }
            });

            if (tableInfo) {
                //verify here that all columns are following integritys "supportMultilingual" rule
                Object.keys(tableInfo.columns).forEach(function(columnKey) {
                    let columnMeta = tableInfo.columns[columnKey];
                    if (!columnMeta.integrity.supportsMultilingual) {
                        let multilingualColumns = [];
                        subTable[0].forEach(function(header) {
                            if (header.toLowerCase() == columnMeta.name.toLowerCase() + ":" + lang.code.toLowerCase()) {
                                multilingualColumns.push(header.substring(columnMeta.name.length));
                            }
                        });
                        if (multilingualColumns.length > 0) {
                            log("error", _tf("dm_cannot_have_language_indicators", [columnMeta.name, tableInfo.name, multilingualColumns.join(", ")]));
                        }
                    }
                });
            }
        }
    };

    function loadSheet(workbook, sheetName) {
        let rawSheetData = readSheetToJSON(workbook, sheetName);
        if (!rawSheetData) {
            throw "Could not find the sheet '" + sheetName + "' in the spreadsheet you provided. This sheet contains critical information about the checklist data you upload and needs to be present and contain the appropriate information (see documentation).";
        }
        return rawSheetData;
    }

    function readSheetToJSON(workbook, sheetName) {
        if (workbook.SheetNames.indexOf(sheetName) < 0) {
            log("error", _tf("dm_cannot_find_sheet", [sheetName]));
            return null;
        }

        let worksheet = workbook.Sheets[sheetName];
        let range = XLSX.utils.decode_range(worksheet["!ref"]);
        let rawData = [];
        for (let row = range.s.r; row <= range.e.r; row++) {
            let i = rawData.length;
            rawData.push([]);
            for (let col = range.s.c; col <= range.e.c; col++) {
                let cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
                rawData[i].push(cell ? cell.v : "");
            }
        }

        return rawData;
    };

    function readWorkbook(excelFile) {
        return XLSX.read(excelFile, {
            type: "binary",
            cellText: false,
            cellDates: true
        });
    }

    // Object to return
    let log = null;
    let data = null;

    let excelBridge = {
        loadMeta: function(dataManagerData, logFunction) {
            log = logFunction;
            data = dataManagerData;

            let workbook = readWorkbook(excelFile);

            //get first info on languages
            loadKnownLanguages(workbook);

            //then process all the known tables
            loadMetaStructure(workbook);
        },

        getRawChecklistData: function() {

            let workbook = readWorkbook(excelFile);

            //load checklist data
            let sheetData = loadSheet(workbook, data.sheets.checklist.name);
            let rawChecklistTable = [];

            let tableStartCol = 0;
            let tableEndCol = 1;

            sheetData[0].forEach(function(header, index) {
                if (header !== undefined && header.toString().trim() != "") {
                    tableEndCol = index + 1;
                }
            });

            for (let row = 0; row < sheetData.length; row++) {
                let cells = sheetData[row].slice(tableStartCol, tableEndCol);

                for (let column = 0; column < cells.length; column++) {
                    let cell = cells[column];

                    if (cell instanceof Date) {
                        cell = new Date(cell - cell.getTimezoneOffset() * 60 * 1000);
                        cells[column] = cell.getFullYear() + "-" + pad((cell.getMonth() + 1).toString(), 2, "0") + "-" + pad(cell.getDate().toString(), 2, "0");
                    }
                }

                if (isArrayOfEmptyStrings(cells)) {
                    break;
                }
                rawChecklistTable.push(cells);
            }

            return rawChecklistTable;
        },
    };

    return excelBridge;
}
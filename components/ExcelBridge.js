import { _t, _tf } from "../model/I18n.js";
import { indexOfCaseInsensitive, isArrayOfEmptyStrings, pad } from "./Utils.js";

//TODO refactor all this so that ExcelBridge only loads raw data from the spreadsheet in form of JSON and passes them on to DataManager to treat
// that will clean the code and make creating other connectors easier

export let ExcelBridge = function (excelFile) {

    function loadMetaStructure(workbook) {
        Object.keys(data.sheets).forEach(function (sheetKey) {
            let sheet = data.sheets[sheetKey];
            if (sheet.type == "meta") {
                Object.keys(sheet.tables).forEach(function (tableKey) {
                    let table = sheet.tables[tableKey];
                    table.data = {};
                    data.common.languages.supportedLanguages.forEach(function (lang) {
                        table.data[lang.code] = subTableToMultilingualObject(workbook, sheet.name, table, lang);
                    });
                });
            }
        });
    }

    function loadKnownLanguages(workbook) {
        let generalSheet = loadSheet(workbook, data.sheets.appearance.name);

        if (generalSheet == null) {
            log("critical", _tf("dm_cannot_load_languages", [data.sheets.appearance.name]))
            return null;
        }

        let languageTable = getSubTable(data.sheets.appearance.name, generalSheet, data.common.languages.languagesTableName, data.sheets.appearance.tables.supportedLanguages);
        if (languageTable.length < 2) {
            //TODO translate this and other hardcoded log messages
            log("critical", "The '" + data.common.languages.languagesTableName + "' table needs to have at least one row, which contains the default language of the checklist");
            return null;
        }

        let nCode = "Code";
        let nName = "Name of language";
        let nFallback = "Fallback language";

        let codeColumn = indexOfCaseInsensitive(languageTable[0], nCode);
        if (codeColumn < 0) {
            log("critical", "Cannot find column 'Code' in the '" + data.common.languages.languagesTableName + "' table on sheet " + data.sheets.appearance.name);
            return null;
        }
        let nameColumn = indexOfCaseInsensitive(languageTable[0], nName);
        if (codeColumn < 0) {
            log("critical", "Cannot find column 'Name of language' in the '" + data.common.languages.languagesTableName + "' table on sheet " + data.sheets.appearance.name);

            return null;
        }
        let fallbackColumn = indexOfCaseInsensitive(languageTable[0], nFallback);
        if (codeColumn < 0) {
            log("critical", "Cannot find column 'Fallback language' in the '" + data.common.languages.languagesTableName + "' table on sheet " + data.sheets.appearance.name);
            return null;
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
            log("error", _tf("dm_column_not_found", [columnName, subTableName]));
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
        if (sheetData == null) {
            return null;
        }

        let rawSubTable = getSubTable(sheetName, sheetData, tableInfo.name, tableInfo, lang);

        if (rawSubTable == null) {
            log("critical", "Cannot find " + sheetName + ", " + tableInfo.name)
            return null;
        }

        for (let row = 1; row < rawSubTable.length; row++) {
            let lineObject = {}
            Object.keys(tableInfo.columns).forEach(function (columnKey) {
                lineObject[columnKey] = getCellFromSubTable(rawSubTable, row, tableInfo.columns[columnKey].name, lang.code, tableInfo.name);
            });
            loadedData.push(lineObject);
        }

        return loadedData;
    }

    function getSubTable(sheetName, sheetData, tableName, tableInfo, lang) {
        if (sheetData == null) {
            log("critical", "Sheet data is null"); //TODO verify this is necessary
            return null;
        }

        if (sheetData.length < 2) {
            log("critical", _tf("dm_cannot_find_table_in_worksheet", [tableName, sheetName]) + " " + _t("dm_verify_doc"));
            return null;
        }

        let tableStartCol = indexOfCaseInsensitive(sheetData[0], tableName);
        if (tableStartCol < 0) {
            log("critical", _tf("dm_cannot_find_table_in_worksheet", [tableName, sheetName]) + " " + _t("dm_verify_doc"));
            return null;
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

        checkCollumnNames(subTable[0], tableInfo);

        return subTable;

        function checkCollumnNames(headers, tableInfo) {
            for (const header of headers) {
                //check if we have a situation where there is both "column" and "column:defaultLanguage" column names, which woudl be ambiguous
                if (header.indexOf(":") > 0 && indexOfCaseInsensitive(headers, header + ":" + data.common.languages.defaultLanguageCode) >= 0) {
                    throw "You have both '" + header + "' and '" + header + ":" + data.common.languages.defaultLanguageCode + "' in table '" + tableName + "' - to prevent ambiguity, keep only the '" + header + "' column";
                }
                //check if we have more than one : in the column name
                if (header.split(":").length > 2) {
                    throw "Colum name '" + header + "'  in table '" + tableName + "' is malformed - only one symbol ':' is allowed, which separates the column name from the language code";
                }
            };
            
            const expectedHeaders = Object.values(tableInfo.columns).map((columnInfo) => columnInfo.name);

            for (const expectedHeader of expectedHeaders) {
                let matchingHeader = headers.find((header) => {
                    const treatedExpectedHeader = expectedHeader.toLowerCase()
                    const treatedHeader = header.toLowerCase()

                    if (treatedExpectedHeader == treatedHeader) {
                        return true;
                    }

                    if (treatedHeader.startsWith(treatedExpectedHeader + ":")) {
                        return true;
                    }

                    return false;
                })

                if (matchingHeader === undefined) {
                    log("critical", "Could not find expected column '" + expectedHeader + "' in table " + tableInfo.name + " " + _t("dm_verify_doc"))
                    return;
                }
            }


            if (tableInfo) {
                //verify here that all columns are following integritys "supportMultilingual" rule
                Object.keys(tableInfo.columns).forEach(function (columnKey) {
                    let columnMeta = tableInfo.columns[columnKey];
                    if (!columnMeta.integrity.supportsMultilingual) {
                        let multilingualColumns = [];
                        subTable[0].forEach(function (header) {
                            if (header.toLowerCase() == columnMeta.name.toLowerCase() + ":" + lang?.code.toLowerCase()) {
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
            log("critical", _tf("dm_cannot_find_sheet", [sheetName]));
            return null;
            //throw "Could not find the sheet '" + sheetName + "' in the spreadsheet you provided. This sheet contains critical information about the checklist data you upload and needs to be present and contain the appropriate information (see documentation).";
        }
        return rawSheetData;
    }

    function readSheetToJSON(workbook, sheetName) {
        if (workbook.SheetNames.indexOf(sheetName) < 0) {
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
        loadMeta: function (dataManagerData, logFunction) {
            log = logFunction;
            data = dataManagerData;

            let workbook = readWorkbook(excelFile);

            //get first info on languages
            loadKnownLanguages(workbook);

            //then process all the known tables
            loadMetaStructure(workbook);
        },

        getRawChecklistData: function () {

            let workbook = readWorkbook(excelFile);

            //load checklist data
            let sheetData = loadSheet(workbook, data.sheets.checklist.name);
            if (sheetData == null) {
                log("critical", "Could not locate checklist sheet")
                return null;
            }

            let rawChecklistTable = [];

            let tableStartCol = 0;
            let tableEndCol = 1;

            sheetData[0].forEach(function (header, index) {
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
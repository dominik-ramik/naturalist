let dataModel = {}

await fetch('./model/DataModel.json')
    .then(response => response.json())
    .then(obj => dataModel = obj)

export let nlDataStructure = {
    common: {
        languages: {
            languagesTableName: "Supported languages",
            defaultLanguageCode: "",
            supportedLanguages: [], // first is default | {code: "en", name: "English", fallbackLanguage: "en"}
        },
        checklistHeadersStartRow: 1,
        allUsedDataPaths: {}, // allUsedDataPaths[lang.code] = dataPath
        getAllColumnInfos: function (langCode) {
            let result = [];
            Object.keys(nlDataStructure.sheets.content.tables).forEach(function (tableKey) {
                let table = nlDataStructure.sheets.content.tables[tableKey];
                Object.keys(table.columns).forEach(function (columnKey) {
                    if (columnKey == "columnName" && table.data[langCode]) {
                        table.data[langCode].forEach(function (row) {
                            let role = "data";
                            let type = "general";
                            if (row.contentType == "taxon") {
                                type = "taxon";
                            }
                            if (tableKey == "taxa") {
                                type = "taxon"; //can have .name and .authority
                                role = "taxon";
                            }
                            if (tableKey == "media") {
                                type = "media" //can have .source and .title
                            }

                            if(row[columnKey] === undefined){
                                console.log(row, columnKey, table.name, type, role, row)
                                return;
                            }

                            result.push({
                                name: row[columnKey].toLowerCase(),
                                table: table.name,
                                type: type,
                                role: role,
                                fullRow: row,
                            });
                        });
                    }
                });
            });
            return result;
        },
        getItem: function (tableData, itemName, langCode, defaultValue) {
            let item = tableData[langCode].find(function (row) {
                return row.item == itemName;
            });
            
            if(item === undefined){
                return defaultValue;
            }

            let value = item.value;
            if (value === null || value === undefined) {
                return defaultValue;
            }
            return value;
        }
    },
    sheets: dataModel
};
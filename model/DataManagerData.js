import { i18n } from "./I18n.js";

export let nlDataStructure = {
    common: {
        languages: {
            languagesTableName: "Supported languages",
            defaultLanguageCode: "",
            supportedLanguages: [], // first is default | {code: "en", name: "English", fallbackLanguage: "en"}
        },
        checklistHeadersStartRow: 1,
        allUsedDataPaths: {}, // allUsedDataPaths[lang.code] = dataPath
        getAllColumnInfos: function(langCode) {
            let result = [];
            Object.keys(nlDataStructure.sheets.content.tables).forEach(function(tableKey) {
                let table = nlDataStructure.sheets.content.tables[tableKey];
                Object.keys(table.columns).forEach(function(columnKey) {
                    if (columnKey == "columnName") {
                        table.data[langCode].forEach(function(row) {
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
        }
    },
    sheets: {
        appearance: {
            skipAutoImport: true,
            name: "nl_appearance",
            description: "This sheet allows you to configure the appearance of the data from the checklist sheet in the app.",
            type: "meta",
            tables: {
                supportedLanguages: {
                    name: "Supported languages",
                    description: "This table allows for declaration of one or more languages in which the checklist is presented. It is possible to create checklists which will display data in different languages. See the <a href=\"us-birds.xlsx\">Birds of the US</a> sample checklist which is a bilingual English/French checklist, and scan through headers on all three sheets for column names ending with \":fr\" (French version) or \":en\" (default, English version). Once you have declared your language codes and names you wish to use (en / English and fr / French in the sample), you can append \":\" and langauge code (e.g. \":fr\") to columns which are allowed to be multilingual to mark them to be used for a specific language version of the checklist.\nYou have to define at least one language for your checklist.",
                    columns: {
                        code: {
                            name: "Code",
                            description: "Code of the language. The language on the first line is treated as the default language. Any column which has no language mention (:code) appended is treated as this default language.",
                            integrity: {
                                description: "The value should be a two-letter language code following ISO 639-1 in lowercase, see <a href=\"https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes\">Wikipedia</a>",
                                allowDuplicates: "no",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        name: {
                            name: "Name of language",
                            description: "Name of the language, which will be displayed in the main app menu language switch.",
                            integrity: {
                                description: "Language name, preferably in that language, e.g. English, Français, Česky, ...",
                                allowDuplicates: "no",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        fallback: {
                            name: "Fallback language",
                            description: "If you use a language Code of a language for which the user interface is not translated (e.g. the Inuktitut), you can specify here a code of the language which you prefer the user interface shows in (e.g. \"fr\" for French). Otherwise English will be used by default.",
                            integrity: {
                                description: "Two-letter code of any of the following supported user interface language codes: " + i18n.getSupportedLanguageCodes().join(", "),
                                allowDuplicates: "yes",
                                allowEmpty: true,
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        }
                    }
                },
                customization: {
                    name: "Customization",
                    description: "This table allows for customization of some elements of the checklist. The entries in the column Item are fixed, you can change the value of cells in the column Value. This column can be multilingual, so if you have more than one language, say a bi-lingual English-French checklist, you can change the header to Value:en and add immediately to the right a new column with the header Value:fr",
                    columns: {
                        item: {
                            name: "Item",
                            description: "This column is pre-filled with a set of items defining certain behaviors of your checklist.",
                            integrity: {
                                description: "",
                                allowDuplicates: "no",
                                allowEmpty: false,
                                allowedContent: "list",
                                listItems: ["Color theme hue", "Checklist name", "About section", "Name of checklist data sheet", "Checklist data headers row", "Date format"],
                                supportsMultilingual: false
                            }
                        },
                        value: {
                            name: "Value",
                            description: "Define the values for each of the items here. As this column is multilingual, you can have sevaral Value colums in this table (e.g. Value:en, Value:es and Value:fr side by side if you defined English, Spanish and French as languages of your checklist).",
                            integrity: {
                                description: "<ul><li><b>Color theme hue</b>: a number from 0 to 360 representing a hue of the color theme of the app. The default deep blue hue is 212. If you want to pick your own, find the hue with an online tool like <a href=\"https://hslpicker.com\">hslpicker.com</a> (use the value of the topmost slider). You can visually separate different language mutations of your checklist (if you make a multilingual one) by assigning different hues to different translations</li><li><b>Checklist name</b>: A short name which will appear in the header of the checklist app. E.g. Vascular flora of Vanuatu</li><li><b>About section</b>: a free-form text which will appear in the About section in the checklist menu. You can write there a short description of the checklist, contacts to its author or any other information. You can use <a href=\"#g-md\">Markdown<a/> to format your text including different heading levels, links, images (in folder 'usercontent' or hosted elsewhere), lists or other. If your text is more complex, you may wish to prepare it first in a text editor and when you are happy with the result, copy-paste it into the appropriate cell in this table</li><li><b>Name of checklist data sheet</b>: name of the sheet which contains the checklist data. By default this is called \"checklist\", but you can modify that if you need the sheet be called otherwise</li><li><b>Checklist data headers row</b>: By default the headers row is on line 1, but in case your data are designed otherwise and the checklist data headers are on any other row (e.g. headers are on row 2 because row 1 is occupied by supplementary infor for curators or any other data), put the row number here.</li><li><b>Date format</b>: If you dates in your checklist data sheet, you can determine here how the date will be shown in your checklist. Available formats, see: <a href=\"https://day.js.org/docs/en/display/format\">day.js.org</a>. You can define different formats for different language mutations (e.g. if you have English (en) and French (fr) defined as the checklist languages, you can have in the column Value:en a value MMM D, YYYY while the column Value:fr can have the more common French format YYYY/MM/DD). By default or if left empty the format is YYYY-MM-DD.</li></ul>",
                                allowDuplicates: "yes",
                                allowEmpty: true,
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        }
                    },
                    data: [],
                    getItem: function(itemName, langCode, defaultValue) {
                        let item = nlDataStructure.sheets.appearance.tables.customization.data[langCode].find(function(row) {
                            return row.item == itemName;
                        });
                        let value = item.value;
                        if (value === null || value === undefined) {
                            return defaultValue;
                        }
                        return value;
                    }
                },
                searchOnline: {
                    name: "Search online",
                    description: "When you click on any taxon in the checklist app, a 'Details' pane opens with the taxon details. If you fill this table, you can display a series of links to search engines of herbaria, collections, encyclopedia or other where the taxon may be found through a template URL adress. You can find some exemples in the <a href=\"us-birds.xlsx\">Birds of the US</a> sample checklist.\nThis table can be left completely empty, if you do not want to provide users means to search the taxa in external search engines. This being said, adding appropriate search engines will help users find relevant information about the taxa you present (e.g. digitalized specimens, if you provide a link to a muzeum or herbarium collection).",
                    columns: {
                        title: {
                            name: "Title",
                            description: "The title of the link to the search engine you wish to display. As this column is multilingual, you can have different titles for different language mutations (e.g. 'Google Image Search' in English version column Title:en and 'Recherche des images Google' in the French column Title:fr).",
                            integrity: {
                                description: "A short title describing the search engine.",
                                allowEmpty: false,
                                allowDuplicates: "no",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        icon: {
                            name: "Icon",
                            description: "For each search engine, you should prepare an icon to be displayed with the link. The icon should represent visually the search engine (e.g. use its logo) and preferably be square (200px width/height should be enough) and have white or transparent background. The icon must be put into the 'usercontent' folder, inside the 'online_search_icons' subfolder.",
                            integrity: {
                                description: "Name of the image including the extension (e.g. google.png)",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "filename",
                                allowedExtensions: [".jpg", ".png", "webp", ".svg"],
                                supportsMultilingual: true
                            }
                        },
                        searchUrlTemplate: {
                            name: "Search URL template",
                            description: "Here you define to which web (URL) your users will be directed when clicking on the search engine link. For example, if you want to allow them to display images of the given taxon on Google Image Search, you can first search for an arbitrary taxon on Google Image Search ... e.g. Turdus merula. Then you can copy the results address (which will look something like <i>https://www.google.com/search?q=Turdus%20merula&tbm=isch &sxsrf=As5e5fwef5wwHOw:1673525622390 &source=lnms&sa=X...</i> with a lot of other unnecessary parameters), remove the unneeded URL parameters and replace the search string (Turdus merula) by a template designating the taxon name ... getting at the end https://www.google.com/search?q={{taxon.name}}&tbm=isch which is the URL you can copy-paste into the appropriate cell in this column. Some search engines of online museum collections or herbaria might by a bit more fiddly, but in general one can create templated search URLs for nearly all search engines.",
                            integrity: {
                                description: "A URL of the desired search engine where URL parameters which determine the search are replaced by the template {{ taxon.name }} (or any other necessary, see <a href=\"#g-template\">template</a> for all template options).",
                                allowEmpty: false,
                                allowDuplicates: "no",
                                allowedContent: "url",
                                supportsMultilingual: true
                            }
                        },
                    },
                    data: []
                },
                badges: {
                    name: "Colored badges",
                    description: "If your checklist contains small sets of categorical data (e.g. Red List codes, status like Native, Introduced, Endemic, ...), you can make them visually stand out by transforming them into a colored 'badge'. The columns from the checklist sheet whose data will be presented as badges and the color of the individual values are defined in this table.\nThis table can be left completely empty, if you do not need to display colored badges.",
                    columns: {
                        columnName: {
                            name: "Column name",
                            description: "One of the columns in your checklist sheet whose values you wish to convert into badges. In the Birds of the US sample checklist, RedList.Code is one of the columns for which the badge is set.",
                            integrity: {
                                description: "Each of the values need its separate line, so if you have badges for a Status column with 3 possible values (say Native, Endemic and Introduced), you will need three lines, one for each value but all with the same Column name 'Status'.",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "dataPath",
                                supportsMultilingual: false
                            }
                        },
                        containsText: {
                            name: "Contains text",
                            description: "To tell the checklist app which data should be formatted in which way, you can use this column to match different values of your data.",
                            integrity: {
                                description: "A case-insensitive text to be matched for this badge. E.g. if you enter 'Endemic', then 'Endemic', 'near Endemic' and 'Endemic?' values will be transformed into this badge too.",
                                allowEmpty: false,
                                allowDuplicates: "no",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        backgroundColor: {
                            name: "Background color",
                            description: "Background color of the badge for the particular 'Contains text' value",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                defaultValue: "transparent",
                                allowedContent: "cssColor",
                                supportsMultilingual: false
                            }
                        },
                        textColor: {
                            name: "Text color",
                            description: "Text color of the badge. Make sure it is different enough from the background color in order to make it easily readable.",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                defaultValue: "black",
                                allowedContent: "cssColor",
                                supportsMultilingual: false
                            }
                        },
                        borderColor: {
                            name: "Border color",
                            description: "You can define a separate border color. If you wish to have a simple badge without border, you can use the same color as for the background.",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                defaultValue: "black",
                                allowedContent: "cssColor",
                                supportsMultilingual: false
                            }
                        },
                    },
                    data: []
                },
                mapRegions: {
                    name: "Map regions",
                    description: "<strong>NaturaList</strong> allows you to associate different kinds of maps with each taxon. If you are using maps of type 'regions' (defined on sheet <b>nl_content</b>, table <b>Maps</b>), you can define here how different regions will be colored and what legend will be displayed for them. See more on maps in the documentation of table <a href=\"#table-maps\">Maps</a>.\nThis table can be left completely empty, if you do not need use region maps.",
                    columns: {
                        suffix: {
                            name: "Suffix",
                            description: "On each line a suffix of map regions to be matched against. Empty cell will match regions without suffix (convenient for the common cases ... e.g. 'Native' when making a map of presence in a country).",
                            integrity: {
                                description: "An empty cell (matching suffix-less regions) or a single or several characters representing a region suffix. E.g. on the map of the world, 'ca' without any suffix would represent the taxon is native to Canada, while 'ca+' could represent 'Introduced' and 'ca*' could represent the taxon is endemic to Canada. In this case, three rows would be used, the first empty, the second with suffix '+' and the third with suffix value '*'.",
                                allowEmpty: true,
                                allowDuplicates: "no",
                                defaultValue: "",
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        fillColor: {
                            name: "Fill color",
                            description: "The fill color applied to the matching region and to its legend element.",
                            integrity: {
                                description: "",
                                allowEmpty: false,
                                allowDuplicates: "no",
                                allowedContent: "cssColor",
                                supportsMultilingual: false
                            }
                        },
                        legend: {
                            name: "Legend",
                            description: "The content of this column will serve as the text for the legend for the matching suffix. As this column is multilingual, you na create several columns e.g. Legend:en and Legend:fr to represent the English and French translations of the legend.",
                            integrity: {
                                description: "A single word or a short text to appear in the legend.",
                                allowEmpty: false,
                                allowDuplicates: "no",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                    },
                },
                searchOrder: {
                    name: "Search category custom order",
                    description: "When you assign a 'Search category title' to a checklist data column (see the documentation of table <a href=\"#table-customDataDefinition\">Custom data definiton</a> under 'Search category title' column), the content of that data column is used to show a filter to search through it. By default the content of the filter is ordered alphabetically and this will likely work best in most cases. However, if you need the items to appear in the filter in a custom order, you can use this table to define it. A sample use case could be the Red List category, where it is less useful to have the categories appear in alphabetical order (i.e. Critically endangered first, followed by Endangered, Extinct in the wild, etc.). Instead, you may wish this filter to appear in order of threat severity from the highest to the least. Another use case could concern the topmost taxonomic category in a botanical checklist, where there could be e.g. Lycophytes, Ferns, Gymnosperms, Monocots and Dicots and instead of showing them alphabetically ordered in the checklist, one could order them in a way to put the most prominent categories at the top. See the sample <a href=\"us-birds.xlsx\">Birds of the US</a> checklist for an example of custom ordering of columns 'redlist.name' and 'presence'. Items will be presented in the filter in the order in which they appear in this table. Any item that was not included in the table will be rendered at the end of the list in alphabetical order.\nThis table can be left completely empty, if you do not need custom order in your filters.",
                    columns: {
                        columnName: {
                            name: "Column name",
                            description: "The name of the column from the checklist data which you want to present in the filter in a custom order.",
                            integrity: {
                                description: "Existing checklist data sheet column name. The column has to have the 'Search category title' set in <a href=\"#table-customDataDefinition\">Custom data definiton</a> table.",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "dataPath",
                                supportsMultilingual: false
                            }
                        },
                        values: {
                            name: "Values ordered",
                            description: "Values from the given column, one per row in the order in which they should appear in the filter. As this column is multilingual, you can impose here custom ordering for different language mutations",
                            integrity: {
                                allowEmpty: false,
                                description: "Any value from the given column.",
                                allowDuplicates: "no",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                    },
                    data: []
                },
            }
        },
        content: {
            name: "nl_content",
            description: "This sheet allows you to tell <strong>NaturaList</strong> the meaning of each column in the checklist sheet. In the minimalistic <a href=\"blank-naturalist-spreadsheet.xlsx\">blank checklist</a> example, on the 'checklist' data sheet you can see columns with column names 'ORD', 'FAM', 'Habit', 'RedList', etc. It is the <strong>nl_content</strong> sheet which tells the app that the column <b>ORD</b> is in fact a taxon level which should be called Order (you can find it in the table <b>Taxa definition</b> ... note that <strong>NaturaList</strong> doesn't require you to adhere to any particular taxonomic units, you are free to use informal or folk units if that is needed in your project). Then you can see that the <b>RedList</b> column is a 'custom data' column and the table <b>Custom data definition</b> on the <b>nl_content</b> sheet says that the title of that data is 'Red list category' and it should be placed in the middle column on the checklist.\nBrowse the documentation of each of the<b>nl_content</b> sheet tables below for information about their use. Each table represents a different type of data - taxa are defined in the <bTaxa definition</b> table, custom data ssociated with each taxon are defined in the <b>Custom data definition</b> table and so on.\nAll columns from the checklist sheet which you want to be displayed in the checklist must appear in one of the tables on this sheet. Checklist sheet columns not references in any of the tables here may still be kept in the sheet, but won't affect the checklist data (you can use those extra columns for your personal notes or as helper columns).\nThis table can be left completely empty, if you do not wish to display any accompanying data in your checklist and wish to display only a tree of taxa.",
            type: "meta",
            tables: {
                taxa: {
                    name: "Taxa definition",
                    description: "In this table you define your taxonomic units hierarchy. The first row is the highest taxonomic rank and the last row represents the leaves of your taxonomic tree. You have a complete freedom in what units you chose. You can use formal or informal taxonomic units as long as it suits your project. Note that you need to have at least one taxonomy level defined here for the checklist to show anything at all.",
                    columns: {
                        columnName: {
                            name: "Column name",
                            description: "This tells the app which column in the checklist sheet contains the taxon name for this level. The column name can be just about anything that makes sense to you, the name under which the taxon will be displayed is set in the <b>Taxon name</b> column. Note that by default all the taxa columns are treated as 'taxon' type, so if you define in this table a taxon with column name <b>genus</b>, in your checklist spreadsheet you can have a simple column called 'genus' with all the genera names if you don't need to display the genus authority, or else you can have two columns, one being <b>genus.name</b>, where the name itself of the genus goes (e.g. Schefflera), and besides you can have column <b>genus.authority</b>, into which you can fill the appropriate taxonomic authority (e.g. J.R.Forst. & G.Forst.).",
                            integrity: {
                                description: "Column name containing the taxon name, e.g. 'Regnum', 'Kingdom', 'MajorGroup' ...",
                                allowDuplicates: "no",
                                allowedContent: "columnName",
                                allowEmpty: false,
                                supportsMultilingual: false
                            }
                        },
                        taxonName: {
                            name: "Taxon name",
                            description: "This is the name under wich this taxon level will appear in the checklist app. This column is multilingual, so you can specify translated names of your taxon units for each language.",
                            integrity: {
                                description: "Human-readable name you wish to show for this taxon unit.",
                                allowDuplicates: "no",
                                allowedContent: "any",
                                allowEmpty: false,
                                supportsMultilingual: true
                            }
                        },
                        orderBy: {
                            name: "Order by",
                            description: "By default, each level of the checklist is ordered alphabetically when displayed. If this is alright for you, you can leave this cell empty. If you need to display certain taxon level in the order it is ketp in your checklist spreadsheet (e.g. you want to show your topmost taxonomic units in order Ferns, Bryophytes, Dicots as it ordered in your checklist sheet, instead of the alphabetical Bryophytes, then Diconts and finally Ferns), you can fill 'as is' to the appropriate row here.",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                defaultValue: "alphabet",
                                allowedContent: "list",
                                listItems: ["as is", "alphabet", ""],
                                supportsMultilingual: false
                            }
                        },
                    },
                    data: []
                },
                customDataDefinition: {
                    name: "Custom data definition",
                    description: "Typically you will want to show some additional data next to each taxon in your checklist. This is the place where you tie different data columns of the checklist spreadsheet to how <strong>NaturaList</strong> should handle or display them.\nRead about the <a href=\"#g-datapath\">data path</a> concept to see how you can represent complex data like arrays (multiple items of the same type, like assigning several habitat types to a taxon) or structured data (like publication information with year, name and link to the publication) by using simple spreadsheet columns.",
                    columns: {
                        columnName: {
                            name: "Column name",
                            description: "The name of the column (in generalized 'data path' format) to which the particular row is relating.",
                            integrity: {
                                description: "An existing column name from the checklist sheet. If you have data in complex data paths, such as having a list of habits in the checklist sheet in columns like habit1, habit2, habit3, then you need to provide all levels of the data path, one per row. You will thus need a row with Column name <b>habit</b> and on the next row Column name <b>habit#</b> which stands for each of the habit1, habit2, ... columns. Nested data, such as the <b>origPub</b> (data holding the original publication) in the <a href=\"us-birds.xlsx\">Birds of the US</a> sample checklist, where there are several sub-items to the origPub - origPub.author (column holding the publication author), origPub.year (column holding the year of the publication) etc. follow the same rule as you can see in the sample spreadsheet.",
                                allowEmpty: false,
                                allowDuplicates: "no",
                                allowedContent: "dataPath",
                                supportsMultilingual: false
                            }
                        },
                        title: {
                            name: "Title",
                            description: "The title of the data item you want to show in front of the data.",
                            integrity: {
                                description: "You can enter any title (multilingual content is supported, so you can have columns Title:en, Title:fr etc.) or leave this blank if you want no title to be displayed. This is useful when using nested data, such as the <b>habitat</b> in the <a href=\"us-birds.xlsx\">Birds of the US</a>, where the data item 'habitat' gets its title (Habitat), but each of the habitat values in the array (row Habitat#) get no title, so each of the habitat values are displayed plainly.",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                defaultValue: "",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        searchCategoryTitle: {
                            name: "Search category title",
                            description: "If you wish to display a filter for values of this column, enter here a title for the filter button.",
                            integrity: {
                                description: "Any short descriptive text that will serve as the filter button title.",
                                allowEmpty: true,
                                allowDuplicates: "empty-only",
                                defaultValue: "",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        subitemsSeparator: {
                            name: "Subitems separator",
                            description: "If the column has subitems (e.g. the <b>habitat</b> column, which has an array of subitems <b>habitat#</b>, or the <b>origPub</b>, which has subitems <b>origPub.author</b>, <b>origPub.year</b> in the <a href=\"us-birds.xlsx\">Birds of the US</a> sample), you can here define the way the subitems will be rendered in the checklist.",
                            integrity: {
                                description: "Several special values are recognized: <ul><li><b>bullet list:</b> all the subitems will be rendered in a bullet list</li><li><b>numbered list:</b> all the subitems will be rendered in a numbered list starting with 1</li><li><b>space:</b> items won't form a list, but will follow each other on one line, there will be a single space between each item</li><li><b>comma:</b> items won't form a list, but will follow each other on one line, there will be a comma and a space between each item</li><li>any other value (one or multiple characters): items won't form a list, but will follow each other on one line, there will be the given character(s) between each item, technically using the special value 'comma' or directly writing ', ' here are equivalent</li></ul>",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                defaultValue: "",
                                allowedContent: "any",
                                supportsMultilingual: false
                            }
                        },
                        contentType: {
                            name: "Content type",
                            description: "Most of the data in the checklist sheet data columns will probably be plain text. However, if a particular column contains a number or another type of data, you can specify it here. It will have impact on how the data are shown (e.g. <b>taxon</b> type will be rendered as a clickable taxon name, or <b>number</b> type will enable a special numeric filter if you use that column as a filter category)",
                            integrity: {
                                description: "Several values are possible: <ul><li><b>text:</b> (or just empty cell) means the content of this data column in the checklist sheet is treated as a normal text. If 'Search category title' is set, it will be displayed with a text filter button.</li><li><b>number:</b> means the content of this data column in the checklist sheet is treated as a number (integer or decimal, you need to ensure the column contains only properly formatted numbers in your checklist sheet). If 'Search category title' is set, it will be displayed with a numeric filter button.</li><li><b>taxon:</b> instructs the checklist app to render the column as a clickable taxon. Note that if the column is called e.g. 'basionym', then the checklist sheet may contain just that column, or can actually contain columns <b>basionym.name</b> and <b>basionym.authority</b> where you fill the appropriate data.</li><li><b>date:</b> if you enter a properly formatted date in your spreadsheet to this column, it will be parsed and formatted according to the format you defined on the <b>nl_appearance</b> sheet in the <a href=\"#table-customization\">Customization</a> table under the <b>Date format</b> item.</li></ul>",
                                allowEmpty: true,
                                defaultValue: "text",
                                allowDuplicates: "yes",
                                allowedContent: "list",
                                listItems: ["text", "number", "taxon", "date", ""],
                                supportsMultilingual: false
                            }
                        },
                        template: {
                            name: "Template",
                            description: "The templating engine used by <strong>NatureList</strong> allows you to process your data using a template before displaying them. This can be as simple as entering '{{value}} cm' if you wish to append the 'cm' unit behind the value of that column, or a more complex case coupled with Markdown formatting '[{{taxon.name}}](http://datazone.birdlife.org/species/factsheet/{{value}})', where the actual value ({{value}}) of that column in the checklist sheet is taken as a part of the web adress, which is displayed as a link with the taxon name ({{taxon.name}}) as link title. See the glossary entry <a href=\"#g-template\">template</a> for complete documentation.",
                            integrity: {
                                description: "Empty, if not needing a template, or a custom template.",
                                allowEmpty: true,
                                defaultValue: "",
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        placement: {
                            name: "Placement",
                            description: "Each piece of data can be displayed in several places on a grid just below the taxon it is associated with. For longer texts you can chose the 'top' or the 'bottom' row placement, while shorter data items can be more conveniently distributed in the 'left', 'right' or 'middle' column of the row in between. See the <a href=\"us-birds.xlsx\">Birds of the US</a> sample checklist for examples.",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                defaultValue: "top",
                                allowedContent: "list",
                                listItems: ["top", "bottom", "left", "middle", "right", ""],
                                supportsMultilingual: false
                            }
                        },
                        formatting: {
                            name: "Formatting",
                            description: "By default, data items are displayed plain, without additional formatting. If you need your data to be formatted, you can chose here the proper style.",
                            integrity: {
                                description: "Several values are possible: <ul><li><b>none:</b> (or just an empty cell) means the data will be shown without any additional formating.</li><li><b>markdown:</b> means you can use <a href=\"#g-md\">Markdown syntax<a/> in the data of this column in the checklist sheet.</li><li><b>badge:</b> means the data in this column in the checklist sheet will be formatted as colored badges. You can define which data get what format on the <b>nl_appearance</b> sheet in the table <a href=\"#table-badges\">Colored badges</a>.</li></ul>",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                allowedContent: "list",
                                listItems: ["markdown", "badge", "none", ""],
                                defaultValue: "none",
                                supportsMultilingual: false
                            }
                        },
                        hidden: {
                            name: "Hidden",
                            description: "Some of your columns in the checklist sheet may contain data, which you do not want to display directly, but which you nonetheless reference e.g. through a template of another column. You can use this column to make sure your data are loaded, but are kept hidden.",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "yes",
                                allowedContent: "list",
                                listItems: ["yes", "no", ""],
                                defaultValue: "no",
                                supportsMultilingual: false
                            }
                        },
                    },
                    data: []
                },
                media: {
                    name: "Media",
                    description: "Your may wish to present a collection of images, photos or audio recordings alongside each of the taxa in your checklist. This table allows you to link specific columns in your checklist sheet and turn them into sources of media, which will be displayed in the <b>Details></b> pane once you click on any taxon.\nThis table can be left completely empty, if you do not wish to display any media in the <b>Details</b> pane.",
                    columns: {
                        columnName: {
                            name: "Column name",
                            description: "Name of the column in your checklist sheet which holds the relevant information to generate the media URL (e.g. the file name of a photo, identifying number of a recording which can included in an URL adress to access it etc.).",
                            integrity: {
                                description: "A column name from the checklist sheet, e.g. 'photo'. Media columns work automatically as arrays, so if you define here the column name 'photo', you can have columns 'photo1', 'photo2', 'photo3', ... in your checklist sheet, each representing one of several photos (or other media) you wish to link with this taxon. Note that you can use the column name (e.g. photo1) simply to hold the media identifier (file name, ...), or you can create columns 'photo1.source' and 'photo1.title', where the first column holds the media identifier, while the second one holds a title to be displayed with the media (e.g. authors or copyright notice or a short description).",
                                allowEmpty: false,
                                allowDuplicates: "no",
                                allowedContent: "columnName",
                                supportsMultilingual: false
                            }
                        },
                        title: {
                            name: "Title",
                            description: "A short title which will be displayed above the group of media of this column.",
                            integrity: {
                                description: "",
                                allowEmpty: true,
                                allowDuplicates: "empty-only",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        typeOfData: {
                            name: "Type of data",
                            description: "If the media is of image type, type <b>image</b> here. If it is a sound, entering <b>sound</b> will display a sound player instead.",
                            integrity: {
                                description: "",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "list",
                                listItems: ["image", "sound"], //TODO-future, "video"
                                supportsMultilingual: false
                            }
                        },
                        linkBase: {
                            name: "Link base",
                            description: "A URL template directing to the media. It can be a an URL from anywhere in the internet (in this case it has to start with http:// or https://), or it can be ponting to files stored in the <b>usercontent</b> folder (or one of its subfolders) in your installtion of <strong>NaturaList</strong>, in which case it has to start with 'usercontent/'. See the <a href=\"us-birds.xlsx\">Birds of the US</a> sample checklist for examples and the <a href=\"#g-template\">template</a> glossary entry for all template options",
                            integrity: {
                                description: "A template URL, par exemple 'usercontent/images/{{ value }}' will use the value (a file name in this example) of the given column in the checklist sheet and load the resource (an image) stored in the folder 'usercontent/images/'",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                    },
                    data: []
                },
                maps: {
                    name: "Maps",
                    description: "You can supply several kinds of maps with each of your taxa. This table allows you to link specific columns in your checklist sheet with the necessary information to display the maps on the <b>Details</b> pane when clicking on any of the taxa in your checklist.\nDepending on the type of the map, the corresponding data column in the checklist sheet may contain a resource identifier (file name, resource number, ...) which will be used to compose the URL of the map if you use the <b>image</b> or <b>link</b> map type. If you use the <b>regions</b> map type, the data column will hold a space-separated list of regions to color on the map which you suppy in SVG format and on which shapes of countries or regions have <b>class</b> attribute which you can reference. E.g. on the world map (world.svg supplied in the folder usercontent/maps) each country has its two-letters code set as the class attribute. Filling 'us ca mx' in the data column will the cause the corresponding countries (USA, Canada, Mexico) to be colored on the map.\nThis table can be left completely empty, if you do not wish to display any maps in the <b>Details</b> pane. Note that your regions can bear suffixes (e.g. 'us+ ca?') by which you can modify what color the region will be. This behavior can be set on the <b>nl_appearance</b> sheet in the <a href=\"#table-mapRegions\">Map regions</a> table.",
                    columns: {
                        columnName: {
                            name: "Column name",
                            description: "Name of the column in your checklist sheet which holds the relevant information to generate the map.",
                            integrity: {
                                description: "",
                                allowEmpty: false,
                                allowDuplicates: "no",
                                allowedContent: "columnName",
                                supportsMultilingual: false
                            }
                        },
                        mapType: {
                            name: "Map type",
                            description: "Chose the type of the map you want to display. You can have several maps of the same type on separate rows (e.g. a 'regions' world map and then another 'regions' country-level map).",
                            integrity: {
                                description: "The available options are:<ul><li><b>regions: a SVG map will be shown with regions colored following the referenced data column in your checklist sheet.</b></li><li><b>image: </b>an image map will be displayed, loaded from the URL you supply.</li><li><b>link: </b>a simple link to a map on another website will be generated. This can be useful when you want to present a third party map, like the bird maps on <a href=\"https://ebird.org/map\">eBird</a></li></ul>",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "list",
                                listItems: ["regions", "image", "link"],
                                supportsMultilingual: false
                            }
                        },
                        source: {
                            name: "Source",
                            description: "The information necessary to compose the map URL. It can be an URL template in case of map types <b>image</b> or <b>link</b>, e.g. for the 'link' type, it could be 'http://datazone.birdlife.org/species/factsheet/{{ data.birdlifeid }}' pointing to a map page on the BirdLife website and pulling the map identifier through a template {{data.birdlifeid}} from the data column <b>birdlifeid</b> present in the checklist data sheet. In case you are suing the <b>regions</b> map type, this will be the file name of the SVG map found in the 'usercontent/maps' folder. <strong>NatureList</strong> comes with a world map ready to be used, but you can paste into the 'maps' folder your own, covering the country/area you need. ",
                            integrity: {
                                description: "If a template URL is used, see <a href=\"#g-template\">template</a> glossary entry for full range of options.",
                                allowEmpty: false,
                                allowDuplicates: "yes",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                        mapTitle: {
                            name: "Map title",
                            description: "The title to be displayed below each map",
                            integrity: {
                                description: "",
                                allowEmpty: false,
                                allowDuplicates: "no",
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                    },
                    data: []
                },
                accompanyingText: {
                    name: "Text",
                    description: "If you have one or several pieces of longer text accompanying each of the taxa in your checklist, you can avoid the clutter of displaying them directly in the checklist and rather use the <b>Texts</b> section available in the <b>Details</b> pane when clicking the taxon name. You can have a single column, or several columns in your checklist sheet, each corresponding to a section of your text. The text is automatically parsed for <a href=\"g-md\">Markdown</a> syntax, so you can use a variety of formatted text and link images.\nThis table can be left completely empty, if you do not wish to display any accompanying text in the <b>Details</b> pane.",
                    columns: {
                        columnName: {
                            name: "Column name",
                            description: "Name of the column which holds the accompanying text.",
                            integrity: {
                                description: "You can enter one or several rows with columns holding your text in the checklist sheet.",
                                allowDuplicates: "no",
                                allowEmpty: false,
                                allowedContent: "columnName",
                                supportsMultilingual: false
                            }
                        },
                        title: {
                            name: "Title",
                            description: "This represents the title shown above this text entry. It will also serve to generate a mini content table if you use more than one text sections (i.e. you add several rows with several names of columns). As this column is multilingual, you can define translations of section titles into different languages.",
                            integrity: {
                                description: "A short title of this section",
                                allowDuplicates: "no",
                                allowEmpty: false,
                                allowedContent: "any",
                                supportsMultilingual: true
                            }
                        },
                    },
                    data: []
                },
            }
        },
        checklist: {
            name: "checklist",
            type: "data",
            data: []
        },
    }
};
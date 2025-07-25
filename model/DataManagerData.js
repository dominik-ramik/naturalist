export let nlDataStructure = {
  common: {
    languages: {
      languagesTableName: "Supported languages",
      defaultLanguageCode: "",
      supportedLanguages: [], // first is default | {code: "en", name: "English", fallbackLanguage: "en"}
    },
    checklistHeadersStartRow: 1,
    allUsedDataPaths: {}, // allUsedDataPaths[lang.code] = dataPath

    _columnInfosCache: {}, // Add cache object

    getAllColumnInfos: function (langCode) {
      if (this._columnInfosCache[langCode]) {
        return this._columnInfosCache[langCode];
      }
      let result = [];
      Object.keys(nlDataStructure.sheets.content.tables).forEach(function (
        tableKey
      ) {
        let table = nlDataStructure.sheets.content.tables[tableKey];
        Object.keys(table.columns).forEach(function (columnKey) {
          if (columnKey == "columnName" && table.data[langCode]) {
            table.data[langCode].forEach(function (row) {
              let formatting = "text";

              if (tableKey == "taxa") {
                formatting = "checklist-taxon"; //can have .name and .authority
              }
              else if (tableKey == "media") {
                formatting = "media"; //can have .source and .title
              }
              else if (tableKey == "customDataDefinition") {
                formatting = row["formatting"] || "text"; 
              }

              if (row[columnKey] === undefined) {
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
      this._columnInfosCache[langCode] = result;
      return result;
    },

    getItem: function (tableData, itemName, langCode, defaultValue) {
      let item = tableData[langCode].find(function (row) {
        return row.item == itemName;
      });

      if (item === undefined) {
        Logger.warning(
          "In sheet <b>nl_appearance</b>, table <b>Customization</b>, could not find the option <b>" +
            itemName +
            "</b>"
        );

        return defaultValue;
      }

      let value = item.value;
      if (value === null || value === undefined) {
        return defaultValue;
      }
      return value;
    },
  },
  sheets: {
    appearance: {
      skipAutoImport: true,
      name: "nl_appearance",
      description:
        "This sheet allows you to configure the appearance of the data from the checklist sheet in the app.",
      type: "meta",
      tables: {
        supportedLanguages: {
          name: "Supported languages",
          description:
            'This table allows for declaration of one or more languages in which the checklist is presented. It is possible to create checklists which will display data in different languages. See the <a href="us-birds.xlsx">Birds of the US</a> sample checklist which is a bilingual English/French checklist, and scan through headers on all three sheets for column names ending with ":fr" (French version) or ":en" (default, English version). Once you have declared your language codes and names you wish to use (en / English and fr / French in the sample), you can append ":" and langauge code (e.g. ":fr") to columns which are allowed to be multilingual to mark them to be used for a specific language version of the checklist.\nYou have to define at least one language for your checklist.',
          columns: {
            code: {
              name: "Code",
              description:
                "Code of the language. The language on the first line is treated as the default language. Any column which has no language mention (:code) appended is treated as this default language.",
              integrity: {
                description:
                  'The value should be a two-letter language code following ISO 639-1 in lowercase, see <a href="https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes">Wikipedia</a>',
                allowDuplicates: "no",
                allowEmpty: false,
                allowedContent: "any",
                supportsMultilingual: false,
              },
            },
            name: {
              name: "Name of language",
              description:
                "Name of the language, which will be displayed in the main app menu language switch.",
              integrity: {
                description:
                  "Language name, preferably in that language, e.g. English, Français, Česky, ...",
                allowDuplicates: "no",
                allowEmpty: false,
                allowedContent: "any",
                supportsMultilingual: false,
              },
            },
            fallback: {
              name: "Fallback language",
              description:
                'If you use a language Code of a language for which the user interface is not translated (e.g. the Inuktitut), you can specify here a code of the language which you prefer the user interface shows in (e.g. "fr" for French). Otherwise English will be used by default.',
              integrity: {
                description:
                  "Two-letter code of any of the supported user interface language codes.",
                allowDuplicates: "yes",
                allowEmpty: true,
                allowedContent: "any",
                supportsMultilingual: false,
              },
            },
          },
        },
        customization: {
          name: "Customization",
          description:
            "This table allows for customization of some elements of the checklist. The entries in the column Item are fixed, you can change the value of cells in the column Value. This column can be multilingual, so if you have more than one language, say a bi-lingual English-French checklist, you can change the header to Value:en and add immediately to the right a new column with the header Value:fr",
          columns: {
            item: {
              name: "Item",
              description:
                "This column is pre-filled with a set of items defining certain behaviors of your checklist.",
              integrity: {
                description: "",
                allowDuplicates: "no",
                allowEmpty: false,
                allowedContent: "list",
                listItems: [
                  "Color theme hue",
                  "Checklist name",
                  "About section",
                  "How to cite",
                  "Name of checklist data sheet",
                  "Checklist data headers row",
                  "Date format",
                  "Use citations",
                  "Precached image max size",
                  "Stacking circles depth",
                ],
                supportsMultilingual: false,
              },
            },
            value: {
              name: "Value",
              description:
                "Define the values for each of the items here. As this column is multilingual, you can have sevaral Value colums in this table (e.g. Value:en, Value:es and Value:fr side by side if you defined English, Spanish and French as languages of your checklist).",
              integrity: {
                description:
                  "<ul><li><b>Color theme hue</b>: a number from 0 to 360 representing a hue of the color theme of the app. The default deep blue hue is 212. If you want to pick your own, find the hue with an online tool like <a href=\"https://hslpicker.com\">hslpicker.com</a> (use the value of the topmost slider). You can visually separate different language mutations of your checklist (if you make a multilingual one) by assigning different hues to different translations</li><li><b>Checklist name</b>: A short name which will appear in the header of the checklist app. E.g. Vascular flora of Vanuatu</li><li><b>About section</b>: a free-form text which will appear in the About section in the checklist menu. You can write there a short description of the checklist, contacts to its author or any other information. You can use <a href=\"#g-md\">Markdown<a/> to format your text including different heading levels, links, images (in folder 'usercontent' or hosted elsewhere), lists or other. If your text is more complex, you may wish to insert an F-directive instead. The content of the cell would be 'F:about.md' where the file 'about.md' is uploaded to the folder 'usercontent'. You can see the documentation on F-directive for more information</li><li><b>Name of checklist data sheet</b>: name of the sheet which contains the checklist data. By default this is called \"checklist\", but you can modify that if you need the sheet be called otherwise</li><li><b>Checklist data headers row</b>: By default the headers row is on line 1, but in case your data are designed otherwise and the checklist data headers are on any other row (e.g. headers are on row 2 because row 1 is occupied by supplementary infor for curators or any other data), put the row number here.</li><li><b>Date format</b>: If you dates in your checklist data sheet, you can determine here how the date will be shown in your checklist. Available formats, see: <a href=\"https://day.js.org/docs/en/display/format\">day.js.org</a>. You can define different formats for different language mutations (e.g. if you have English (en) and French (fr) defined as the checklist languages, you can have in the column Value:en a value MMM D, YYYY while the column Value:fr can have the more common French format YYYY/MM/DD). By default or if left empty the format is YYYY-MM-DD.</li><li><b>Use citations</b>: If set to 'apa' or 'harvard', NaturaList will read BibTeX entries from the Bibliography table in the nl_appearance sheet. Add one complete BibTeX entry per row in the Bibliography table to enable @-notation references throughout your checklist. The references will also be displayed on the References page. Leave empty if you don't want to use the bibliography function.</li></ul>",
                allowDuplicates: "yes",
                allowEmpty: true,
                allowedContent: "any",
                supportsMultilingual: true,
              },
            },
          },
          data: [],
        },
        dataCodes: {
          name: "Data codes",
          description: "",
          columns: {
            columnName: {
              name: "Column name",
              description: "",
              integrity: {
                description:
                  "XXXXX Each of the values need its separate line, so if you have badges for a Status column with 3 possible values (say Native, Endemic and Introduced), you will need three lines, one for each value but all with the same Column name 'Status'.",
                allowEmpty: false,
                allowDuplicates: "yes",
                allowedContent: "dataPath",
                supportsMultilingual: false,
              },
            },
            code: {
              name: "Code",
              description: "",
              integrity: {
                description: "",
                allowEmpty: false,
                allowDuplicates: "yes",
                allowedContent: "any",
                supportsMultilingual: false,
              },
            },
            replacement: {
              name: "Replacement",
              description: "",
              integrity: {
                description: "",
                allowEmpty: false,
                allowDuplicates: "yes",
                allowedContent: "any",
                supportsMultilingual: true,
              },
            },
          },
          data: [],
        },
        badges: {
          name: "Colored badges",
          description:
            "If your checklist contains small sets of categorical data (e.g. Red List codes, status like Native, Introduced, Endemic, ...), you can make them visually stand out by transforming them into a colored 'badge'. The columns from the checklist sheet whose data will be presented as badges and the color of the individual values are defined in this table.\nThis table can be left completely empty, if you do not need to display colored badges.",
          columns: {
            columnName: {
              name: "Column name",
              description:
                "One of the columns in your checklist sheet whose values you wish to convert into badges. In the Birds of the US sample checklist, RedList.Code is one of the columns for which the badge is set.",
              integrity: {
                description:
                  "Each of the values need its separate line, so if you have badges for a Status column with 3 possible values (say Native, Endemic and Introduced), you will need three lines, one for each value but all with the same Column name 'Status'.",
                allowEmpty: false,
                allowDuplicates: "yes",
                allowedContent: "dataPath",
                supportsMultilingual: false,
              },
            },
            containsText: {
              name: "Contains text",
              description:
                "To tell the checklist app which data should be formatted in which way, you can use this column to match different values of your data.",
              integrity: {
                description:
                  "A case-insensitive text to be matched for this badge. E.g. if you enter 'Endemic', then 'Endemic', 'near Endemic' and 'Endemic?' values will be transformed into this badge too.",
                allowEmpty: false,
                allowDuplicates: "no",
                allowedContent: "any",
                supportsMultilingual: true,
              },
            },
            backgroundColor: {
              name: "Background color",
              description:
                "Background color of the badge for the particular 'Contains text' value",
              integrity: {
                description: "",
                allowEmpty: true,
                allowDuplicates: "yes",
                defaultValue: "transparent",
                allowedContent: "cssColor",
                supportsMultilingual: false,
              },
            },
            textColor: {
              name: "Text color",
              description:
                "Text color of the badge. Make sure it is different enough from the background color in order to make it easily readable.",
              integrity: {
                description: "",
                allowEmpty: true,
                allowDuplicates: "yes",
                defaultValue: "black",
                allowedContent: "cssColor",
                supportsMultilingual: false,
              },
            },
            borderColor: {
              name: "Border color",
              description:
                "You can define a separate border color. If you wish to have a simple badge without border, you can use the same color as for the background.",
              integrity: {
                description: "",
                allowEmpty: true,
                allowDuplicates: "yes",
                defaultValue: "black",
                allowedContent: "cssColor",
                supportsMultilingual: false,
              },
            },
          },
          data: [],
        },
        mapRegionsNames: {
          name: "Map regions information",
          description:
            "<strong>NaturaList</strong> allows you to associate different kinds of maps with each taxon. If you are using maps of type 'regions' (defined on sheet <b>nl_content</b>, table <b>Maps</b>), you can define here how different regions will be colored and what legend will be displayed for them. See more on maps in the documentation of table <a href=\"#table-maps\">Maps</a>.\nThis table can be left completely empty, if you do not need use region maps.",
          columns: {
            code: {
              name: "Region code",
              description:
                "On each line a suffix of map regions to be matched against.",
              integrity: {
                description:
                  "Single or several characters representing a region suffix. E.g. on the map of the world, 'ca:x' (arbitrary suffix 'x' we may chose to mark present taxa) could represent the taxon is native to Canada, while 'ca:i' could represent 'Introduced' and 'ca:e' could represent the taxon is endemic to Canada. In this case, three rows would be used, the first with suffix 'x', the second with suffix 'i' and the third with suffix value 'e'.",
                allowEmpty: true,
                allowDuplicates: "no",
                defaultValue: "",
                allowedContent: "regex",
                regex: "[a-z]+",
                regexExplanation: "only lowercase letters a-z",
                supportsMultilingual: false,
              },
            },
            name: {
              name: "Region name",
              description:
                "The fill color applied to the matching region and to its legend element.",
              integrity: {
                description: "",
                allowEmpty: false,
                allowDuplicates: "yes",
                allowedContent: "any",
                supportsMultilingual: false,
              },
            },
          },
        },
        mapRegionsLegend: {
          name: "Map regions legend",
          description:
            "<strong>NaturaList</strong> allows you to associate different kinds of maps with each taxon. If you are using maps of type 'regions' (defined on sheet <b>nl_content</b>, table <b>Maps</b>), you can define here how different regions will be colored and what legend will be displayed for them. See more on maps in the documentation of table <a href=\"#table-maps\">Maps</a>.\nThis table can be left completely empty, if you do not need use region maps.",
          columns: {
            suffix: {
              name: "Suffix",
              description:
                "On each line a suffix of map regions to be matched against.",
              integrity: {
                description:
                  "Single or several characters representing a region suffix. E.g. on the map of the world, 'ca:x' (arbitrary suffix 'x' we may chose to mark present taxa) could represent the taxon is native to Canada, while 'ca:i' could represent 'Introduced' and 'ca:e' could represent the taxon is endemic to Canada. In this case, three rows would be used, the first with suffix 'x', the second with suffix 'i' and the third with suffix value 'e'.",
                allowEmpty: true,
                allowDuplicates: "no",
                defaultValue: "",
                allowedContent: "any",
                supportsMultilingual: false,
              },
            },
            fillColor: {
              name: "Fill color",
              description:
                "The fill color applied to the matching region and to its legend element.",
              integrity: {
                description: "",
                allowEmpty: false,
                allowDuplicates: "no",
                allowedContent: "cssColor",
                supportsMultilingual: false,
              },
            },
            legend: {
              name: "Legend",
              description:
                "The content of this column will serve as the text for the legend for the matching suffix. As this column is multilingual, you na create several columns e.g. Legend:en and Legend:fr to represent the English and French translations of the legend.",
              integrity: {
                description:
                  "A single word or a short text to appear in the legend.",
                allowEmpty: false,
                allowDuplicates: "no",
                allowedContent: "any",
                supportsMultilingual: true,
              },
            },
            appendedLegend: {
              name: "Appended legend",
              description:
                "The content of this column will appended directly after the 'Title' field of subitems if you chose the 'map regions' content type in 'Custom data definition'. Field supports markdown.",
              integrity: {
                description: "Any text",
                allowEmpty: true,
                allowDuplicates: "yes",
                allowedContent: "any",
                supportsMultilingual: true,
              },
            },
          },
        },
        searchOrder: {
          name: "Search category custom order",
          description:
            "When you assign a 'Search category title' to a checklist data column (see the documentation of table <a href=\"#table-customDataDefinition\">Custom data definiton</a> under 'Search category title' column), the content of that data column is used to show a filter to search through it. By default the content of the filter is ordered alphabetically and this will likely work best in most cases. However, if you need the items to appear in the filter in a custom order, you can use this table to define it. A sample use case could be the Red List category, where it is less useful to have the categories appear in alphabetical order (i.e. Critically endangered first, followed by Endangered, Extinct in the wild, etc.). Instead, you may wish this filter to appear in order of threat severity from the highest to the least. Another use case could concern the topmost taxonomic category in a botanical checklist, where there could be e.g. Lycophytes, Ferns, Gymnosperms, Monocots and Dicots and instead of showing them alphabetically ordered in the checklist, one could order them in a way to put the most prominent categories at the top. See the sample <a href=\"us-birds.xlsx\">Birds of the US</a> checklist for an example of custom ordering of columns 'redlist.name' and 'presence'. Items will be presented in the filter in the order in which they appear in this table. Any item that was not included in the table will be rendered at the end of the list in alphabetical order.\nThis table can be left completely empty, if you do not need custom order in your filters.",
          columns: {
            columnName: {
              name: "Column name",
              description:
                "The name of the column from the checklist data which you want to present in the filter in a custom order.",
              integrity: {
                description:
                  "Existing checklist data sheet column name. The column has to have the 'Search category title' set in <a href=\"#table-customDataDefinition\">Custom data definiton</a> table.",
                allowEmpty: false,
                allowDuplicates: "yes",
                allowedContent: "dataPath",
                supportsMultilingual: false,
              },
            },
            groupTitle: {
              name: "Group title",
              description:
                "When displayed in a filter, values from 'Values ordered' with the same group title will be displayed together and can be ticked and unticked together. This is useful when you have several similar filter values that one would often use together - e.g. have taxa with status Endemic, Near endemic, Endemic? can all go under the same title Endemites and get displayed and ticekd/unticked together when one clicks on the group. Grouped values still can be ticked and unticked individually.",
              integrity: {
                allowEmpty: true,
                description: "Title of the group",
                allowDuplicates: "yes",
                allowedContent: "any",
                supportsMultilingual: true,
              },
            },
            value: {
              name: "Values ordered",
              description:
                "Values from the given column, one per row in the order in which they should appear in the filter. As this column is multilingual, you can impose here custom ordering for different language mutations",
              integrity: {
                allowEmpty: false,
                description: "Any value from the given column.",
                allowDuplicates: "no",
                allowedContent: "any",
                supportsMultilingual: true,
              },
            },
          },
          data: [],
        },
      },
    },
    content: {
      name: "nl_content",
      description:
        "This sheet allows you to tell <strong>NaturaList</strong> the meaning of each column in the checklist sheet. In the minimalistic <a href=\"blank-naturalist-spreadsheet.xlsx\">blank checklist</a> example, on the 'checklist' data sheet you can see columns with column names 'ORD', 'FAM', 'Habit', 'RedList', etc. It is the <strong>nl_content</strong> sheet which tells the app that the column <b>ORD</b> is in fact a taxon level which should be called Order (you can find it in the table <b>Taxa definition</b> ... note that <strong>NaturaList</strong> doesn't require you to adhere to any particular taxonomic units, you are free to use informal or folk units if that is needed in your project). Then you can see that the <b>RedList</b> column is a 'custom data' column and the table <b>Custom data definition</b> on the <b>nl_content</b> sheet says that the title of that data is 'Red list category' and it should be placed in the middle column on the checklist.\nBrowse the documentation of each of the<b>nl_content</b> sheet tables below for information about their use. Each table represents a different type of data - taxa are defined in the <bTaxa definition</b> table, custom data ssociated with each taxon are defined in the <b>Custom data definition</b> table and so on.\nAll columns from the checklist sheet which you want to be displayed in the checklist must appear in one of the tables on this sheet. Checklist sheet columns not references in any of the tables here may still be kept in the sheet, but won't affect the checklist data (you can use those extra columns for your personal notes or as helper columns).\nThis table can be left completely empty, if you do not wish to display any accompanying data in your checklist and wish to display only a tree of taxa.",
      type: "meta",
      tables: {
        taxa: {
          name: "Taxa definition",
          description:
            "In this table you define your taxonomic units hierarchy. The first row is the highest taxonomic rank and the last row represents the leaves of your taxonomic tree. You have a complete freedom in what units you chose. You can use formal or informal taxonomic units as long as it suits your project. Note that you need to have at least one taxonomy level defined here for the checklist to show anything at all.",
          columns: {
            columnName: {
              name: "Column name",
              description:
                "This tells the app which column in the checklist sheet contains the taxon name for this level. The column name can be just about anything that makes sense to you, the name under which the taxon will be displayed is set in the <b>Taxon name</b> column. Note that by default all the taxa columns are treated as 'taxon' type, so if you define in this table a taxon with column name <b>genus</b>, in your checklist spreadsheet you can have a simple column called 'genus' with all the genera names if you don't need to display the genus authority, or else you can have two columns, one being <b>genus.name</b>, where the name itself of the genus goes (e.g. Schefflera), and besides you can have column <b>genus.authority</b>, into which you can fill the appropriate taxonomic authority (e.g. J.R.Forst. & G.Forst.).",
              integrity: {
                description:
                  "Column name containing the taxon name, e.g. 'Regnum', 'Kingdom', 'MajorGroup' ...",
                allowDuplicates: "no",
                allowedContent: "columnName",
                allowEmpty: false,
                supportsMultilingual: false,
              },
            },
            taxonName: {
              name: "Taxon name",
              description:
                "This is the name under wich this taxon level will appear in the checklist app. This column is multilingual, so you can specify translated names of your taxon units for each language.",
              integrity: {
                description:
                  "Human-readable name you wish to show for this taxon unit.",
                allowDuplicates: "no",
                allowedContent: "any",
                allowEmpty: false,
                supportsMultilingual: true,
              },
            },
            orderBy: {
              name: "Order by",
              description:
                "By default, each level of the checklist is ordered alphabetically when displayed. If this is alright for you, you can leave this cell empty. If you need to display certain taxon level in the order it is ketp in your checklist spreadsheet (e.g. you want to show your topmost taxonomic units in order Ferns, Bryophytes, Dicots as it ordered in your checklist sheet, instead of the alphabetical Bryophytes, then Diconts and finally Ferns), you can fill 'as is' to the appropriate row here.",
              integrity: {
                description: "",
                allowEmpty: true,
                allowDuplicates: "yes",
                defaultValue: "alphabet",
                allowedContent: "list",
                listItems: ["as is", "alphabet", ""],
                supportsMultilingual: false,
              },
            },
            parentTaxonIndication: {
              name: "Parent taxon indication",
              description:
                "By default, each taxon is followed by the name of parent taxon in paranthesis.This is useful to e.g. show the family of lower taxa in a longer list. In some instances this behavior is not needed as the parent taxon is self evident. For example for the species full scientific name the genus is already part of the name so the genus doesn't need to be shown alongside in paranthesis as the parent taxon. Leave the cell empty for a particular taxon if you want to show the name of the immediate parent taxon in paranthesis. Enter 'none' if you want to hide the indication of the parent taxon for that particular taxon. If you wish to show the name of a parent taxon higher up the tree, enter the column name for the corresponding taxon. This may be useful if you have e.g. family, genus and species levels and you want to show the family name by each species; in this case you would insert 'family' in the species row.",
              integrity: {
                description: "",
                allowEmpty: true,
                allowDuplicates: "yes",
                defaultValue: "",
                allowedContent: "any",
                supportsMultilingual: false,
              },
            },
            italicize: {
              name: "Italicize",
              description: "Define whether this taxon should be italicized.",
              integrity: {
                description: "",
                allowEmpty: true,
                allowDuplicates: "yes",
                defaultValue: "",
                allowedContent: "list",
                listItems: ["yes", "no", ""],
                supportsMultilingual: false,
              },
            },
          },
          data: [],
        },
        customDataDefinition: {
          name: "Custom data definition",
          description:
            'Typically you will want to show some additional data next to each taxon in your checklist. This is the place where you tie different data columns of the checklist spreadsheet to how <strong>NaturaList</strong> should handle or display them.\nRead about the <a href="#g-datapath">data path</a> concept to see how you can represent complex data like arrays (multiple items of the same type, like assigning several habitat types to a taxon) or structured data (like publication information with year, name and link to the publication) by using simple spreadsheet columns.',
          columns: {
            columnName: {
              name: "Column name",
              description:
                "The name of the column (in generalized 'data path' format) to which the particular row is relating.",
              integrity: {
                description:
                  'An existing column name from the checklist sheet. If you have data in complex data paths, such as having a list of habits in the checklist sheet in columns like habit1, habit2, habit3, then you need to provide all levels of the data path, one per row. You will thus need a row with Column name <b>habit</b> and on the next row Column name <b>habit#</b> which stands for each of the habit1, habit2, ... columns. Nested data, such as the <b>origPub</b> (data holding the original publication) in the <a href="us-birds.xlsx">Birds of the US</a> sample checklist, where there are several sub-items to the origPub - origPub.author (column holding the publication author), origPub.year (column holding the year of the publication) etc. follow the same rule as you can see in the sample spreadsheet.',
                allowEmpty: false,
                allowDuplicates: "no",
                allowedContent: "dataPath",
                supportsMultilingual: false,
              },
            },
            title: {
              name: "Title",
              description:
                "The title of the data item you want to show in front of the data.",
              integrity: {
                description:
                  "You can enter any title (multilingual content is supported, so you can have columns Title:en, Title:fr etc.) or leave this blank if you want no title to be displayed. This is useful when using nested data, such as the <b>habitat</b> in the <a href=\"us-birds.xlsx\">Birds of the US</a>, where the data item 'habitat' gets its title (Habitat), but each of the habitat values in the array (row Habitat#) get no title, so each of the habitat values are displayed plainly.",
                allowEmpty: true,
                allowDuplicates: "yes",
                defaultValue: "",
                allowedContent: "any",
                supportsMultilingual: true,
              },
            },
            searchCategoryTitle: {
              name: "Search category title",
              description:
                "If you wish to display a filter for values of this column, enter here a title for the filter button.",
              integrity: {
                description:
                  "Any short descriptive text that will serve as the filter button title.",
                allowEmpty: true,
                allowDuplicates: "empty-only",
                defaultValue: "",
                allowedContent: "any",
                supportsMultilingual: true,
              },
            },
            subitemsSeparator: {
              name: "Subitems separator",
              description:
                'If the column has subitems (e.g. the <b>habitat</b> column, which has an array of subitems <b>habitat#</b>, or the <b>origPub</b>, which has subitems <b>origPub.author</b>, <b>origPub.year</b> in the <a href="us-birds.xlsx">Birds of the US</a> sample), you can here define the way the subitems will be rendered in the checklist.',
              integrity: {
                description:
                  "Several special values are recognized: <ul><li><b>bullet list:</b> all the subitems will be rendered in a bullet list</li><li><b>numbered list:</b> all the subitems will be rendered in a numbered list starting with 1</li><li><b>unmarked list:</b> all the subitems will be rendered in a list without any marking</li><li><b>space:</b> items won't form a list, but will follow each other on one line, there will be a single space between each item</li><li><b>comma:</b> items won't form a list, but will follow each other on one line, there will be a comma and a space between each item</li><li>any other value (one or multiple characters): items won't form a list, but will follow each other on one line, there will be the given character(s) between each item, technically using the special value 'comma' or directly writing ', ' here are equivalent</li></ul>",
                allowEmpty: true,
                allowDuplicates: "yes",
                defaultValue: "",
                allowedContent: "any",
                supportsMultilingual: false,
              },
            },
            formatting: {
              name: "Formatting",
              description:
                "Most of the data in the checklist sheet data columns will probably be plain text. However, if a particular column contains a taxon name, image, map region, number or another type of data, you can specify it here. It will have impact on how the data are shown (e.g. <b>taxon</b> type will be rendered as a clickable taxon name, or <b>number</b> type will enable a special numeric filter if you use that column as a filter category)",
              integrity: {
                description:
                  "Several values are possible: <ul><li><b>text:</b> (or just empty cell) means the content of this data column in the checklist sheet is treated as a normal text. If 'Search category title' is set, it will be displayed with a text filter button.</li><li><b>number:</b> means the content of this data column in the checklist sheet is treated as a number (integer or decimal, you need to ensure the column contains only properly formatted numbers in your checklist sheet). If 'Search category title' is set, it will be displayed with a numeric filter button.</li><li><b>taxon:</b> instructs the checklist app to render the column as a clickable taxon. Note that if the column is called e.g. 'basionym', then the checklist sheet may contain just that column, or can actually contain columns <b>basionym.name</b> and <b>basionym.authority</b> where you fill the appropriate data.</li><li><b>date:</b> if you enter a properly formatted date in your spreadsheet to this column, it will be parsed and formatted according to the format you defined on the <b>nl_appearance</b> sheet in the <a href=\"#table-customization\">Customization</a> table under the <b>Date format</b> item.</li></ul>",
                allowEmpty: true,
                defaultValue: "text",
                allowDuplicates: "yes",
                allowedContent: "list",
                listItems: [
                  "text",
                  "number",
                  "taxon",
                  "date",
                  "map regions",
                  "map",
                  "image",
                  "sound",
                  "markdown",
                  "badge",
                  "",
                ],
                supportsMultilingual: false,
              },
            },
            template: {
              name: "Template",
              description:
                "The templating engine used by <strong>NatureList</strong> allows you to process your data using a template before displaying them. This can be as simple as entering '{{value}} cm' if you wish to append the 'cm' unit behind the value of that column, or a more complex case coupled with Markdown formatting '[{{taxon.name}}](http://datazone.birdlife.org/species/factsheet/{{value}})', where the actual value ({{value}}) of that column in the checklist sheet is taken as a part of the web adress, which is displayed as a link with the taxon name ({{taxon.name}}) as link title. See the glossary entry <a href=\"#g-template\">template</a> for complete documentation.",
              integrity: {
                description:
                  "Empty, if not needing a template, or a custom template.",
                allowEmpty: true,
                defaultValue: "",
                allowDuplicates: "yes",
                allowedContent: "any",
                supportsMultilingual: true,
              },
            },
            placement: {
              name: "Placement",
              description:
                "Each piece of data can be displayed in several places on a grid just below the taxon it is associated with. For longer texts you can chose the 'top' or the 'bottom' row placement, while shorter data items can be more conveniently distributed in the 'left', 'right' or 'middle' column of the row in between. See the <a href=\"us-birds.xlsx\">Birds of the US</a> sample checklist for examples.",
              integrity: {
                description: "",
                allowEmpty: true,
                allowDuplicates: "yes",
                defaultValue: "top",
                allowedContent: "list",
                listItems: ["top", "bottom", "left", "middle", "right", "details", "top|details", "bottom|details", "left|details", "middle|details", "right|details", ""],
                supportsMultilingual: false,
              },
            },
            hidden: {
              name: "Hidden",
              description:
                "You can use this column to show or hide data conditionally. For example you can only display data about the organisms status in a particular country if that country is selected in the filter. Others of your columns in the checklist sheet may contain data, which you do not want to display directly, but which you nonetheless reference e.g. through a template of another column. You can use this column to make sure your data are loaded, but are kept hidden.",
              integrity: {
                description:
                  "Leave empty or enter 'no' to keep the data displayed. Enter 'yes' to hide the data (they will still be available for you to use e.g. in templates). Enter 'data' to hide this only from data display but allow display as a filter. Use a conditional expression to show or hide the data based on the value of a filter. The syntax looks like (in this example <b>incountry</b> is a column name acting as a filter): <ul><li><b>if incountry notset</b> will hide the data if the <i>incountry</i> filter is not set to any value</li><li><b>unless incountry isset</b> will hide the data unless the <i>incountry</i> filter is set to whichever value</li><li><b>unless incountry is \"Czechia\", \"Vanuatu\"</b> will hide the data unless the <i>incountry</i> filter has either Czechia or Vanuatu (or both) values selected</li><li><b>unless incountry notsetor \"Czechia\"</b> will hide the data unless the <i>incountry</i> filter is either empty or has Czechia among selected values</li><li>you can combine the [if|unless], [isset|notset|notsetor|is|] keywords in similar manner to achieve the desired behavior; actual filter values must always be enclosed in double quotes and, if several, separated by a comma</li></ul>",
                allowEmpty: true,
                allowDuplicates: "yes",
                allowedContent: "any",
                defaultValue: "no",
                supportsMultilingual: false,
              },
            },
          },
          data: [],
        },
                searchOnline: {
          name: "Search online",
          description:
            "When you click on any taxon in the checklist app, a 'Details' pane opens with the taxon details. If you fill this table, you can display a series of links to search engines of herbaria, collections, encyclopedia or other where the taxon may be found through a template URL adress. You can find some exemples in the <a href=\"us-birds.xlsx\">Birds of the US</a> sample checklist.\nThis table can be left completely empty, if you do not want to provide users means to search the taxa in external search engines. This being said, adding appropriate search engines will help users find relevant information about the taxa you present (e.g. digitalized specimens, if you provide a link to a muzeum or herbarium collection).",
          columns: {
            title: {
              name: "Title",
              description:
                "The title of the link to the search engine you wish to display. As this column is multilingual, you can have different titles for different language mutations (e.g. 'Google Image Search' in English version column Title:en and 'Recherche des images Google' in the French column Title:fr).",
              integrity: {
                description: "A short title describing the search engine.",
                allowEmpty: false,
                allowDuplicates: "no",
                allowedContent: "any",
                supportsMultilingual: true,
              },
            },
            icon: {
              name: "Icon",
              description:
                "For each search engine, you should prepare an icon to be displayed with the link. The icon should represent visually the search engine (e.g. use its logo) and preferably be square (200px width/height should be enough) and have white or transparent background. The icon must be put into the 'usercontent' folder, inside the 'online_search_icons' subfolder.",
              integrity: {
                description:
                  "Name of the image including the extension (e.g. google.png)",
                allowEmpty: false,
                allowDuplicates: "yes",
                allowedContent: "filename",
                allowedExtensions: [".jpg", ".png", "webp", ".svg"],
                supportsMultilingual: true,
              },
            },
            searchUrlTemplate: {
              name: "Search URL template",
              description:
                "Here you define to which web (URL) your users will be directed when clicking on the search engine link. For example, if you want to allow them to display images of the given taxon on Google Image Search, you can first search for an arbitrary taxon on Google Image Search ... e.g. Turdus merula. Then you can copy the results address (which will look something like <i>https://www.google.com/search?q=Turdus%20merula&tbm=isch &sxsrf=As5e5fwef5wwHOw:1673525622390 &source=lnms&sa=X...</i> with a lot of other unnecessary parameters), remove the unneeded URL parameters and replace the search string (Turdus merula) by a template designating the taxon name ... getting at the end https://www.google.com/search?q={{taxon.name}}&tbm=isch which is the URL you can copy-paste into the appropriate cell in this column. Some search engines of online museum collections or herbaria might by a bit more fiddly, but in general one can create templated search URLs for nearly all search engines.",
              integrity: {
                description:
                  'A URL of the desired search engine where URL parameters which determine the search are replaced by the template {{ taxon.name }} (or any other necessary, see <a href="#g-template">template</a> for all template options).',
                allowEmpty: false,
                allowDuplicates: "no",
                allowedContent: "url",
                supportsMultilingual: true,
              },
            },
            restrictToTaxon: {
              name: "Restrict to taxon",
              description:
                "Sometimes you may enter online databases which are only pertinent to a specific group of organisms in your checklist. If you only wish to show the corresponding search when a particular taxon or its descendant is selected, enter the name of the taxon here. E.g. on a checklist of vertebrates you may have a search URL to an online database of mammals; then you would enter <i>Mammalia</i> into this cell (provided you have such a taxon in your checklist) and only taxa which are descendent of <i>Mammalia</i> will have this search button shown. Leave empty if you wish to make the corresponding search available to any taxa. If needed you can supply a comma-separated list of taxa. E.g. 'Aceropyga, Baeturia' will make the search engine appear only if the selected taxon is whithin either of the two genera.",
              integrity: {
                description:
                  "A name of taxon (excluding the authority). The field is case insensitive (e.g. enter Mammalia or mammalia to the same effect)",
                allowEmpty: true,
                allowDuplicates: "yes",
                allowedContent: "any",
                supportsMultilingual: false,
              },
            },
          },
          data: [],
        },
        bibliography: {
          name: "Bibliography",
          description:
            "BibTeX citations for @-notation references. Each row contains one complete BibTeX entry. Copy entries directly from reference managers.",
          columns: {
            bibtex: {
              name: "BibTeX entries",
              description: "Complete BibTeX entry",
              integrity: {
                allowEmpty: false,
                allowDuplicates: "yes",
                allowedContent: "any",
                supportsMultilingual: false,
              },
            },
          },
          data: [],
        },
      },
    },
    checklist: {
      name: "checklist",
      type: "data",
      data: [],
    },
  },
};

import { lab, text } from "d3";

export const OCCURRENCE_IDENTIFIER = "occurrence";

export const ANALYTICAL_INTENT_TAXA = "T";
export const ANALYTICAL_INTENT_OCCURRENCE = "S";

export const nlDataStructureSheets = {
    content: {
        name: "nl_content",
        required: true,
        description: "The `nl_content` sheet tells the app what each column in your [[ref:data]] sheet represents. All columns from the [[ref:data]] sheet that you want to display must appear either in [[ref:content.taxa]] (for taxa columns) or in [[ref:content.customDataDefinition]] (for your additional data). Columns not referenced here are silently ignored and can serve as helper or curator-notes columns.",
        notes: [
            {
                type: "tip",
                title: "Start with the taxonomy",
                text: "Start with the **Taxa definition** table alone to confirm your taxonomy tree renders correctly, then add custom data, filters, and advanced features iteratively."
            },
        ],
        type: "meta",
        tables: {
            taxa: {
                name: "Taxa definition",
                required: true,
                description: "Declares the taxonomic hierarchy. The order of rows defines the tree structure: the first row is the highest rank, the last row is the leaf level. You have complete freedom in what units you choose - formal Linnaean ranks, informal categories, or folk taxa are all valid. At least one row is required.",
                notes: [
                    {
                        type: "warning",
                        title: "Occurrence records",
                        text: "If you use occurrence records, the taxon level whose **Taxon name** is exactly `Occurrence` (case insensitive) must be the **last row** in this table, below all other ranks. See [Occurrence and Collection Mode](/author-guide/occurrence-collection-mode)."
                    }
                ],
                columns: {
                    columnName: {
                        name: "Column name",
                        description: "The header of the [[ref:data]] sheet column that holds taxon names for this rank. Must match a column header in the [[ref:data]] sheet (case-insensitive). In the [[ref:data]] sheet the column can be plain (`genus`) or split into `genus.name` and `genus.authority` columns to store the authority separately.",
                        howToUse: "Use the plain column name here. In the [[ref:data]] sheet, follow the way [[ref:type.taxon]] data are entered.",
                        notes: [],
                        examples: [
                            {
                                label: "Four-rank hierarchy",
                                text: "If needed, you could have `.authority` for the `class` and `family` too, or ommit it in the `genus`.\n\nIn your [[ref:content.taxa]] sheet:",
                                fillRight: true,
                                columns: [
                                    "Column name"
                                ],
                                rows: [
                                    [
                                        "class"
                                    ],
                                    [
                                        "family"
                                    ],
                                    [
                                        "genus"
                                    ],
                                    [
                                        "species"
                                    ]
                                ]
                            },
                            {
                                label: "",
                                text: "In your [[ref:data]] sheet:",
                                fillRight: true,
                                columns: [
                                    "class", "family", "genus.name", "genus.authority", "species.name", "species.authority"
                                ],
                                rows: [
                                    ["Magnoliopsida", "Rosaceae", "Rosa", "L.", "Rosa canina", "L."],
                                    ["Magnoliopsida", "	Magnoliaceae", "Magnolia", "Herb.", "Magnolia liliifera", "(L.) Baill."],
                                    ["Liliopsida", "Poaceae", "Triticum", "L.", "Triticum aestivum", "L."]
                                ]
                            }
                        ],
                        integrity: {
                            description: "e.g. `Regnum`, `Kingdom`, `MajorGroup`",
                            allowDuplicates: "no",
                            allowedContent: "columnName",
                            allowEmpty: false,
                            supportsMultilingual: false
                        }
                    },
                    taxonName: {
                        name: "Taxon name",
                        description: "The human-readable rank label shown in the app UI (e.g. `Family`, `Řád`, `Tribu`). This is what users see as the rank heading.",
                        howToUse: "For multilingual projects, add `Taxon name:en`, `Taxon name:fr`, etc. columns to provide translated rank labels per language. `Occurrence` is a keyword value and needs to be entered as-is, not translated.",
                        notes: [
                            {
                                type: "warning",
                                text: "The special value `Occurrence` (case-insensitive) activates collection mode for that rank level. See [Occurrence and Collection Mode](/author-guide/occurrence-collection-mode)."
                            }
                        ],
                        examples: [
                            {
                                label: "Bilingual rank labels with an occurrence rank",
                                text: "Suppose in your [[ref:appearance.supportedLanguages]] table you have entries for English (`en`) and French (`fr`).\n\nIn your [[ref:content.taxa]] table:",
                                fillRight: true,
                                columns: [
                                    "Column name",
                                    "Taxon name:en",
                                    "Taxon name:fr"
                                ],
                                rows: [
                                    [
                                        "family",
                                        "Family",
                                        "Famille"
                                    ],
                                    [
                                        "species",
                                        "Species",
                                        "Espèce"
                                    ],
                                    [
                                        "catalogId",
                                        "Occurrence",
                                        "Occurrence"
                                    ]
                                ]
                            },
                            {
                                label: "",
                                text: "In your [[ref:data]] sheet:",
                                fillRight: true,
                                columns: [
                                    "family", "species.name", "species.authority", "catalogId"
                                ],
                                rows: [
                                    ["Rosaceae", "Rosa canina", "L.", "NHM-2645"],
                                    ["Rosaceae", "Rubus idaeus", "L.", "NHM-67890"],
                                    ["Poaceae", "Triticum aestivum", "L.", "NHM-54321"]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowDuplicates: "no",
                            allowedContent: "any",
                            allowEmpty: false,
                            supportsMultilingual: true
                        }
                    },
                    orderBy: {
                        name: "Order by",
                        description: "Controls how taxa at this level are sorted in the tree. `alphabet` (the default) sorts alphabetically. `as is` preserves the row order from the [[ref:data]] sheet - useful for a non-alphabetical display sequence.",
                        howToUse: "Leave empty for the vast majority of cases to get the default alphabetical sorting. Use `as is` only for the topmost rank, if it is ordered in your [[ref:data]] sheet in a meaningful sequence that alphabetical sorting would destroy (e.g. Ferns → Bryophytes → Dicots).",
                        notes: [],
                        examples: [
                            {
                                label: "Preserving custom order for the top rank",
                                text: "Suppose you have a simple three-rank hierarchy of major groups → families → species, and you want to preserve a specific order of the major groups that is not alphabetical.\n\nIn your [[ref:content.taxa]] sheet:",
                                fillRight: true,
                                columns: [
                                    "Column name",
                                    "Taxon name",
                                    "Order by"
                                ],
                                rows: [
                                    [
                                        "majorGroup",
                                        "Group",
                                        "as is"
                                    ],
                                    [
                                        "family",
                                        "Family",
                                        ""
                                    ],
                                    [
                                        "species",
                                        "Species",
                                        ""
                                    ]
                                ]
                            },
                            {
                                label: "",
                                text: "Data as they are entered in your [[ref:data]] sheet:",
                                fillRight: true,
                                columns: [
                                    "majorGroup",
                                    "family",
                                    "species"
                                ],
                                rows: [
                                    ["Ferns", "Polypodiaceae", "Polypodium vulgare"],
                                    ["Ferns", "Polypodiaceae", "Drynaria heracleum"],
                                    ["Ferns", "Aspleniaceae", "Asplenium trichomanes"],
                                    ["Bryophytes", "Sphagnaceae", "Sphagnum magellanicum"],
                                    ["Bryophytes", "Pleuroziaceae", "Pleurozia purpurea"],
                                    ["Dicots", "Rosaceae", "Rosa canina"],
                                    ["Dicots", "Apiaceae", "Anthriscus sylvestris"]
                                ]
                            },
                            {
                                label: "",
                                text: "... will get displayed in this order when compiled (note the top-level groups order preserved, but families and species are alphabetical):",
                                preformatted: `

┌── Ferns
│   ├── Aspleniaceae
│   │   └── Asplenium trichomanes
│   └── Polypodiaceae
│       ├── Drynaria heracleum
│       └── Polypodium vulgare
├── Bryophytes
│   ├── Pleuroziaceae
│   │   └── Pleurozia purpurea
│   └── Sphagnaceae
│       └── Sphagnum magellanicum
└── Dicots
    ├── Apiaceae
    │   └── Anthriscus sylvestris
    └── Rosaceae
        └── Rosa canina
`,
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            defaultValue: "alphabet",
                            allowedContent: "list",
                            listItems: [
                                "as is",
                                "alphabet",
                                ""
                            ],
                            supportsMultilingual: false
                        }
                    },
                    parentTaxonIndication: {
                        name: "Parent taxon indication",
                        description: "Controls what is shown in parentheses next to each taxon name in lists. Empty (default) shows the immediate parent taxon name. `none` hides the parent indication entirely - useful for species where the genus is already embedded in the full name. A column name from the taxa table (e.g. `Family`) shows that specific ancestor instead of the immediate parent.",
                        howToUse: "Set to `none` for species if the genus is part of the full species name. Set to a higher rank column name (e.g. `Family`) when you want to skip an intermediate rank in the parenthetical.",
                        notes: [
                            {
                                type: "tip",
                                title: "For occurrence records",
                                text: "Keep the Parent taxon indication column empty for the `occurrence` rank level to show the taxon to which the occurrence is identified."
                            }
                        ],
                        examples: [
                            {
                                label: "Species showing Family as parent (skipping Genus)",
                                fillRight: true,
                                columns: [
                                    "Column name",
                                    "Taxon name",
                                    "Parent taxon indication"
                                ],
                                rows: [
                                    [
                                        "cls",
                                        "Class",
                                        ""
                                    ],
                                    [
                                        "fam",
                                        "Family",
                                        ""
                                    ],
                                    [
                                        "gen",
                                        "Genus",
                                        "Family"
                                    ],
                                    [
                                        "spec",
                                        "Species",
                                        "Family"
                                    ],
                                    [
                                        "catalogId",
                                        "Occurrence",
                                        ""
                                    ]
                                ]
                            },
                            {
                                label: "",
                                text: "In your [[ref:data]] sheet:",
                                fillRight: true,
                                columns: [
                                    "cls",
                                    "fam",
                                    "gen",
                                    "spec",
                                    "catalogId"
                                ],
                                rows: [
                                    ["Magnoliopsida", "Rosaceae", "", "", "NHM-1"],
                                    ["Magnoliopsida", "Rosaceae", "Rosa", "", "NHM-2"],
                                    ["Magnoliopsida", "Rosaceae", "Rosa", "Rosa canina", "NHM-3"],
                                    ["Magnoliopsida", "Rosaceae", "Rosa", "Rosa rubiginosa", "NHM-4"],
                                    ["Magnoliopsida", "Rosaceae", "Rubus", "Rubus idaeus", "NHM-5"],
                                    ["Liliopsida", "", "", "", "NHM-6"],
                                    ["Liliopsida", "Poaceae", "Triticum", "Triticum aestivum", "NHM-7"]
                                ]
                            },
                            {
                                label: "",
                                text: "... will get displayed like this (note that both Rosa canina and Rosa rubiginosa show Rosaceae as the parent, skipping the genus; all occurrences reference their identified-to taxon):",
                                preformatted: `
┌── Magnoliopsida
│   │    ╚══ NHM-1 (class: Magnoliopsida)
│   └── Rosaceae (class: Magnoliopsida)
│       ├── Rosa
│       │   │   ╚══ NHM-2 (genus: Rosa)
│       │   ├── Rosa canina (family: Rosaceae)
│       │   │      ╚══ NHM-3 (species: Rosa canina)
│       │   └── Rosa rubiginosa (family: Rosaceae)
│       │          ╚══ NHM-4 (species: Rosa rubiginosa)
│       └── Rubus
│           └── Rubus idaeus (family: Rosaceae)
│                  ╚══ NHM-5 (species: Rubus idaeus)
└── Liliopsida
    │   ╚══ NHM-6 (class: Liliopsida)
    └── Poaceae (class: Liliopsida)
        └── Triticum (family: Poaceae)
            └── Triticum aestivum (family: Poaceae)
                   ╚══ NHM-7 (species: Triticum aestivum)
`
                            }],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            defaultValue: "",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    italicize: {
                        name: "Italicize",
                        description: "Whether taxon names at this rank are rendered in italics. Conventionally used for genus and species.",
                        howToUse: "Set to `yes` for genus and species ranks. Leave empty or `no` for higher ranks.",
                        notes: [],
                        examples: [
                            {
                                label: "Italicizing genus and species",
                                fillRight: true,
                                columns: [
                                    "Column name",
                                    "Taxon name",
                                    "Italicize"
                                ],
                                rows: [
                                    [
                                        "Family",
                                        "Family",
                                        ""
                                    ],
                                    [
                                        "Genus",
                                        "Genus",
                                        "yes"
                                    ],
                                    [
                                        "Species",
                                        "Species",
                                        "yes"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            defaultValue: "",
                            allowedContent: "list",
                            listItems: [
                                "yes",
                                "no",
                                ""
                            ],
                            supportsMultilingual: false
                        }
                    }
                },
                data: [],
                templateData: [
                    {
                        columnName: "Class",
                        taxonName: "Class",
                        parentTaxonIndication: "",
                        italicize: ""
                    },
                    {
                        columnName: "Order",
                        taxonName: "Order",
                        parentTaxonIndication: "Class",
                        italicize: ""
                    },
                    {
                        columnName: "Family",
                        taxonName: "Family",
                        parentTaxonIndication: "Order",
                        italicize: ""
                    },
                    {
                        columnName: "Genus",
                        taxonName: "Genus",
                        parentTaxonIndication: "Family",
                        italicize: ""
                    },
                    {
                        columnName: "Species",
                        taxonName: "Species",
                        parentTaxonIndication: "Family",
                        italicize: "yes"
                    }
                ]
            },
            customDataDefinition: {
                name: "Custom data definition",
                required: false,
                description: "Declares every non-taxon column you want to use for additional data. Rows corresponds to columns in [[ref:data]] sheet and controls the column's display title, data type, template rendering, placement in the taxon card and more.\n\nData paths support dot notation for structured sub-fields (`redListEvaluation.year`) and `#` notation for arrays (`habitat#`). Include one row for the root path and one row for each sub-path you want to control them independently.\n\nThis is by far the most complex configuration table in the entire system. Once you are familiar with how it works, the other tables will be a breeze. Take your time to understand the concepts of data paths, data types, templates and other features as they are the key to unlocking the full potential of your project.",
                notes: [
                    {
                        type: "tip",
                        text: "Read about the [data path](./data-sheet#column-naming-and-data-paths) concept to understand how arrays (`#`) and structured sub-fields (`.`) let you represent complex data using plain spreadsheet columns."
                    }
                ],
                columns: {
                    columnName: {
                        name: "Column name",
                        description: "The data path of the column this row configures. Simple column names (`redlist`), dotted sub-fields (`origPub.author`), and array paths (`habitat#`) are all valid. For structured and array data, include one row for the root path (e.g. `habitat`) and one row for each item path (e.g. `habitat#`).",
                        howToUse: "Every column from [[ref:data]] sheet that you want to appear as data point in your project must have a row here. Columns from the [[ref:data]] sheet used only as template inputs for other columns can be listed with `hidden = yes` to avoid displaying them.",
                        notes: [],
                        examples: [
                            {
                                label: "Simple column, array column and a structured column with sub-fields",
                                text: "Here we have a simple column (`redlist`), several habitats with an array column (`habitat#`) with its root path (`habitat` and a title applied once for all its items), and a structured column (`dimmensions`) with two sub-fields (`dimmensions.beakToTail` with its title and `dimmensions.wingspan` with its title).",
                                fillRight: true,
                                columns: [
                                    "Column name",
                                    "Title",
                                    "Data type"
                                ],
                                rows: [
                                    [
                                        "redlist",
                                        "Red List",
                                        "category"
                                    ],
                                    [
                                        "habitat",
                                        "Habitat",
                                        "list bullets"
                                    ],
                                    [
                                        "habitat#",
                                        "",
                                        "text"
                                    ],
                                    [
                                        "dimmensions",
                                        "",
                                        "list"
                                    ],
                                    [
                                        "dimmensions.beakToTail",
                                        "Beak to tail length",
                                        "number"
                                    ],
                                    [
                                        "dimmensions.wingspan",
                                        "Wingspan",
                                        "number"
                                    ],
                                ]
                            },
                            {
                                label: "",
                                text: "In your [[ref:data]] sheet, the `habitat#` column becomes multiple columns (e.g., `habitat1`, `habitat2`) containing individual habitats per taxon (you could also opt for a single `habitat` column with pipe-separated values), and the `dimmensions.beakToTail` and `dimmensions.wingspan` columns contain measurements that belong together under a common `dimmensions` root path. Note that there is no need to enter the intermediate data path items (no `habitat` column before `habitat1` and `habitat2`, no `dimmensions` column before `dimmensions.beakToTail` and `dimmensions.wingspan`) as they do not carry any data. It is only your terminal ('leaf') data paths that matter as columns. The example leaves out most of the taxonomic structure for brevity\n\nNote: in this example we write-out the `redlist` category verbatim for simplicity. For this and similar controlled vocabularies your data entry will be simpler, if you enter the RedList codes ('EN', 'VU') and set up the [[ref:appearance.dataCodes]] for them.",
                                fillRight: true,
                                fillLeft: true,
                                columns: [
                                    "species",
                                    "redlist",
                                    "habitat1",
                                    "habitat2",
                                    "dimmensions.beakToTail",
                                    "dimmensions.wingspan"
                                ],
                                rows: [
                                    ["Aquilla chrysaetos", "Vulnerable", "Forests", "", "150", "120"],
                                    ["Buteo buteo", "Least Concern", "Forest", "Farmland", "60", "110"],
                                    ["Falco peregrinus", "Least Concern", "Mountains", "Urban", "55", "100"]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "no",
                            allowedContent: "dataPath",
                            supportsMultilingual: false
                        }
                    },
                    title: {
                        name: "Title",
                        description: "The label shown before the data value in the taxon card. `| Tooltip text` after the title to show a small info icon with a tooltip on hover - e.g. `Total length | Average head-to-tail length in cm`.",
                        howToUse: "Provide a title typically for all top-level fields. Omit where no title is desired, commonly for sub-items within arrays or structured objects where the parent row's title serves as the heading.",
                        notes: [],
                        examples: [
                            {
                                label: "Title with tooltip",
                                columns: [
                                    "Column name",
                                    "Title"
                                ],
                                rows: [
                                    [
                                        "wingLength",
                                        "Wing length | Average head-to-tail length measured in cm"
                                    ],
                                ]
                            },
                            {
                                label: "Structured and array sub-items without titles",
                                text: "Note that contrary to the example in [[ref:content.customDataDefinition.columnName]], the `redList` here is not a simple field, but a structured one with sub-properties. Just to show you that your data depend completely on your needs and nothing is pre-defined.",
                                columns: [
                                    "Column name",
                                    "Title"
                                ],
                                rows: [
                                    [
                                        "redList",
                                        "RedList category | The IUCN Red List category and latest evaluation year"
                                    ],
                                    [
                                        "redList.code",
                                        ""
                                    ],
                                    [
                                        "redList.lastEvaluationYear",
                                        ""
                                    ],
                                    [
                                        "habitat",
                                        "Usual habitats"
                                    ],
                                    [
                                        "habitat#",
                                        ""
                                    ],
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            defaultValue: "",
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    },
                    searchCategoryTitle: {
                        name: "Search category title",
                        description: "If non-empty, a filter dropdown appears in the search sidebar with this label allowing you to filter data on this column. The filter type (categorical checkboxes vs. numeric range) is determined automatically from the [[ref:content.customDataDefinition.formatting]] value.\n\nAdd a pipe-separated suffix to group the filter with others under a common section heading - e.g. `Habitat | Ecology` and `Life form | Ecology` both appear under an **Ecology** section.",
                        howToUse: "Set for any column whose values users should be able to filter by. Omit for display-only or template-only columns. Use the `Label | Group` pattern to organise multiple logically related filters into named sections.",
                        notes: [
                            {
                                type: "tip",
                                text: "Most data types support filters, see [Filters and Search Categories](./filters-search-categories) for the full eligibility table."
                            }
                        ],
                        examples: [
                            {
                                label: "Grouped filter titles",
                                columns: [
                                    "Column name",
                                    "Search category title"
                                ],
                                rows: [
                                    [
                                        "habitat",
                                        "Habitat | Ecology"
                                    ],
                                    [
                                        "lifeform",
                                        "Life form | Ecology"
                                    ],
                                    [
                                        "redlist",
                                        "Red List"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "empty-only",
                            defaultValue: "",
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    },
                    formatting: {
                        name: "Data type",
                        description: "The data type for this column. Determines how the app reads and render the raw cell value (or its sub-columns) You have already seen this in the case of [[ref:type.taxon]] data type when filling-in the [[ref:content.taxa]] table), where the **taxon** data type allowed you to use its `[column].name` and `[column].authority` properties to enter the taxonomic name and authority.\n\nFor array or object root entries (paths using `#` or `.` children), use the special `list` data type to indicate a compound value. Append an optional separator keyword after a space:\n\n| Value | Result |\n|---|---|\n| `list` or `list bullets` | Unordered bullet list (default) |\n| `list numbered` | Ordered list starting at 1 |\n| `list unmarked` | List with no bullets or numbers |\n| `list space` | Items on one line, separated by a space |\n| `list comma` | Items on one line, separated by `, ` |\n| `list [any string]` | Items on one line, separated by that string |\n\nSee [Data Types](./data-types) for the full type reference.",
                        howToUse: "Leave empty (defaults to `text`) for plain string data. Choose the appropriate data type whenever the column holds numbers, dates, images, maps, months, intervals, or other structured data - the right type enables the correct filter, renderer, and search indexing.",
                        notes: [
                            {
                                type: "tip",
                                title: "Numbers and units",
                                text: "Store bare numbers in your data cells and use the **Template** column to add units at display time (e.g. `{{unit \"m\"}}`). Entering `5 m` in a cell instead of `5` turns the value into text and disables numeric filtering. Read more about the [unit template](./templates#unit-automatic-unit-scaling)."
                            }
                        ],
                        examples: [
                            {
                                label: "Common data type values",
                                text: "The below is a non-normative list of suggestions for common data types and their effects. Explore the [Data Types reference](./data-types) for the full list of types and their capabilities. As always, nothing is set in stone and the best choice depends on your specific data and how you want to use it - experiment with different types to find the best fit for your project.",
                                columns: [
                                    "Column name",
                                    "Data type",
                                    "Effect"
                                ],
                                rows: [
                                    [
                                        "redlist",
                                        "category",
                                        "Coloured badge; categorical filter"
                                    ],
                                    [
                                        "wingLength",
                                        "number",
                                        "Numeric value of exact measurement; numeric filter"
                                    ],
                                    [
                                        "wingspan",
                                        "interval",
                                        "Numeric value of the typical range; numeric filter"
                                    ],
                                    [
                                        "collectionDate",
                                        "date",
                                        "Parsed and formatted date; date filter"
                                    ],
                                    [
                                        "distribution",
                                        "mapregions",
                                        "SVG distribution choropleth map + inline region list"
                                    ],
                                    [
                                        "flowering",
                                        "months",
                                        "Compact month range display; categorical filter"
                                    ],
                                    [
                                        "photo",
                                        "image",
                                        "Clickable thumbnail; filterable by title"
                                    ],
                                    [
                                        "basionym",
                                        "taxon",
                                        "Clickable taxon link; filtrable by taxon name"
                                    ],
                                    [
                                        "fieldIdentification",
                                        "markdown",
                                        "Rendered formatted text through Markdown; not filterable but searchable in full-text"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "`list` may be followed by a separator keyword (e.g. `list comma`, `list bullets`, `list space`) or any data type name.",
                            allowEmpty: true,
                            defaultValue: "text",
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    template: {
                        name: "Template",
                        description: "A [Handlebars](https://handlebarsjs.com/) expression applied to the raw data value before the type-specific renderer runs. Use `{{value}}` for the current field's value, `{{taxon.name}}` for the taxon name, `{{taxon.authority}}`, `{{taxon.fullName}}`, and `{{data.columnname}}` for any other field on the same row.\n\nFor `image`, `sound`, and `map` types, the template produces the **source URL**. For `mapregions`, it produces the **SVG file path**. For `geopoint`, it is the **map link URL** (use `{{lat}}` and `{{long}}`).\n\nSupports multilingual variants: `Template:en`, `Template:fr`.",
                        howToUse: "Use when you need to modify the spreadsheet value in display to append a unit, build a URL, select a file path dynamically, or transform the raw value before display. See [Dynamic content with templates](./templates) for worked examples.",
                        notes: [
                            {
                                type: "tip",
                                text: "The `{{unit \"m\"}}` helper automatically scales numeric values to the most readable unit in the same category (e.g. `0.05` → `5 cm`, `1500` → `1.5 km`). See [Templates → `{{unit}}`](/author-guide/templates#unit--automatic-unit-scaling)."
                            }
                        ],
                        examples: [
                            {
                                label: "Common template patterns",
                                columns: [
                                    "Purpose",
                                    "Template value"
                                ],
                                rows: [
                                    [
                                        "Auto-scale a unit",
                                        "`{{unit \"m\"}}`"
                                    ],
                                    [
                                        "Build a hyperlink (use with markdown formatting)",
                                        "`[{{taxon.name}}](https://www.gbif.org/search?q={{value}})`"
                                    ],
                                    [
                                        "Simplify referencing media files in `usercontent/`",
                                        "`usercontent/img/{{value}}.jpg`"
                                    ],
                                    [
                                        "SVG map path",
                                        "`maps/southeast-asia.svg`"
                                    ],
                                    [
                                        "Google Maps geopoint",
                                        "`https://www.google.com/maps?q={{lat}},{{long}}`"
                                    ]
                                ]
                            },
                            {
                                label: "Custom data definition settings",
                                fillRight: true,
                                text: "Simplified table with one row per each previous example, with comments",
                                columns: [
                                    "Column name",
                                    "Title",
                                    "Data type",
                                    "Template",
                                    "[comment]"
                                ],
                                rows: [
                                    [
                                        "wingspan",
                                        "Wingspan",
                                        "interval",
                                        "`{{\"unit\" \"cm\"}}`",
                                        "Typical interval (use `interval` data type instead of single-value `number`) of wingspan in cm; the `{{unit}}` helper auto-scales the value to the most readable unit in the same category (e.g. `5` → `5 cm`, `150` → `1.5 m`)"
                                    ],
                                    [
                                        "gbifTaxonNumber",
                                        "GBIF taxon",
                                        "number",
                                        "`[{{taxon.name}}](https://www.gbif.org/species/{{value}})`",
                                        "Use Markdown notation to render a link to the corresponding GBIF species page using the cell value"
                                    ],
                                    [
                                        "referenceImage",
                                        "",
                                        "image",
                                        "`usercontent/img/{{value}}.jpg`",
                                        "No title, just a clickable image. The template builds the source URL from the cell value - e.g. a cell value of `rose` looks for `usercontent/img/rose.jpg` instead of you typing the full path every time."
                                    ],
                                    [
                                        "southeastAsiaRange",
                                        "Southeast Asia Range",
                                        "mapregions",
                                        "`maps/southeast-asia.svg`",
                                        "Use satatic reference for an SVG file in `usercontent/maps/` to render a custom map showing the distribution range within Southeast Asia. This would expect some additional configuration, see **mapregions** data type for full details."
                                    ],
                                    [
                                        "gpsCoordinates",
                                        "GPS coordinates",
                                        "geopoint",
                                        "`https://www.openstreetmap.org/?mlat={{lat}}&mlon={{long}}&zoom=5`",
                                        "Use any URL template with `{{lat}}` and `{{long}}` placeholders to render a link to an online map centered on the coordinates.."
                                    ]
                                ]
                            },
                            {
                                label: "",
                                fillLeft: true,
                                fillRight: true,
                                text: "In your [[ref:data]] sheet your data for each of those would look like this, taxonomy mostly left out for simplicity. See [Data types](./data-types) for full details on each of these data types and their specific data entry options.",
                                columns: [
                                    "species",
                                    "wingspan",
                                    "gbifTaxonNumber",
                                    "referenceImage",
                                    "southeastAsiaRange",
                                    "gpsCoordinates",
                                    "[comment]"
                                ],
                                rows: [
                                    [
                                        "Chrysococcyx maculatus",
                                        "16 - 18",
                                        "2496315",
                                        "chrysococcyx_maculatus_1200px",
                                        "vn | mm | th",
                                        "15.9742, 105.8064",
                                        "`referenceImage` needs only the actual file name without extension, not the full path thanks to our template. `southeastAsiaRange` supposes you have the region codes set up for `vn` (Vietnam), `mm` (Myanmar), and `th` (Thailand)."
                                    ],
                                    [
                                        "Centropus sinensis",
                                        "55 - 75",
                                        "5232005",
                                        "centropus_sinensis_1200px",
                                        "cn | mm | th",
                                        "22.3964, 114.1095",
                                        "Another taxon with its own data"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            defaultValue: "",
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    },
                    placement: {
                        name: "Placement",
                        description: "Defines where the data field appears in the taxon card.\n\nWhen `details` is used, the field won't show up in the taxon card, but will appear upon clicking that taxon in a [details tab](/user-guide/taxon-details) determined by its data type: `image` and `sound` → **Media** tab; `map` and `mapregions` → **Map** tab; `text` and `markdown` → **Text** tab.\n\nSee [Placement Options](./placement-visibility) for the layout diagram and guidance table.",
                        howToUse: "Use `left`, `middle`, or `right` for compact single-value fields (status badges, dates, short measurements). Use `top` or `bottom` for longer content (descriptions, distribution lists). Use `details` for rich content (large images, full maps, long notes) that users seek out by clicking a taxon.",
                        notes: [],
                        examples: [
                            {
                                label: "Sample placement choices",
                                fillRight: true,
                                columns: [
                                    "Column name",
                                    "Data type",
                                    "Placement",
                                    "[comment]"
                                ],
                                rows: [
                                    [
                                        "redlist",
                                        "category",
                                        "left",
                                        ""
                                    ],
                                    [
                                        "collectionDate",
                                        "date",
                                        "right",
                                        "Instead of putting `redlist` and `collectionDate` in the same column, we give them separate columns to take less vertical space."
                                    ],
                                    [
                                        "description",
                                        "markdown",
                                        "details",
                                        "This text may be long, so let's give it the full horizontal space."
                                    ],
                                    [
                                        "distribution",
                                        "mapregions",
                                        "middle | details",
                                        "`mapregions` are chameleons ... in `details` they will render an SVG choroipleth map, but in the main card they will render a simple text list of regions. Pick either or both. This way users get a quick overview in the card and can click for the full map if they want."
                                    ],
                                    [
                                        "photo",
                                        "image",
                                        "details",
                                        "This won't show up on the main card, but users can click the taxon name to see the image in the Media tab."
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "When combining with `|`, the second keyword must always be `details` (e.g. `bottom|details`).",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            defaultValue: "top",
                            allowedContent: "list",
                            listItems: [
                                "top",
                                "bottom",
                                "left",
                                "middle",
                                "right",
                                "details",
                                "top|details",
                                "bottom|details",
                                "left|details",
                                "middle|details",
                                "right|details",
                                ""
                            ],
                            supportsMultilingual: false
                        }
                    },
                    hidden: {
                        name: "Hidden",
                        description: "Controls whether and when a data field is displayed.\n\n- Empty or `no`: field is always shown.\n- `yes`: field is completely hidden from the taxon card (data is still loaded and available in templates via `{{data.*}}`).\n- `data`: hidden from the taxon card but drives a filter button in the sidebar. Also makes the column available in the Trait Matrix analysis tool without a visible filter.\n- **Conditional expression**: show or hide the field based on the current state of a filter. The subject is the column name of any filter-enabled column.\n\n| Expression | Effect |\n|---|---|\n| `if incountry notset` | Hide if the `incountry` filter has no value selected |\n| `unless incountry isset` | Hide unless the `incountry` filter has at least one value |\n| `unless incountry is \"Czechia\", \"Vanuatu\"` | Hide unless `incountry` has Czechia or Vanuatu selected |\n| `unless incountry notsetor \"Czechia\"` | Hide unless `incountry` is unset or has Czechia selected |",
                        howToUse: "Most of your rows will leave this empty. Use `yes` for columns needed as template inputs but not for display. Use `data` for filter-only or Trait Matrix columns that you don't want to show up on the taxon card (could be complex systems of traits you don't want to inflate your taxon card). Use a conditional expression for region- or scenario-specific fields that should only appear when a relevant filter is active. This could be used to create eg. a country filter for a regional checklist project, where you only want to show country-specific status or distribution fields when the user has selected that country in the filter - keeping the taxon card clean of irrelevant fields for users interested in other regions.",
                        notes: [
                        ],
                        examples: [
                            {
                                label: "Conditional visibility per country filter",
                                fillRight: true,
                                text: "This will show the `status_cz` column only when the user has selected `Czechia` in the `incountry` filter, and the `status_fr` column only when `France` is selected. When no country is selected, or a different country is selected, both columns are hidden. This way we can have one column per country with specific status information without cluttering the taxon card with irrelevant fields for users interested in other countries.",
                                columns: [
                                    "Column name",
                                    "Title",
                                    "Search category title",
                                    "Hidden"
                                ],
                                rows: [
                                    [
                                        "country",
                                        "Country",
                                        "Country",
                                        "data"
                                    ],
                                    [
                                        "status_cz",
                                        "Status in Czechia",
                                        "",
                                        "unless country is \"Czechia\""
                                    ],
                                    [
                                        "status_fr",
                                        "Status in France",
                                        "",
                                        "unless country is \"France\""
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            defaultValue: "no",
                            supportsMultilingual: false
                        }
                    },
                    belongsTo: {
                        name: "Belongs to",
                        description: "If your dataset includes **occurrences**, this column controls whether it belongs to taxon or occurrence rows.\n\n- Empty (default) or `taxon`: the column belongs to taxon rows.\n- `occurrence`: the column belongs to occurrence rows only.\n\nEvery column must belong to one entity or the other - there is no shared option.\n\nOnly set this on root or simple columns; child columns (`.subfield`, `#`) inherit the value automatically. See [Occurrence and collection mode](./occurrence-collection-mode) for more information.",
                        howToUse: "Leave empty for columns that contain taxon-level information. Set to `occurrence` for every column that carries occurrence-specific data (e.g. collector name, collection date, catalog number, locality).",
                        notes: [
                            {
                                type: "tip",
                                text: "In the filter sidebar, `taxon` filters are always visible, but when the user switches to Occurrence mode, `occurrence` filters become visible."
                            },
                            {
                                type: "warning",
                                text: "Only set **Belongs to** on the root row of a column group. For example, set it on `origPub`, not on `origPub.author` or `origPub.year` - the value cascades to all child paths automatically."
                            }
                        ],
                        examples: [
                            {
                                label: "Mixed taxon and occurrence columns",
                                fillRight: true,
                                columns: [
                                    "Column name",
                                    "Title",
                                    "Belongs to"
                                ],
                                rows: [
                                    [
                                        "redlist",
                                        "Red List",
                                        ""
                                    ],
                                    [
                                        "description",
                                        "Description",
                                        ""
                                    ],
                                    [
                                        "collector",
                                        "Collector",
                                        "occurrence"
                                    ],
                                ]
                            },
                            {
                                label: "",
                                text: "In your [[ref:data]] sheet, the `collector` and `catalogNumber` columns would only have values in occurrence rows, while `redlist`, `description`, and `distribution` would have values in taxon rows. Taxonomy is simplified for this example and the `catalogNumber` column is the `occurrence` level taxon from [[ref:content.taxa]] table.\n\nUsing this pattern you can define separate rows for taxa-related data and others for occurrence-related data.",
                                fillRight: true,
                                columns: [
                                    "family",
                                    "species",
                                    "catalogNumber",
                                    "redlist",
                                    "description",
                                    "collector",
                                    "[comment]"
                                ],
                                rows: [
                                    [
                                        "Accipiteridae",
                                        "",
                                        "",
                                        "",
                                        "Medium-large raptors with a robust body...",
                                        "",
                                        "This is a **taxon** row (it has no catalogNumber), here we enter the family-level information that will show up on the family-level taxon card, no Red List information (this is a family), but a family-level description."
                                    ],
                                    [
                                        "Accipiteridae",
                                        "",
                                        "NHM-1",
                                        "",
                                        "",
                                        "John Doe",
                                        "This is an **occurrence** row (it has a catalogNumber), this occurrence is identified only to the `family`-level and carries the name of the collector."
                                    ],
                                    [
                                        "Accipiteridae",
                                        "Accipiter gentilis",
                                        "",
                                        "Least Concern",
                                        "The northern goshawk is ...",
                                        "",
                                        "This is a **taxon** row (it has no catalogNumber), here we enter the species-level information that will show up on the species-level taxon card."
                                    ],
                                    [
                                        "Accipiteridae",
                                        "Accipiter gentilis",
                                        "NHM-2",
                                        "",
                                        "",
                                        "Jane Smith",
                                        "This is an **occurrence** row (it has a catalogNumber), this occurrence is identified to species level and carries the name of the collector."
                                    ],
                                ]
                            },
                            {
                                label: "",
                                text: "In the checklist view, this will render to something like this:",
                                preformatted: `
┌────────────────────────────────────────────────────────┐
│ Accipiteridae                                          │
│ Description: Medium-large raptors with a robust body...│
├────────────────────────────────────────────────────────┤
│  │ NHM-1 (family: Accipiteridae)                       │
│  │ Collector: John Doe                                 │
├────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐ │
│ │ Accipiter gentilis (family: Accipiteridae)         │ │
│ │ Red List: Least Concern                            │ │
│ │ Description: The northern goshawk is ...           │ │
│ ├────────────────────────────────────────────────────┤ │
│ │  │ NHM-2 (species: Accipiter gentilis)             │ │
│ │  │ Collector: Jane Smith                           │ │               
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
`
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            allowedContent: "list",
                            listItems: [
                                "",
                                "taxon",
                                "occurrence"
                            ],
                            defaultValue: "taxon",
                            supportsMultilingual: false
                        }
                    }
                },
                data: [],
                templateData: [
                    {
                        columnName: "status",
                        title: "Status",
                        searchCategoryTitle: "Status",
                        formatting: "category",
                        placement: "left"
                    },
                    {
                        columnName: "redlist",
                        title: "Red List Category",
                        searchCategoryTitle: "Red List Category",
                        formatting: "category",
                        placement: "left"
                    },
                    {
                        columnName: "notes",
                        title: "Notes",
                        searchCategoryTitle: "",
                        formatting: "markdown",
                        placement: "bottom"
                    }
                ]
            },
            searchOnline: {
                name: "Search online",
                required: false,
                description: "Defines external search engine links that appear in the [Details pane](/user-guide/taxon-details) for each taxon, allowing users to look up taxa in online databases, herbaria, encyclopaedias, and other resources. Each row is one link.\n\nThis table can be left completely empty if you do not want to provide external search links, but it is a great way to enhance the user to easily look up the taxa in relevant third party online resources.",
                notes: [
                    {
                        type: "tip",
                        title: "Search links vs. shortcodes",
                        text: "A similar functionality is provided by [[ref:content.databaseShortcodes]]. These two features both link to external resources but serve distinct purposes. **Search Online links** are universal buttons in the Details pane that query an external site - GBIF, Google Images, a herbarium portal - by taxon name, configured once and applied to every taxon automatically. **Database Shortcodes** are inline links embedded in individual `markdown` fields using `@code:ID` syntax to point at a *specific known record* - for example `@inat:193429759` for a particular iNaturalist observation. In short: use **Search Online** for universal, name-based discovery; use **Database Shortcodes** when curating specific, citable external records for individual data entries."
                    }
                ],
                columns: {
                    title: {
                        name: "Title",
                        description: "The display label of the external search link shown in the Details pane. Appears as a button label next to the icon. For multilingual projects, use `Title:en`, `Title:fr`, etc.",
                        howToUse: "Keep it short and recognisable. For multilingual projects use language-suffixed columns.",
                        notes: [],
                        examples: [
                            {
                                label: "Bilingual search link titles",
                                fillRight: true,
                                columns: [
                                    "Title:en",
                                    "Title:fr"
                                ],
                                rows: [
                                    [
                                        "NYBG Virtual Herbarium",
                                        "Herbier virtuel NYBG"
                                    ],
                                    [
                                        "Google Images",
                                        "Images Google"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "no",
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    },
                    icon: {
                        name: "Icon",
                        description: "Filename (including extension) of the icon image located in `usercontent/online_search_icons/`. The icon should be square, at preferrably at least 200 × 200 px, with a white or transparent background. Accepted formats: `.jpg`, `.png`, `.webp`, `.svg`.\n\nNaturaList comes with icons shipped for GBIF (`gbif.png`), iNaturalist (`inat.png`), and Google (`google.png`), but you can add your own icons for any other search engines or online databases you want to link to.",
                        howToUse: "Prepare one icon per search engine and upload it to `usercontent/online_search_icons/` before compiling.",
                        notes: [],
                        examples: [
                            {
                                label: "Icon filenames",
                                fillRight: true,
                                columns: [
                                    "Title",
                                    "Icon"
                                ],
                                rows: [
                                    [
                                        "GBIF",
                                        "gbif.png"
                                    ],
                                    [
                                        "Google Images",
                                        "google.png"
                                    ],
                                    [
                                        "eBird",
                                        "ebird.png"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "File must exist in `usercontent/online_search_icons/`.",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "filename",
                            allowedExtensions: [
                                ".jpg",
                                ".png",
                                ".webp",
                                ".svg"
                            ],
                            supportsMultilingual: false
                        }
                    },
                    searchUrlTemplate: {
                        name: "Search URL template",
                        description: "The URL users are taken to when clicking the link, with Handlebars placeholders for dynamic values. The most common variable is `{{taxon.name}}`; `{{taxon.authority}}`, `{{data.columnname}}`, etc. are also available.\n\nTo construct the URL, search for a known taxon on the target site, copy the results URL, strip unnecessary parameters, and replace the taxon name portion with `{{taxon.name}}`. Some sites use complex search forms which send data as a POST request instead of a URL query - in that case, you can often use your browsers Dev Tools to see the format of the form submission and deduct the name of parameter used to pass the taxon name and then construct the URL with the appropriate placeholders.\n\nFor multilingual projects, you can provide language-specific URL templates if the target site has language-specific URL patterns - for example, Google search URLs differ for `google.com` vs. `google.fr` - by using `Search URL template:en`, `Search URL template:fr`, etc.",
                        howToUse: "Supports multilingual variants if the target site has language-specific URL patterns.",
                        notes: [],
                        examples: [
                            {
                                label: "Common search URL templates",
                                fillRight: true,
                                columns: [
                                    "Title",
                                    "Search URL template"
                                ],
                                rows: [
                                    [
                                        "Google Images",
                                        "`https://www.google.com/search?q={{taxon.name}}&tbm=isch`"
                                    ],
                                    [
                                        "GBIF Taxa",
                                        "`https://www.gbif.org/species/search?q={{taxon.name}}`"
                                    ],
                                    [
                                        "Smithsonian, US National Herbarium (US)",
                                        "`https://collections.nmnh.si.edu/search/botany/?qn={{taxon.name}}`"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "no",
                            allowedContent: "url",
                            supportsMultilingual: true
                        }
                    },
                    restrictToTaxon: {
                        name: "Restrict to taxon",
                        description: "If non-empty, the search link is shown only for taxa that are descendants of the named taxon (or the taxon itself). Multiple taxa can be listed comma-separated: `Aceropyga, Baeturia` restricts the link to descendants of either genus. Leave empty to show the link for every taxon.",
                        howToUse: "Use when the linked database covers only a subset of your project's taxa - for example, a beetle database link on a vertebrate checklist should be restricted to `Coleoptera`, as the database would likely be of limited use for e.g., mammal taxa.",
                        notes: [],
                        examples: [
                            {
                                label: "Restricting a mammal database link",
                                text: "Supposing your project has taxa covering different vertebrate groups, but the Mammal Diversity Database only has information on mammals, you can restrict that search link to `Mammalia` so it only appears for relevant taxa.",
                                fillRight: true,
                                columns: [
                                    "Title",
                                    "Search URL template",
                                    "Restrict to taxon",
                                    "[comment]"
                                ],
                                rows: [
                                    [
                                        "Mammal Diversity DB",
                                        "`https://www.mammaldiversity.org/taxa.html#genus={{taxon.name}}`",
                                        "Mammalia",
                                        "This link will only show up for taxa that are mammals."
                                    ],
                                    [
                                        "GBIF Taxa",
                                        "`https://www.gbif.org/species/search?q={{taxon.name}}`",
                                        "",
                                        "This link will show up for all taxa."
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "Taxon name(s) excluding authority, comma-separated. Matching is case-insensitive.",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    }
                },
                data: [],
                templateData: [
                    {
                        title: "iNaturalist",
                        icon: "inat.png",
                        searchUrlTemplate: "https://www.inaturalist.org/search?q={{taxon.name}}&source%5B%5D=taxa",
                        restrictToTaxon: ""
                    },
                    {
                        title: "Search Google",
                        icon: "google.png",
                        searchUrlTemplate: "https://www.google.com/search?q={{taxon.name}}",
                        restrictToTaxon: ""
                    },
                ]
            },
            singleAccessKeys: {
                name: "Single-access keys",
                required: false,
                description: "Embeds dichotomous or polytomous identification keys directly in the spreadsheet, navigable from within the app. Each key is a block of rows using four columns. Multiple keys can coexist in the same table and can be even chained (e.g. key to insect orders can automatically lead to a key for specific families).\n\nAs the user navigates a key, the main checklist filter updates in real time to show only the taxa still reachable given the choices made so far.\n\nThis table can be left completely empty if you do not use identification keys or plan to add them later once your data is ready.",
                notes: [
                    {
                        type: "tip",
                        title: "Formatting key text",
                        text: "Use Markdown `\*\***bold**\*\*` in Text cells to highlight the diagnostic character being contrasted, and `\__italics_\_` for taxon names. If needed, you can use other Markdown formatting or `@citekey` bibliography citations (see [[ref:content.bibliography]] table)."
                    }
                ],
                columns: {
                    step: {
                        name: "Step",
                        description: "A text code starts a new key. You can use any **text**, but it's recommended to use the taxon name from among your taxa which covers the key (e.g. `Coleoptera` for a key to beetles families; `beetles` will be accepted, you may use a non-taxon identifier if your key doesn't cover an entire taxon). An **integer** starts or continues a question step within the current key. All rows sharing the same integer are the choices for that one question. Step integers must be strictly ascending within a key, and a **Target** integer must always be higher than the current **Step** integer.\n\nIf a key result is a taxon name that matches the **Step** header of another key, the app automatically offers that second key as a continuation - enabling multi-level key chains, hence the interest to use names of taxa as **Step** headers.",
                        howToUse: "Use a unique text code for each key header, then ascending integers (1, 2, 3…) for question steps within that key.",
                        notes: [],
                        examples: [
                            {
                                label: "A minimal dichotomous key",
                                columns: [
                                    "Step",
                                    "Text",
                                    "Target",
                                    "Images"
                                ],
                                rows: [
                                    [
                                        "reptiles",
                                        "Key to Reptiles of Vanuatu | Covers species recorded since 1990",
                                        "1",
                                        ""
                                    ],
                                    [
                                        "1",
                                        "Body covered with scales, no limbs",
                                        "2",
                                        ""
                                    ],
                                    [
                                        "1",
                                        "Four limbs present",
                                        "3",
                                        ""
                                    ],
                                    [
                                        "2",
                                        "Yellow/black banded",
                                        "Pelamis platura",
                                        ""
                                    ],
                                    [
                                        "2",
                                        "Uniform olive",
                                        "Aipysurus laevis",
                                        ""
                                    ],
                                    [
                                        "3",
                                        "...",
                                        "...",
                                        ""
                                    ]
                                ]
                            },
                            {
                                label: "Three chained keys: European beetle families and two family-level keys",
                                text: "The Target values `Carabidae` and `Coccinellidae` in the first key match the Step header codes of the two lower keys exactly, so the app automatically chains into them. This supposes you have all those taxa in your [[ref:data]] sheet.",
                                columns: ["Step", "Text", "Target", "Images"],
                                rows: [
                                    // Higher-taxon key: to family
                                    ["beetles_europe", "Key to Selected European Beetle Families | Following @beetles2018, covers Carabidae, Coccinellidae, and Cerambycidae...", "1", ""],
                                    ["1", "Body **flattened and elongate**; hind angles of pronotum acute...", "Carabidae", ""],
                                    ["1", "Body **strongly convex** (hemispherical) or elongate-cylindrical...", "2", ""],
                                    ["2", "Body **hemispherical**; elytra smooth, brightly coloured with discrete spots...", "Coccinellidae", ""],
                                    ["2", "Body **elongate-cylindrical**; antennae at least half body length...", "Cerambycidae", ""],

                                    // Lower key 1: Carabidae - chains from "Carabidae" above
                                    ["Carabidae", "Key to Selected *Carabidae* | Covers *Carabus*, *Cicindela*, and *Pterostichus*...", "1", ""],
                                    ["1", "Elytra with **metallic violet or blue iridescence**; surface with fused chain-like ridges...", "Carabus violaceus", ""],
                                    ["1", "Elytra **not iridescent**; surface finely striate or nearly smooth...", "2", ""],
                                    ["2", "Eyes **very large and prominent**; elytra dark metallic with pale spots...", "Cicindela campestris", ""],
                                    ["2", "Eyes moderate; elytra **uniformly black**, finely striate...", "Pterostichus melanarius", ""],

                                    // Lower key 2: Coccinellidae - chains from "Coccinellidae" above
                                    ["Coccinellidae", "Key to Selected *Coccinellidae* | Covers *Coccinella*, *Harmonia*, and *Adalia*...", "1", ""],
                                    ["1", "Elytra **red with 7 black spots** (3+3+1 scutellar); pronotum white...", "Coccinella septempunctata", ""],
                                    ["1", "Elytral pattern variable or with fewer than 7 spots...", "2", ""],
                                    ["2", "Elytra orange to red, pattern **highly variable** (melanic to pale)...", "Harmonia axyridis", ""],
                                    ["2", "Elytra red with **2 black spots** or black with 2 red spots...", "Adalia bipunctata", ""]
                                ]
                            }

                        ],
                        integrity: {
                            description: "Step integers must be strictly ascending within a key.",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    text: {
                        name: "Text",
                        description: "For a **key header row**: the title and optional description in `Title | Description` format (pipe-separated). For a **question step row**: the text describing this choice. Markdown is supported - use `**bold**` for diagnostic characters and `*italics*` for taxon names.",
                        howToUse: "Header rows use `Title | Description` format; step rows describe the diagnostic character or choice.",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    },
                    target: {
                        name: "Target",
                        description: "Where this choice leads. Enter a **higher integer** to continue to the next question step, a **taxon name** as the final identification result, or another **key Step ID** (text code) to chain to another key.",
                        howToUse: "Required for all step choice rows. Leave empty for key header rows.",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "Integer target must be strictly higher than the current Step number.",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    images: {
                        name: "Images",
                        description: "Optional image(s) from `usercontent/keys/` folder to display alongside this step choice. Each entry is a filename optionally followed by a `#`-led caption: `wing.jpg #Dorsal view`. Separate multiple entries with a pipe `|`. The caption is displayed below the image in fullscreen view.",
                        howToUse: "One or several images can illustrate the precise feature being described.",
                        notes: [
                            {
                                type: "warning",
                                text: "Images are only permitted on numeric step rows, not on key header rows."
                            }
                        ],
                        examples: [
                            {
                                label: "Single image without caption, two images with captions",
                                columns: [
                                    "Step",
                                    "Text",
                                    "Target",
                                    "Images"
                                ],
                                rows: [
                                    [
                                        "1",
                                        "**Elytra metallic**, surface with fused chain-like ridges...",
                                        "Carabus violaceus",
                                        "carabus_habitus.jpg"
                                    ],
                                    [
                                        "1",
                                        "Elytra **not metallic**; surface smooth or finely striate...",
                                        "2",
                                        "wing_dorsal.jpg #Dorsal view | wing_ventral.jpg #Ventral view"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "Each pipe-separated token must be a filename with a valid extension, optionally followed by ` #Caption`. A `#`-only token with no preceding filename is invalid and will be skipped with a compiler error.",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            allowedContent: "filenameList",
                            allowedExtensions: [
                                ".jpg",
                                ".jpeg",
                                ".png",
                                ".webp"
                            ],
                            supportsMultilingual: false
                        }
                    }
                },
                data: [],
                templateData: [
                    {
                        step: "vanuatu_herpetofauna",
                        text: "Key to the Amphibians and Reptiles of Vanuatu | Covers all 8 species in this checklist. Based on @zug1993 and @bauer1990. Use on adult or near-adult specimens.",
                        target: "1",
                        images: ""
                    },
                    {
                        step: "1",
                        text: "**Limbs absent**; body elongate, cylindrical, covered in smooth overlapping scales",
                        target: "4",
                        images: ""
                    },
                    {
                        step: "1",
                        text: "**Limbs present** (four legs visible, or a rigid shell enclosing the body)",
                        target: "2",
                        images: ""
                    },
                    {
                        step: "2",
                        text: "Body enclosed in a **bony shell**; limbs paddle-shaped; back with 7 prominent longitudinal **leathery ridges**; no scutes",
                        target: "Dermochelys coriacea",
                        images: ""
                    },
                    {
                        step: "2",
                        text: "No shell; four well-developed limbs; body covered in smooth moist skin or keeled scales",
                        target: "3",
                        images: ""
                    },
                    {
                        step: "3",
                        text: "**Skin smooth and moist**, no scales; toepads with enlarged discs; **tympanum** (eardrum) clearly visible behind eye; call audible at night",
                        target: "Litoria aurea",
                        images: ""
                    },
                    {
                        step: "3",
                        text: "Body covered in **scales**; no tympanum visible externally as a naked disc",
                        target: "5",
                        images: ""
                    },
                    {
                        step: "4",
                        text: "**Paddle-shaped tail**, laterally compressed; nostril valves present; scales on underside of tail undifferentiated (not enlarged)",
                        target: "Pelamis platura",
                        images: ""
                    },
                    {
                        step: "4",
                        text: "**Tail not paddle-shaped**; round or slightly compressed; distinct enlarged or keeled ventral scales present",
                        target: "5",
                        images: ""
                    },
                    {
                        step: "5",
                        text: "Digits with **expanded adhesive toepads**; pupils **vertical** (cat-like) in bright light; body dorsal surface granular",
                        target: "6",
                        images: ""
                    },
                    {
                        step: "5",
                        text: "Digits **without** expanded toepads; pupils **round**; body scales smooth and shiny or keeled",
                        target: "7",
                        images: ""
                    },
                    {
                        step: "6",
                        text: "Large gecko, **SVL > 60 mm** in adults; digits with undivided basal lamellae and a distinct claw notch; dorsum pale grey-brown with scattered dark spots",
                        target: "Gehyra georgpotthasti",
                        images: ""
                    },
                    {
                        step: "6",
                        text: "Medium or small skink, **SVL < 60 mm** in adults; digits slender without expanded toepads; dorsum with distinct longitudinal pattern or uniform",
                        target: "7",
                        images: ""
                    },
                    {
                        step: "7",
                        text: "**Eyelids absent** (eye covered by a transparent spectacle, as in snakes); supranasals in contact at midline; dorsal scales in 26–28 rows at midbody",
                        target: "Cryptoblepharus novohebridicus",
                        images: ""
                    },
                    {
                        step: "7",
                        text: "**Eyelids present** and movable; supranasals separated at midline; dorsal scales in fewer than 26 rows at midbody",
                        target: "8",
                        images: ""
                    },
                    {
                        step: "8",
                        text: "Dorsum brown with **irregular black spots** scattered over the body; 30 or more scale rows around midbody; legs short relative to body",
                        target: "Caledoniscincus atropunctatus",
                        images: ""
                    },
                    {
                        step: "8",
                        text: "Dorsum with **pale dorsolateral stripe** on each side against a dark brown or blackish ground colour; 28 or fewer scale rows",
                        target: "9",
                        images: ""
                    },
                    {
                        step: "9",
                        text: "**Dorsolateral stripe** cream to pale yellow, fading on tail; **flanks black** with no bronze iridescence; found in hill and montane forest interior; known only from Aneityum",
                        target: "Emoia aneityumensis",
                        images: ""
                    },
                    {
                        step: "9",
                        text: "**Dorsolateral stripe** cream to white, continuing to tail base; **flanks black** with strong **bronze iridescence** in live specimens; coastal rocks and littoral zone throughout island chain",
                        target: "Emoia atrocostata",
                        images: ""
                    }
                ]
            },
            bibliography: {
                name: "Bibliography",
                required: false,
                description: "Stores BibTeX entries that can be cited using `@citekey` notation in any Markdown field throughout the project. Each row contains one or several complete BibTeX entries.\n\nCitations are rendered in APA style. The `@citekey` syntax supports narrative `@smith2020`, parenthetical `[@smith2020]` and several other forms (for a complete reference, see [github.com/dominik-ramik/bibtex-json-toolbox](https://github.com/dominik-ramik/bibtex-json-toolbox)).\n\nThis table can be left completely empty if you do not use bibliographic references.",
                notes: [
                    {
                        type: "warning",
                        title: "Citations vs. database shortcodes",
                        text: "The `@citekey` citation syntax is distinct from database shortcodes (see [Database Shortcodes](/author-guide/nl-content#36-table-database-shortcodes)), which use a similar `@code:ID` notation but link to external occurrence records."
                    }
                ],
                columns: {
                    bibtex: {
                        name: "BibTeX entries",
                        description: "One complete BibTeX entry per row, copied directly from a reference manager. Alternatively, enter an [F-directive](./external-text-files) (`F:references.bib` or `F:bibtex/literature.bib`) to load entries from a file in `usercontent/` at compile time. Those entries will be baked-in and if you update the BibTeX file, simply recompile to update the bibliography in the app.\n\nAll bibliographic entries will be displayed as a list in **References** in the **Side panel**. Clicking on individual citations in the text will display the corresponding full reference.",
                        howToUse: "Use direct BibTeX entries for small bibliographies. Use F-directives for larger reference lists maintained in a dedicated `.bib` file or sourced from a reference manager export.",
                        notes: [],
                        examples: [
                            {
                                label: "Direct BibTeX entry and F-directive",
                                columns: [
                                    "BibTeX entries"
                                ],
                                rows: [
                                    [
                                        "@article{smith2020, author={Smith, J.}, title={A new species}, journal={Zootaxa}, year={2020}, volume={4801}, pages={1--12}}"
                                    ],
                                    [
                                        "F:references.bib"
                                    ]
                                ]
                            },
                            {
                                text: "In your [[ref:data]] sheet, you can then cite these references with `@smith2020` or any other citekey defined in your BibTeX entries. Supposing `description` is a `markdown` field, the citation will be rendered as a clickable link.",
                                fillLeft: true,
                                fillRight: true,
                                columns: [
                                    "species",
                                    "description"
                                ],
                                rows: [
                                    [
                                        "Pilophorus smithii",
                                        "Recently split from P. examplei based on the findings of @smith2020."
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "no",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    }
                },
                data: [],
                templateData: [
                    {
                        bibtex: "@article{bauer1990, author={Bauer, Aaron M. and Vindum, Jens V.}, title={A checklist and key to the herpetofauna of New Caledonia, with remarks on biogeography}, journal={Proceedings of the California Academy of Sciences}, year={1990}, volume={47}, number={2}, pages={17--45}}"
                    },
                    {
                        bibtex: "@book{zug1993, author={Zug, George R.}, title={Herpetology: An Introductory Biology of Amphibians and Reptiles}, publisher={Academic Press}, address={San Diego}, year={1993}, isbn={978-0127826202}}"
                    },
                    {
                        bibtex: "@article{flecks2012, author={Flecks, Morris and Schmitz, Andreas and Böhme, Wolfgang and Henkel, Friedrich-Wilhelm and Ineich, Ivan}, title={A new large gecko (Squamata: Gekkonidae: {\\textit{Gehyra}}) from Vanuatu}, journal={Zootaxa}, year={2012}, volume={3425}, pages={1--20}, doi={10.11646/zootaxa.3425.1.1}}"
                    }
                ]
            },
            databaseShortcodes: {
                name: "Database shortcodes",
                required: false,
                description: "Defines custom shortcodes for embedding clickable links to external biological databases or any URL-based resource in Markdown fields. The app ships with several built-in shortcodes that are always available without any table entries:\n\n| Code | Target |\n|---|---|\n| `@gbif:ID` | GBIF occurrence record |\n| `@gbif.s:ID` | GBIF species/taxon page |\n| `@inat:ID` | iNaturalist observation |\n| `@ebird:ID` | eBird checklist |\n| `@clml:ID` | Macaulay Library asset |\n| `@obse:ID` | Observation.org record |\n\nThis table is optional. Omit it entirely if the built-in shortcodes are sufficient.\n\nShortcodes are used in data fields with `markdown` data type using the syntax `@code:ID` or `@code:Author Name:ID`.",
                notes: [
                    {
                        type: "warning",
                        text: "Database shortcodes (`@code:ID`) are distinct from bibliography citations (`@citekey`). Shortcodes link to external occurrence records; citations link to bibliography entries. Do not confuse the two syntaxes."
                    }
                ],
                columns: {
                    code: {
                        name: "Code",
                        description: "The keyword written after `@` in the shortcode syntax. Must be lowercase letters `a-z` only, with one optional dot separator (e.g. `mydb` or `mydb.type`). No digits, underscores, or hyphens. Defining a code that matches a built-in shortcode logs an info message and overwrites the built-in for that project.",
                        howToUse: "Choose a short, memorable code that reflects the database name. Use a dot separator to distinguish record types from the same source (e.g. `mydb.occurrence` and `mydb.taxon`).",
                        notes: [],
                        examples: [
                            {
                                label: "Custom shortcode codes",
                                fillRight: true,
                                columns: [
                                    "Code"
                                ],
                                rows: [
                                    [
                                        "pvnh"
                                    ],
                                    [
                                        "pvnh.type"
                                    ],
                                    [
                                        "gbif.s"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "no",
                            allowedContent: "regex",
                            regex: "^[a-z]+(\\.[a-z]+)?$",
                            regexExplanation: "only lowercase a-z with one optional dot separator",
                            supportsMultilingual: false
                        }
                    },
                    labelTemplate: {
                        name: "Label template",
                        description: "The text shown as the hyperlink label. Use `{{id}}` where the record ID should appear and optionally `{{author}}` for author attribution. The `{{author}}` placeholder is replaced by the author string followed by a space, or by an empty string if no author was provided - design the template so it reads naturally either way.",
                        howToUse: "Place `{{author}}` before a noun so the label reads naturally with or without an author: `{{author}}Herbarium record ({{id}})` or inside the parentheses: `Herbarium record ({{author}}{{id}})`.",
                        notes: [],
                        examples: [
                            {
                                label: "Label template with optional author",
                                fillRight: true,
                                columns: [
                                    "Code",
                                    "Label template"
                                ],
                                rows: [
                                    [
                                        "pvnh",
                                        "{{author}}PVNH ({{id}})"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "Must contain `{{id}}`. May also contain `{{author}}`.",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    urlTemplate: {
                        name: "URL template",
                        description: "The full URL of the target record with `{{id}}` substituted for the record identifier. Must contain `{{id}}`.",
                        howToUse: "Find the URL pattern for a record page on the target database and replace the record ID portion with `{{id}}`.",
                        notes: [],
                        examples: [
                            {
                                label: "URL template for a herbarium",
                                columns: [
                                    "Code",
                                    "Label template",
                                    "URL template"
                                ],
                                rows: [
                                    [
                                        "pvnh",
                                        "{{author}}PVNH ({{id}})",
                                        "https://symbiota.pvnh.net/collections/individual/index.php?occid={{id}}&clid=0"
                                    ]
                                ]
                            },
                            {
                                text: "In your [[ref:data]] sheet, suppose `voucherNotes` is a `markdown` field.",
                                fillLeft: true,
                                fillRight: true,
                                columns: [
                                    "species",
                                    "voucherNotes",
                                    "[comment]"
                                ],
                                rows: [
                                    [
                                        "Ficus wassa",
                                        "See atypical leaf form on @pvnh:Chanel Sam:00005183 and @pvnh:Pat Curry:00005190.",
                                        "Both @pvnh shortcodes link to specific herbarium records in the Port Vila Herbarium collection, with collector attribution for each record."
                                    ]
                                ]
                            },
                            {
                                text: "The above example would render in the app as two clickable links opening the corresponding specimen pages in the Port Vila Herbarium collection.\n\n**Displayed:** See atypical leaf form on [Chanel Sam PVNH (00005183)](https://symbiota.pvnh.net/collections/individual/index.php?occid=00005183&clid=0) and [Pat Curry PVNH (00005190)](https://symbiota.pvnh.net/collections/individual/index.php?occid=00005190&clid=0).",
                            }
                        ],
                        integrity: {
                            description: "Must contain `{{id}}` where the record identifier should be substituted.",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    }
                },
                data: [],
                templateData: [
                    {
                        code: "pvnh",
                        labelTemplate: "{{author}}PVNH ({{id}})",
                        urlTemplate: "https://symbiota.pvnh.net/collections/individual/index.php?occid={{id}}&clid=0"
                    }
                ]
            },
            dwcArchive: {
                name: "DwC archive",
                required: false,
                description: "Configures export in Darwin Core Archive (DwC-A) format for submission to [GBIF](https://www.gbif.org/) and other biodiversity aggregators. Each row maps one DwC term to a value source. The compiler produces a checklist archive (`taxa_dwca.zip`) and, when `basisOfRecord` is configured, an additional occurrence archive (`occurrences_dwca.zip`). See [Darwin Core Archive export](/author-guide/dwc) for the full feature guide, required and recommended terms, EML metadata configuration, and a worked example.",
                notes: [
                    {
                        type: "warning",
                        title: "Experiment on living material in progress",
                        text: "The DwC-A export feature is currently experimental and in early testing. It has been succesfully tested to be compliant with GBIF's DwC-A requirements on simple datasets, but we encourage you to verify the exported data against your database to ensure there are no surprises. Contact the developers on [GitHub](https://github.com/dominik-ramik/naturalist/) if you encounter any issues."
                    }
                ],
                columns: {
                    term: {
                        name: "DwC term",
                        description: "The Darwin Core term name (camelCase, e.g. `decimalLatitude`), or an `eml:` prefixed field path (e.g. `eml:title`) for EML metadata fields.",
                        howToUse: "Use standard DwC camelCase term names. Use the `eml:` prefix for EML metadata fields. See [EML metadata](/author-guide/dwc#eml-metadata) for the full list of supported `eml:` terms.",
                        notes: [],
                        examples: [],
                        integrity: {
                            allowEmpty: false,
                            allowDuplicates: "no",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    sourceColumn: {
                        name: "Source column",
                        description: "A directive that tells the compiler where to read the value for this DwC term. Leave empty if supplying a **Constant value** instead.\n\nAccepted directive types:\n\n- **Plain column name** (e.g. `recordedBy`) - reads that column's value for each row. For compound data types, append a component key: `collectionDate.ymd`, `location.lat`, `altitude.from`, `specimenPhoto.source`\n- **`{col}` template** (e.g. `{collector} leg. | {observer} obs.`) - constructs a string from column values; `|` separates fallback alternatives, the first segment where all placeholders are non-empty is used\n- **`config:Item Name`** - reads a value from the [[ref:appearance.customization]] table (e.g. `config:Checklist name`)\n- **`taxa:ColumnName`** or **`taxa:ColumnName.component`** - reads from the taxon hierarchy (e.g. `taxa:Species`, `taxa:Species.authority`, `taxa:Species.lastNamePart`)\n- **`auto:termName`** - instructs the compiler to generate the value; see [Source column directives](/author-guide/dwc#source-column-directives) for all supported keys including `auto:taxonID`, `auto:taxonRank`, `auto:scientificName`, and others\n- **`media:path1, path2, …`** - for `associatedMedia` only; collects fully resolved URLs from image, sound, or map columns and joins them with ` | `; append `#` to expand array columns automatically (e.g. `lifePhotos#`)\n\nFor the full directive reference with all options and examples, see [Source column directives](/author-guide/dwc#source-column-directives).",
                        howToUse: "Leave empty when supplying a Constant value. For taxonomy, prefer `auto:` directives. For dataset-wide metadata already in the [[ref:appearance.customization]], use `config:`. For occurrence-specific data columns, use plain column names or component keys.",
                        notes: [],
                        examples: [
                            {
                                label: "Common directive patterns",
                                fillRight: true,
                                columns: [
                                    "DwC term",
                                    "Source column",
                                    "[comment]"
                                ],
                                rows: [
                                    ["datasetName", "config:Checklist name", "config: directive"],
                                    ["scientificName", "auto:scientificName", "auto: directive"],
                                    ["taxonRank", "auto:taxonRank", "auto: directive"],
                                    ["family", "taxa:Family", "taxa: directive"],
                                    ["specificEpithet", "taxa:Species.lastNamePart", "taxa: directive with component"],
                                    ["recordedBy", "collector", "plain column name"],
                                    ["decimalLatitude", "location.lat", "plain column name with component"],
                                    ["eventDate", "collectionDate.ymd", "plain column name with component"],
                                    ["recordedBy", "{collector} leg. | {observer} obs.", "{} template with fallback"],
                                    ["associatedMedia", "media:specimenPhoto, lifePhotos#", "media: directive"]
                                ]
                            }
                        ],
                        integrity: {
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    constantValue: {
                        name: "Constant value",
                        description: "A literal string applied to every record. Leave empty if using Source column.",
                        howToUse: "Use for dataset-wide values that do not vary per row: `language`, `institutionCode`, `license`, `basisOfRecord`, `kingdom`, etc. The `license` field accepts common aliases (`cc0`, `cc by 4.0`, `cc by-nc 4.0`) which are normalised to the canonical GBIF-accepted URI.",
                        notes: [],
                        examples: [
                            {
                                label: "Common constant value rows",
                                fillRight: true,
                                columns: [
                                    "DwC term",
                                    "Constant value"
                                ],
                                rows: [
                                    ["language", "en"],
                                    ["institutionCode", "MNHN"],
                                    ["license", "cc by 4.0"],
                                    ["basisOfRecord", "PreservedSpecimen"],
                                    ["kingdom", "Plantae"]
                                ]
                            }
                        ],
                        integrity: {
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    }
                },
                data: [],
                templateData: [
                    {
                        term: "language",
                        sourceColumn: "",
                        constantValue: "en"
                    },
                    {
                        term: "institutionCode",
                        sourceColumn: "",
                        constantValue: "VANUHERP"
                    },
                    {
                        term: "collectionCode",
                        sourceColumn: "",
                        constantValue: "VANUATU-CHECKLIST"
                    },
                    {
                        term: "license",
                        sourceColumn: "",
                        constantValue: "https://creativecommons.org/licenses/by/4.0/legalcode"
                    },
                    {
                        term: "datasetName",
                        sourceColumn: "config:Checklist name",
                        constantValue: ""
                    },
                    {
                        term: "eml:title",
                        sourceColumn: "config:Checklist name",
                        constantValue: ""
                    },
                    {
                        term: "eml:abstract",
                        sourceColumn: "config:About section",
                        constantValue: ""
                    },
                    {
                        term: "eml:creator.organizationName",
                        sourceColumn: "",
                        constantValue: "Example Natural History Museum"
                    },
                    {
                        term: "eml:creator.givenName",
                        sourceColumn: "",
                        constantValue: "Jane"
                    },
                    {
                        term: "eml:creator.surName",
                        sourceColumn: "",
                        constantValue: "Smith"
                    },
                    {
                        term: "eml:creator.email",
                        sourceColumn: "",
                        constantValue: "j.smith@example.com"
                    },
                    {
                        term: "taxonID",
                        sourceColumn: "auto:taxonID",
                        constantValue: ""
                    },
                    {
                        term: "parentNameUsageID",
                        sourceColumn: "auto:parentNameUsageID",
                        constantValue: ""
                    },
                    {
                        term: "taxonRank",
                        sourceColumn: "auto:taxonRank",
                        constantValue: ""
                    },
                    {
                        term: "scientificName",
                        sourceColumn: "auto:scientificName",
                        constantValue: ""
                    },
                    {
                        term: "scientificNameAuthorship",
                        sourceColumn: "auto:scientificNameAuthorship",
                        constantValue: ""
                    },
                    {
                        term: "kingdom",
                        sourceColumn: "",
                        constantValue: "Animalia"
                    },
                    {
                        term: "class",
                        sourceColumn: "taxa:Class",
                        constantValue: ""
                    },
                    {
                        term: "order",
                        sourceColumn: "taxa:Order",
                        constantValue: ""
                    },
                    {
                        term: "family",
                        sourceColumn: "taxa:Family",
                        constantValue: ""
                    },
                    {
                        term: "genus",
                        sourceColumn: "taxa:Genus",
                        constantValue: ""
                    },
                    {
                        term: "specificEpithet",
                        sourceColumn: "taxa:Species.lastNamePart",
                        constantValue: ""
                    },
                ]
            }
        }
    },
    appearance: {
        name: "nl_appearance",
        required: false,
        description: "The `nl_appearance` sheet controls global appearance, language settings, and other visual configuration as well as your project's identity.",
        notes: [
        ],
        type: "meta",
        tables: {
            customization: {
                name: "Customization",
                required: false,
                description: "A fixed set of named configuration items. The **Item** column contains predefined keywords, case-sensitive; you only edit the **Value** column (or `Value:en`, `Value:fr`, etc. for per-language overrides in multilingual projects). Skip any items you are happy with at their default. Typically you will want to fill in at least **Checklist name** and **About section**.",
                notes: [],
                columns: {
                    item: {
                        name: "Item",
                        description: "Predefined keywords, each controlling one aspect of the app. See the overview table below for the full list, defaults, and expected value format.",
                        howToUse: "Enter only the rows you want to change from their defaults. Copy the item name exactly as shown - item names are case-sensitive.",
                        notes: [],
                        examples: [
                            {
                                label: "Customization table overview",
                                columns: [
                                    "Item",
                                    "Default",
                                    "Value format"
                                ],
                                rows: [
                                    [
                                        "Checklist name",
                                        "New project",
                                        "Short project name shown in the app header."
                                    ],
                                    [
                                        "About section",
                                        "(generic placeholder text)",
                                        "Markdown text for the About page, or for longer texts an F-directive (`F:about.md`) pointing to a file in `usercontent/`. Supports `Value:en`, `Value:fr`, etc. See [External text files](./external-text-files)."
                                    ],
                                    [
                                        "How to cite",
                                        "(empty)",
                                        "Plain text or Markdown citation string shown to users in the About page."
                                    ],
                                    [
                                        "Data sheets names",
                                        "checklist",
                                        "Comma-separated list of [[ref:data]] sheets names, only needed if you have renamed the tab away from the default `checklist` or if you have multiple data sheets."
                                    ],
                                    [
                                        "Color theme hue",
                                        "212",
                                        "Integer 0-360. Use an online HSL picker (e.g. [hslpicker.com](https://hslpicker.com)) to find your hue."
                                    ],
                                    [
                                        "Date format",
                                        "YYYY-MM-DD",
                                        "[day.js format string](https://day.js.org/docs/en/display/format), e.g. `MMM D, YYYY` or `DD/MM/YYYY` etc."
                                    ],
                                    [
                                        "Month names",
                                        "English months",
                                        "Comma-separated list of exactly 12 month names starting with January, e.g. `Janvier, Février, Mars, ...`."
                                    ],
                                    [
                                        "Precache max file size",
                                        "0.5",
                                        "Maximum size in MB of a single media file to cache for offline use."
                                    ],
                                    [
                                        "Precache max total size",
                                        "200",
                                        "Maximum total size in MB of all precached media assets."
                                    ],
                                    [
                                        "Eml.xml location",
                                        "(empty)",
                                        "Path to a custom DwC-A EML metadata file inside `usercontent/`, including filename (e.g. `dwc/eml.xml`)."
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowDuplicates: "no",
                            allowEmpty: false,
                            allowedContent: "list",
                            listItems: [
                                "Checklist name",
                                "About section",
                                "How to cite",
                                "[[ref:data]] sheets names",
                                "Color theme hue",
                                "Date format",
                                "Month names",
                                "Precache max file size",
                                "Precache max total size",
                                "Eml.xml location"
                            ],
                            supportsMultilingual: false
                        }
                    },
                    value: {
                        name: "Value",
                        description: "The configured value for the item on the same row. See the **Item** overview table for the expected format and default of each item. Supports multilingual column suffixes for settings that are per-language (`Value:en`, `Value:fr`, etc.).",
                        howToUse: "Fill in only the items you need to change from their defaults. Leave the **Value** cell empty for items you are happy with at their default.",
                        notes: [],
                        examples: [
                            {
                                label: "Bilingual customization values",
                                columns: [
                                    "Item",
                                    "Value:en",
                                    "Value:fr"
                                ],
                                rows: [
                                    [
                                        "Checklist name",
                                        "Birds of Lamèque Island",
                                        "Oiseaux de l'Île-de-Lamèque"
                                    ],
                                    [
                                        "About section",
                                        "This checklist is a collaborative effort of ...",
                                        "Cette liste de contrôle est un effort collaboratif de ..."
                                    ],
                                    [
                                        "How to cite",
                                        "Birds of Lamèque Island checklist. Author: Anicet Paulin (2024). https://example.com/lameque-checklist",
                                        "Liste des oiseaux de l'Île-de-Lamèque. Auteur : Anicet Paulin (2024). https://example.com/lameque-checklist"
                                    ],
                                    [
                                        "Date format",
                                        "MMM D, YYYY",
                                        "DD/MM/YYYY"
                                    ],
                                    [
                                        "Color theme hue",
                                        "200",
                                        "97"
                                    ],
                                    [
                                        "Data sheets names",
                                        "landbirds, seabirds",
                                        "landbirds, seabirds"
                                    ],
                                    [
                                        "Month names",
                                        "January, February, March, April, May, June, July, August, September, October, November, December",
                                        "Janvier, Février, Mars, Avril, Mai, Juin, Juillet, Août, Septembre, Octobre, Novembre, Décembre"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowDuplicates: "yes",
                            allowEmpty: true,
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    }
                },
                data: [],
                templateData: [
                    {
                        item: "Checklist name",
                        value: "Sample NaturaList checklist"
                    },
                    {
                        item: "About section",
                        value: "This is a simple template checklist. Visit [naturalist.netlify.app](https://naturalist.netlify.app/) for comprehensive examples how to configure this spreadsheet to create rich taxonomic checklists or full-fledged biodiversity databases with taxonomy and specimens or other occurrences.\n\nThe values in this template are there only to get you started. Feel free to modify them and add your own, neither the taxonomic ranks nor the specific custom data are set in stone."
                    },
                    {
                        item: "How to cite",
                        value: "Sample NaturaList checklist. Author: Dominik M. Ramík (2024). https://naturalist.netlify.app/"
                    }
                ]
            },
            dataCodes: {
                name: "Data codes",
                required: false,
                description: "Translates short codes or controlled vocabulary items entered in the [[ref:data]] sheet into human-readable labels. When the app reads a value from a coded column, it replaces it with the full label before displaying. Category matching ([[ref:appearance.categories]] table)  then operates on the replacement text, not the original code.\n\nThis table can be left completely empty if your [[ref:data]] sheet already contains the display labels you want to show, but is useful when you want to simplify data entry of e.g. Red List codes, habitat codes, Darwin Core or any other standard vocabulary.",
                notes: [
                    {
                        type: "warning",
                        text: "If a value appears in the [[ref:data]] sheet column but has no matching row in the Data Codes table, the app displays the raw value unchanged. Codes are matched exactly and case-sensitively."
                    }
                ],
                columns: {
                    columnName: {
                        name: "Column name",
                        description: "The [data path](./data-sheet#column-naming-and-data-paths) of the column whose values should be translated. Each distinct value in that column needs its own row, all sharing the same **Column name** entry.",
                        howToUse: "Use whenever your [[ref:data]] sheet stores compact codes (like `LC`, `EN`, `N`, `E`) and you want to display full labels instead. If you plan to export your data into [DwC-A format](./dwc) (also see [[ref:content.dwcArchive]]), enter the controlled vocabularies of DwC terms into your data and use this table to translate them for displaying their human-readable labels.",
                        notes: [],
                        examples: [
                            {
                                label: "Red List code translations",
                                text: "A multilingual example. If you only have one language, just use the **Replacement** column without any language suffix.",
                                columns: [
                                    "Column name",
                                    "Code",
                                    "Replacement:en",
                                    "Replacement:fr"
                                ],
                                rows: [
                                    [
                                        "redlist",
                                        "LC",
                                        "Least Concern",
                                        "Préoccupation mineure"
                                    ],
                                    [
                                        "redlist",
                                        "EN",
                                        "Endangered",
                                        "En danger"
                                    ],
                                    [
                                        "redlist",
                                        "CR",
                                        "Critically Endangered",
                                        "En danger critique"
                                    ],
                                    [
                                        "presenceStatus",
                                        "E",
                                        "Endemic",
                                        "Endémique"
                                    ],
                                    [
                                        "presenceStatus",
                                        "N",
                                        "Native",
                                        "indigène"
                                    ],
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "dataPath",
                            supportsMultilingual: false
                        }
                    },
                    code: {
                        name: "Code",
                        description: "The raw value as it appears in the [[ref:data]] sheet. Matched exactly and case-sensitively against data cell content.",
                        howToUse: "",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    replacement: {
                        name: "Replacement",
                        description: "The human-readable text to display instead of the raw code. For multilingual projects, add one `Replacement:langcode` column per language.",
                        howToUse: "",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    }
                },
                data: [],
                templateData: [
                    {
                        columnName: "redlist",
                        code: "LC",
                        replacement: "Least Concern"
                    },
                    {
                        columnName: "redlist",
                        code: "CR",
                        replacement: "Critically Endangered"
                    },
                    {
                        columnName: "redlist",
                        code: "EN",
                        replacement: "Endangered"
                    },
                    {
                        columnName: "redlist",
                        code: "NT",
                        replacement: "Near Threatened"
                    },
                    {
                        columnName: "redlist",
                        code: "VU",
                        replacement: "Vulnerable"
                    },
                    {
                        columnName: "redlist",
                        code: "DD",
                        replacement: "Data Deficient"
                    },
                    {
                        columnName: "redlist",
                        code: "NE",
                        replacement: "Not Evaluated"
                    },
                    {
                        columnName: "status",
                        code: "N",
                        replacement: "Native"
                    },
                    {
                        columnName: "status",
                        code: "E",
                        replacement: "Endemic"
                    },
                    {
                        columnName: "status",
                        code: "NE",
                        replacement: "Near-endemic"
                    },
                    {
                        columnName: "status",
                        code: "I",
                        replacement: "Introduced"
                    },
                    {
                        columnName: "status",
                        code: "R",
                        replacement: "Rare / Vagrant"
                    },
                    {
                        columnName: "status",
                        code: "U",
                        replacement: "Unknown"
                    }
                ]
            },
            categories: {
                name: "Colored categories",
                required: false,
                description: "Gives categorical data values (see [[ref:type.category]]) a coloured pill/badge appearance instead of plain text. Each row defines one value-to-colour mapping for one column. Typically used for Red List categories, presence/origin status, life-form codes, and similar small fixed-vocabulary fields that are better scanned visually by color than being read as text.\n\nThe [[ref:content.customDataDefinition.formatting]] column in [[ref:content.customDataDefinition]] table must be set to `category` for this table to take effect. Category matching is case-insensitive and is controlled by the **Contains text** pattern (see that column for full syntax). Matching is applied after any [[ref:appearance.dataCodes]] replacement.\n\nThis table can be left completely empty - it is valid to use `category` data type without any entries here; the data will display as plain text but still use the categorical filter.",
                notes: [
                    {
                        type: "warning",
                        text: "Setting the data type to `category` in [[ref:content.customDataDefinition]] alone does nothing visual - you must also populate this table with colour definitions for each value."
                    }
                ],
                columns: {
                    columnName: {
                        name: "Column name",
                        description: "The data path of the column whose values should be styled as coloured categories. Each distinct value (or group of values matched by **Contains text**) requires its own row, all sharing the same **Column name**.",
                        howToUse: "Enter the same column name as used in [[ref:content.customDataDefinition]] table (with `category` data type).",
                        notes: [],
                        examples: [
                            {
                                label: "Habit and Red List categories",
                                text: "Suppose you have multiple habits (`habit#` ... would be `habit1`, `habit2`, etc. in [[ref:data]] sheet) and Red List status (`redlist`) columns in your data. Both `habit#` and `redlist` would have `category` data type in [[ref:content.customDataDefinition]].",
                                columns: [
                                    "Column name",
                                    "Contains text",
                                    "Background color",
                                    "Text color",
                                    "[comment]"
                                ],
                                rows: [
                                    [
                                        "habit#",
                                        "*tree*",
                                        "#668dbb",
                                        "white",
                                        "Matches any value starting with 'tree', e.g. 'tree', 'treelet', 'epiphytic tree'"
                                    ],
                                    [
                                        "habit#",
                                        "shrub",
                                        "#5e9f5c",
                                        "white",
                                        "¨Matches 'shrub' exactly"
                                    ],
                                    [
                                        "redlist",
                                        "Endangered",
                                        "#cd6630",
                                        "#ffcd9a",
                                        "Matches 'Endangered' exactly, if you use [[ref:appearance.dataCodes]] to translate 'EN' to 'Endangered' in the data, the category matcher operates on the translated value 'Endangered' not the original code 'EN'"
                                    ],
                                    [
                                        "redlist",
                                        "Least Concern",
                                        "#006666",
                                        "white",
                                        "Matches 'Least Concern' exactly"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "dataPath",
                            supportsMultilingual: false
                        }
                    },
                    containsText: {
                        name: "Contains text",
                        description: "The pattern to match against the data value (after any [[ref:appearance.dataCodes]] replacement). Matching is always case-insensitive. The `*` character is the only wildcard and matches any sequence of characters (including none). A pattern with no `*` must match the entire cell value exactly. Rows are tested in order and the first match wins.",
                        howToUse: "Use a plain string for an exact match (`Endemic` matches only `Endemic`). Prefix and/or suffix with `*` to allow partial matches (`*Endemic*` matches `Near-endemic` and `Endemic`; `Endemic*` matches `Endemic` and `Endemically`). Place a bare `*` as the last row in a column's entries to provide a catch-all fallback that styles any value not matched by earlier rows.",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "Case-insensitive match. No `*`: full equality (`Endemic` matches only `Endemic`). With `*`: wildcard match (`*Endemic*` also matches `Near-endemic`; `*` matches anything).",
                            allowEmpty: false,
                            allowDuplicates: "no",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    backgroundColor: {
                        name: "Background color",
                        description: "CSS colour for the category badge background. Accepts any valid CSS colour notation: named colours (`green`), hex (`#5e9f5c`), RGB, HSL, etc. Leave empty for a transparent background.",
                        howToUse: "Choose a colour that provides sufficient contrast with the text colour for readability.",
                        notes: [],
                        examples: [],
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
                        description: "CSS colour for the category badge text. Leave empty to default to black.",
                        howToUse: "Use `white` or bright colors for dark backgrounds and `black` or dark colors for light backgrounds.",
                        notes: [],
                        examples: [],
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
                        description: "CSS colour for the category badge border. Leave empty to use the default border. Set to the same colour as the background to produce a borderless badge.",
                        howToUse: "Omit for most categories. Use to add a subtle outline when the badge background is close in hue to the surrounding page background.",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            defaultValue: "black",
                            allowedContent: "cssColor",
                            supportsMultilingual: false
                        }
                    }
                },
                data: [],
                templateData: [
                    {
                        columnName: "redlist",
                        containsText: "Least Concern",
                        backgroundColor: "#006666",
                        textColor: "white"
                    },
                    {
                        columnName: "redlist",
                        containsText: "Critically Endangered",
                        backgroundColor: "#cd3030",
                        textColor: "#ffcdcd"
                    },
                    {
                        columnName: "redlist",
                        containsText: "Endangered",
                        backgroundColor: "#cd6630",
                        textColor: "#ffcd9a"
                    },
                    {
                        columnName: "redlist",
                        containsText: "Near Threatened",
                        backgroundColor: "#006666",
                        textColor: "#9acd9a"
                    },
                    {
                        columnName: "redlist",
                        containsText: "Vulnerable",
                        backgroundColor: "#cd9a00",
                        textColor: "#ffffcd"
                    },
                    {
                        columnName: "redlist",
                        containsText: "Data Deficient",
                        backgroundColor: "gray",
                        textColor: "white"
                    },
                    {
                        columnName: "redlist",
                        containsText: "Conservation Dependent",
                        backgroundColor: "#006666",
                        textColor: "white"
                    },
                    {
                        columnName: "redlist",
                        containsText: "Not Evaluated",
                        backgroundColor: "gray",
                        textColor: "white"
                    },
                    {
                        columnName: "redlist",
                        containsText: "LR/lc",
                        backgroundColor: "#006666",
                        textColor: "white"
                    },
                    {
                        columnName: "status",
                        containsText: "Native",
                        backgroundColor: "#668dbb",
                        textColor: "white"
                    },
                    {
                        columnName: "status",
                        containsText: "Endemic",
                        backgroundColor: "#5e9f5c",
                        textColor: "white"
                    },
                    {
                        columnName: "status",
                        containsText: "Near-endemic",
                        backgroundColor: "#428f3f",
                        textColor: "white"
                    },
                    {
                        columnName: "status",
                        containsText: "Introduced",
                        backgroundColor: "#ed665b",
                        textColor: "white"
                    },
                    {
                        columnName: "status",
                        containsText: "Rare / Vagrant",
                        backgroundColor: "orange",
                        textColor: "white"
                    },
                    {
                        columnName: "status",
                        containsText: "Unknown",
                        backgroundColor: "gray",
                        textColor: "white"
                    }
                ]
            },
            mapRegionsNames: {
                name: "Map regions information",
                required: false,
                description: "Defines the human-readable name for each geographic region code used in `mapregions` data columns. Every region code that appears in your data must have a matching entry here, or a compile-time error is logged.\n\nThis table can be left completely empty if you do not use region maps.",
                notes: [
                    {
                        type: "warning",
                        text: "Region codes must be all-lowercase letters (`a-z`) only - no digits, hyphens, or underscores. Every code that appears in any `mapregions` data column must have a row here."
                    }
                ],
                columns: {
                    code: {
                        name: "Region code",
                        description: "The short code identifying this geographic region, matching the codes used in `mapregions` data columns. Must be all-lowercase letters (`a-z`) only - no digits, hyphens, or spaces.",
                        howToUse: "Use the same codes as in your [[ref:data]] sheet `mapregions` cells. Conventional ISO 3166-1 alpha-2 country codes (e.g. `fr`, `de`, `gb`) work well for country-level maps.",
                        notes: [],
                        examples: [
                            {
                                label: "European region codes",
                                columns: [
                                    "Region code",
                                    "Region name"
                                ],
                                rows: [
                                    [
                                        "fr",
                                        "France"
                                    ],
                                    [
                                        "de",
                                        "Germany"
                                    ],
                                    [
                                        "gb",
                                        "United Kingdom"
                                    ],
                                    [
                                        "es",
                                        "Spain"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "no",
                            defaultValue: "",
                            allowedContent: "regex",
                            regex: "^[a-z]+$",
                            regexExplanation: "only lowercase letters a-z",
                            supportsMultilingual: false
                        }
                    },
                    name: {
                        name: "Region name",
                        description: "The human-readable name for this region, shown in the UI and in the inline text list on taxon cards. Supports multilingual variants (`Region name:en`, `Region name:fr`).",
                        howToUse: "Add multilingual variants (`Region name:en`, `Region name:fr`) for translated place names.",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    }
                }
            },
            mapRegionsLegend: {
                name: "Map regions legend",
                required: false,
                description: "Configures the colour, legend label, and scale behaviour for every status value or numeric anchor used in `mapregions` data columns. Three modes are supported and can be combined freely within the same column:\n\n- **Category** (default): one row per distinct status string. Each maps to a fixed colour.\n- **Gradient**: two or more anchor rows with `gradient` legend type. Colours are smoothly interpolated between anchors based on numeric data values.\n- **Stepped**: like gradient but colour assignment is discrete - each value snaps to the colour of the highest anchor it does not exceed.\n\nModes can coexist in the same column: add categorical override rows alongside gradient or stepped anchor rows. The engine always tries an exact string match first; numeric anchor interpolation is the fallback.\n\nBy default, rows without a **Column name** apply to every `mapregions` column in the project. Fill **Column name** to restrict a row to one specific map column, enabling different colour schemes per map.\n\nFor dynamic anchor notations (A2-A5), the 'dataset' is the set of all numeric status values present in the *current taxon's* mapregions data for the given column - so each taxon has its own independent colour scale.\n\nThis table can be left completely empty if you do not use region maps.",
                notes: [
                    {
                        type: "tip",
                        text: "See [Appearance & Branding → Map Regions Legend](/author-guide/nl-appearance#46-table-map-regions-legend) for the full anchor notation reference (A1-A5) and eleven configuration examples covering every mode and combination."
                    }
                ],
                columns: {
                    columnName: {
                        name: "Column name",
                        description: "Restricts this legend row to a specific `mapregions` data column. Enter the exact data path as declared in the Custom data definition table (e.g. `map`, `map.europe`, `distribution`). Leave empty to apply the row globally to every `mapregions` column. The compound pair of **Column name** and **Status code** must be unique across the table - the same Status code may appear on multiple rows provided each row names a different column.",
                        howToUse: "Leave empty for projects with a single map or with several maps sharing the same colour logic. Fill in when different map columns require different colour schemes or gradient definitions.",
                        notes: [],
                        examples: [
                            {
                                label: "Two independent gradients scoped to different columns",
                                columns: [
                                    "Column name",
                                    "Status code",
                                    "Fill color",
                                    "Legend",
                                    "Legend type"
                                ],
                                rows: [
                                    [
                                        "map.world",
                                        "0%",
                                        "#f7fbff",
                                        "Very rare",
                                        "gradient"
                                    ],
                                    [
                                        "map.world",
                                        "100%",
                                        "#08306b",
                                        "Well documented",
                                        "gradient"
                                    ],
                                    [
                                        "map.country",
                                        "-2s",
                                        "#d73027",
                                        "Low effort",
                                        "gradient"
                                    ],
                                    [
                                        "map.country",
                                        "2s",
                                        "#1a9641",
                                        "High effort",
                                        "gradient"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            defaultValue: "",
                            allowedContent: "dataPath",
                            supportsMultilingual: false
                        }
                    },
                    status: {
                        name: "Status code",
                        description: "The status value or anchor position for this row. Interpretation depends on **Legend type**.\n\n**For `category` rows** (Legend type empty or `category`): a plain text string matched exactly against the data cell content (e.g. `native`, `introduced`, `ND`). Leave empty to define the **global fallback** - any region whose value matches no other row receives this colour.\n\n**For `gradient` and `stepped` rows**: an anchor position in one of five notations (A1-A5). All data cells for the column must contain parseable numbers.\n\n- **A1 - Raw value**: a plain integer or decimal (e.g. `7.6`, `0`, `-5`). Anchor sits at that absolute value. Use for data with meaningful fixed thresholds (pH, temperature, concentration).\n- **A2 - Percentage of range**: a number followed by `%` (e.g. `0%`, `50%`, `100%`). Resolves linearly between dataset minimum (0%) and maximum (100%). Use when relative position matters more than absolute value.\n- **A3 - Percentile**: a number followed by `p` (e.g. `25p`, `75p`, `2.5p`). Resolves to that percentile of the data distribution. Use to highlight distributional extremes regardless of absolute scale.\n- **A4 - Standard deviation**: a number followed by `s` (e.g. `-2s`, `0s`, `1.5s`). Resolves to that many standard deviations from the dataset mean. Use to visualise statistical outliers.\n- **A5 - Centered / diverging**: syntax `[±magnitude][modifier]c[centerValue]`. Creates a scale diverging from a declared center point. Modifier is `%` (percentage of max distance from center), `s` (σ units), or absent (raw units). Examples: `-100%c0`, `50%c14`, `-2sc28`. Use for diverging colour schemes anchored to an ecologically meaningful midpoint.\n\nA1-A5 may be mixed freely. Anchors outside the data range are valid; values beyond the outermost anchor clamp to that anchor's colour.",
                        howToUse: "For simple categorical maps, enter the status strings used in your data. For numeric data, choose the anchor notation that best matches the data's nature and the intended visual communication.",
                        notes: [],
                        examples: [
                            {
                                label: "Categorical statuses",
                                columns: [
                                    "Status code",
                                    "Fill color",
                                    "Legend",
                                    "Legend type"
                                ],
                                rows: [
                                    [
                                        "native",
                                        "#1a9641",
                                        "Native",
                                        ""
                                    ],
                                    [
                                        "introduced",
                                        "#d73027",
                                        "Introduced",
                                        ""
                                    ],
                                    [
                                        "",
                                        "#aaaaaa",
                                        "Not assessed",
                                        ""
                                    ]
                                ]
                            },
                            {
                                label: "A2 gradient (adaptive scale)",
                                columns: [
                                    "Status code",
                                    "Fill color",
                                    "Legend",
                                    "Legend type"
                                ],
                                rows: [
                                    [
                                        "0%",
                                        "#f7fbff",
                                        "Rare",
                                        "gradient"
                                    ],
                                    [
                                        "50%",
                                        "#6baed6",
                                        "Moderate",
                                        "gradient"
                                    ],
                                    [
                                        "100%",
                                        "#08306b",
                                        "Abundant",
                                        "gradient"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "The compound pair (Column name, Status code) must be unique across the table.",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            defaultValue: "",
                            allowedContent: "any",
                            supportsMultilingual: false,
                            readPercentageNumbersAsPercentageString: true
                        }
                    },
                    fillColor: {
                        name: "Fill color",
                        description: "The colour applied to matching regions on the SVG map and to the legend swatch. For `category` rows this is a fixed colour. For `gradient` rows it is the colour at this anchor point, with colours between anchors smoothly interpolated. For `stepped` rows it is the colour of the bin whose threshold begins at this anchor.",
                        howToUse: "Choose perceptually distinct and accessible colours. For gradients, use a sequential or diverging ramp that communicates the data direction clearly.",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "cssColor",
                            supportsMultilingual: false
                        }
                    },
                    legend: {
                        name: "Legend",
                        description: "Label shown for this row in the map legend. For `category` rows this label is always displayed. For `gradient` and `stepped` rows, only rows with a non-empty Legend value appear in the legend - you can define intermediate anchor rows without cluttering the legend by leaving their Legend cells empty.\n\nSupports multilingual variants: `Legend:en`, `Legend:fr`, etc.",
                        howToUse: "Label the outermost anchors and any semantically important midpoints (e.g. `Low`, `Median`, `High`). Leave intermediate gradient anchors unlabelled to keep the legend clean.",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    },
                    appendedLegend: {
                        name: "Appended legend",
                        description: "Text appended directly after the region name in the inline text list on the taxon card (visible when placement is not `details`). For example, a status `introduced` with Appended legend `introduced` produces `Germany *(introduced)*`. Supports Markdown.\n\nOnly meaningful for `category` rows - for `gradient` and `stepped` rows this field is ignored, as the raw data value is shown instead of a dynamically computed label.\n\nSupports multilingual variants.",
                        howToUse: "Use for categorical status values where the status name adds meaningful context to the region name in the inline list. Leave empty when the region name alone is sufficient.",
                        notes: [],
                        examples: [
                            {
                                label: "Breeding atlas with appended status",
                                columns: [
                                    "Status code",
                                    "Fill color",
                                    "Legend",
                                    "Appended legend",
                                    "Legend type"
                                ],
                                rows: [
                                    [
                                        "c",
                                        "#1a9641",
                                        "Confirmed breeding",
                                        "confirmed breeding",
                                        ""
                                    ],
                                    [
                                        "p",
                                        "#a6d96a",
                                        "Probable breeding",
                                        "probable breeding",
                                        ""
                                    ],
                                    [
                                        "v",
                                        "#636363",
                                        "Vagrant",
                                        "vagrant",
                                        ""
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    },
                    legendType: {
                        name: "Legend type",
                        description: "Controls how this row is interpreted by the rendering engine.\n\n- **Empty or `category`**: the Status code is a plain text string matched exactly against data cell content. The Fill color is applied directly to any matching region. This covers simple presence/absence, named statuses, and categorical override rows mixed into a gradient/stepped column.\n- **`gradient`**: the Status code is an anchor position (A1-A5 notation). Colours are smoothly interpolated between adjacent anchors. Requires at least two `gradient` rows for the same column. Use for continuous data (population density, temperature, index values).\n- **`stepped`**: the Status code is an anchor position (A1-A5 notation). A value falls into the bin whose anchor is the highest anchor not exceeding the value - equivalent to histogram binning. No colour blending. Use for crisp colour bands at defined thresholds (abundance classes, IUCN criterion scores).\n\nFor a **mixed** column (e.g. a gradient with a categorical exception for 'No Data'), define the gradient anchors with `gradient` and the exception row with empty/`category`. The engine always checks for an exact categorical string match first; numeric anchor interpolation is the fallback.",
                        howToUse: "Use `category` (or empty) for named status values. Use `gradient` for continuous numeric data. Use `stepped` for numeric data best communicated as discrete bins.",
                        notes: [],
                        examples: [
                            {
                                label: "Mixed column: gradient with categorical overrides",
                                columns: [
                                    "Status code",
                                    "Fill color",
                                    "Legend",
                                    "Appended legend",
                                    "Legend type"
                                ],
                                rows: [
                                    [
                                        "0%",
                                        "#d7191c",
                                        "Bare / sparse",
                                        "",
                                        "gradient"
                                    ],
                                    [
                                        "100%",
                                        "#1a9641",
                                        "Dense vegetation",
                                        "",
                                        "gradient"
                                    ],
                                    [
                                        "ND",
                                        "#aaaaaa",
                                        "No satellite data",
                                        "",
                                        ""
                                    ],
                                    [
                                        "FL",
                                        "#000000",
                                        "Fire loss",
                                        "destroyed by fire",
                                        ""
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            defaultValue: "category",
                            allowedContent: "list",
                            listItems: [
                                "",
                                "category",
                                "gradient",
                                "stepped"
                            ],
                            supportsMultilingual: false
                        }
                    }
                }
            },
            searchOrder: {
                name: "Search category custom order",
                required: false,
                description: "Overrides the default alphabetical ordering of filter values in the sidebar filter dropdowns. Items appear in the filter in the order they appear in this table. Any data value not listed here is appended alphabetically after the explicitly ordered values.\n\nA typical use case is the Red List category, where severity order (Critically Endangered → Endangered → Vulnerable…) is more meaningful than alphabetical. Another is a topmost taxonomic group where you want prominent categories to appear first.\n\nThis table can be left completely empty if alphabetical ordering is acceptable for all your filters.",
                notes: [],
                columns: {
                    columnName: {
                        name: "Column name",
                        description: "The data path of the filtered column whose values should be reordered. Must match a column that has a **Search category title** set in the Custom data definition table.",
                        howToUse: "Enter the column name exactly as it appears in the Custom data definition table.",
                        notes: [],
                        examples: [
                            {
                                label: "Red List in severity order",
                                columns: [
                                    "Column name",
                                    "Group title",
                                    "Values ordered"
                                ],
                                rows: [
                                    [
                                        "redlist",
                                        "",
                                        "Critically Endangered"
                                    ],
                                    [
                                        "redlist",
                                        "",
                                        "Endangered"
                                    ],
                                    [
                                        "redlist",
                                        "",
                                        "Vulnerable"
                                    ],
                                    [
                                        "redlist",
                                        "",
                                        "Near Threatened"
                                    ],
                                    [
                                        "redlist",
                                        "",
                                        "Least Concern"
                                    ],
                                    [
                                        "redlist",
                                        "",
                                        "Data Deficient"
                                    ],
                                    [
                                        "redlist",
                                        "",
                                        "Not Evaluated"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "dataPath",
                            supportsMultilingual: false
                        }
                    },
                    groupTitle: {
                        name: "Group title",
                        description: "Assigns multiple filter values under a shared collapsible group heading with a collective tick/untick button. All rows sharing the same **Group title** value (for the same **Column name**) are displayed together under that heading. Individual values within the group can still be ticked and unticked independently.",
                        howToUse: "Use to group related filter values that users would often select together - e.g. `Endemic`, `Near-endemic`, `Endemic?` under a group titled `Endemites`.",
                        notes: [],
                        examples: [
                            {
                                label: "Grouping endemic statuses",
                                columns: [
                                    "Column name",
                                    "Group title",
                                    "Values ordered"
                                ],
                                rows: [
                                    [
                                        "status",
                                        "Endemites",
                                        "Endemic"
                                    ],
                                    [
                                        "status",
                                        "Endemites",
                                        "Near-endemic"
                                    ],
                                    [
                                        "status",
                                        "Endemites",
                                        "Endemic?"
                                    ],
                                    [
                                        "status",
                                        "",
                                        "Native"
                                    ],
                                    [
                                        "status",
                                        "",
                                        "Introduced"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowEmpty: true,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    },
                    value: {
                        name: "Values ordered",
                        description: "One filter value per row, in the desired display order. The value must match a value that actually appears in the data column (after any Data Code replacement). Supports multilingual variants for projects where filter value labels differ per language.",
                        howToUse: "List all values you want to control the position of. Values not listed will be appended alphabetically after the explicitly ordered ones.",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "Duplicate values within the same **Column name** group are not allowed.",
                            allowEmpty: false,
                            allowDuplicates: "yes",
                            allowedContent: "any",
                            supportsMultilingual: true
                        }
                    }
                },
                templateData: [
                    {
                        columnName: "redlist",
                        groupTitle: "Threatened",
                        value: "Critically Endangered",
                    },
                    {
                        columnName: "redlist",
                        groupTitle: "Threatened",
                        value: "Endangered",
                    },
                    {
                        columnName: "redlist",
                        groupTitle: "Threatened",
                        value: "Vulnerable",
                    },
                    {
                        columnName: "redlist",
                        groupTitle: "Lower Risk",
                        value: "Near Threatened",
                    },
                    {
                        columnName: "redlist",
                        groupTitle: "Lower Risk",
                        value: "Least Concern",
                    },
                    {
                        columnName: "redlist",
                        groupTitle: "Unknown",
                        value: "Data Deficient",
                    },
                    {
                        columnName: "redlist",
                        groupTitle: "Unknown",
                        value: "Not Evaluated",
                    },
                ],
                data: []
            },
            supportedLanguages: {
                name: "Supported languages",
                required: false,
                description: "Declares all languages the project is available in. The first row is the default language. Any column with no language suffix (`:code`) is treated as belonging to this default language.\n\nIf your project is monolingual, you can omit this table entirely. When more than one language is defined, users see a language switcher in the Side Menu.",
                notes: [
                    {
                        type: "tip",
                        text: "The active language is reflected in the URL via the `?l=` query parameter, so a specific language version can be linked or bookmarked directly."
                    }
                ],
                columns: {
                    code: {
                        name: "Code",
                        description: "The ISO 639-1 two-letter language code in lowercase (e.g. `en`, `fr`, `de`). The first row's code is the default language.",
                        howToUse: "Use the standard two-letter ISO 639-1 code. Place the default language in the first row. For languages without a NaturaList UI translation, set the **Fallback language** column to a language that does have one.",
                        notes: [],
                        examples: [
                            {
                                label: "Bilingual English/French project",
                                columns: [
                                    "Code",
                                    "Name of language",
                                    "Fallback language"
                                ],
                                rows: [
                                    [
                                        "en",
                                        "English",
                                        ""
                                    ],
                                    [
                                        "fr",
                                        "Français",
                                        ""
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "See [ISO 639-1 language code list](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes).",
                            allowDuplicates: "no",
                            allowEmpty: false,
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    name: {
                        name: "Name of language",
                        description: "The language's name as displayed in the app's language switcher. Use the name as written in that language (e.g. `Français` not `French`, `Česky` not `Czech`).",
                        howToUse: "",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "",
                            allowDuplicates: "no",
                            allowEmpty: false,
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    fallback: {
                        name: "Fallback language",
                        description: "If your language code has no matching NaturaList UI translation (e.g. `iu` for Inuktitut), specify here the code of a language to use for the UI instead (e.g. `fr`). If left empty, English is used as the UI fallback.",
                        howToUse: "Set only when using a language code for which NaturaList has no UI translation and you prefer a specific fallback other than English.",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "",
                            allowDuplicates: "yes",
                            allowEmpty: true,
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    }
                },
                templateData: [
                    {
                        code: "en",
                        name: "English",
                        fallback: ""
                    },
                ]
            },
        }
    },
    checklist: {
        name: "checklist",
        required: true,
        type: "data",
        data: [],
        templateData: [
            {
                "Class": "Amphibia",
                "Order": "Anura",
                "Family": "Pelodryadidae",
                "Genus": "Litoria",
                "Species.name": "Litoria aurea",
                "Species.authority": "(Lesson, 1829)",
                "redlist": "NT",
                "status": "I",
                "notes": ""
            },
            {
                "Class": "Reptilia",
                "Order": "Squamata",
                "Family": "Elapidae",
                "Genus": "Pelamis",
                "Species.name": "Pelamis platura",
                "Species.authority": "(Linnaeus, 1766)",
                "redlist": "LC",
                "status": "N",
                "notes": "A pelagic sea snake of circumtropical distribution, the sole member of *Pelamis*. Venom is potently neurotoxic but bites to humans are rare. Buoyant at the surface owing to its laterally compressed tail and low specific gravity [@zug1993, p. 428]. Also see @inat:193429759 for a recent record from Vanuatu."
            },
            {
                "Class": "Reptilia",
                "Order": "Squamata",
                "Family": "Gekkonidae",
                "Genus": "Gehyra",
                "Species.name": "Gehyra georgpotthasti",
                "Species.authority": "Flecks, Schmitz, Böhme, Henkel & Ineich, 2012",
                "redlist": "VU",
                "status": "N",
                "notes": "*Gehyra georgpotthasti* is the largest gecko endemic to Vanuatu and was formally described from specimens collected on Efate Island. Distinguished from congeners by its large size (SVL > 70 mm in adults) and undivided basal lamellae [@flecks2012]."
            },
            {
                "Class": "Reptilia",
                "Order": "Squamata",
                "Family": "Scincidae",
                "Genus": "Caledoniscincus",
                "Species.name": "Caledoniscincus atropunctatus",
                "Species.authority": "(Roux, 1913)",
                "redlist": "LC",
                "status": "N",
                "notes": ""
            },
            {
                "Class": "Reptilia",
                "Order": "Squamata",
                "Family": "Scincidae",
                "Genus": "Cryptoblepharus",
                "Species.name": "Cryptoblepharus novohebridicus",
                "Species.authority": "Mertens, 1928",
                "redlist": "LC",
                "status": "E",
                "notes": ""
            },
            {
                "Class": "Reptilia",
                "Order": "Squamata",
                "Family": "Scincidae",
                "Genus": "Emoia",
                "Species.name": "Emoia aneityumensis",
                "Species.authority": "Medway, 1974",
                "redlist": "EN",
                "status": "E",
                "notes": "See @reptile:Emoia/aneityumensis"
            },
            {
                "Class": "Reptilia",
                "Order": "Squamata",
                "Family": "Scincidae",
                "Genus": "Emoia",
                "Species.name": "Emoia atrocostata",
                "Species.authority": "(Lesson, 1830)",
                "redlist": "LC",
                "status": "N",
                "notes": "Widespread coastal skink found throughout the Indo-Pacific littoral zone, from India to the central Pacific. Highly tolerant of salt spray and regularly forages among intertidal rocks. See @bauer1990 for regional records from the southwestern Pacific."
            },
            {
                "Class": "Reptilia",
                "Order": "Testudines",
                "Family": "Dermochelyidae",
                "Genus": "Dermochelys",
                "Species.name": "Dermochelys coriacea",
                "Species.authority": "(Vandelli, 1761)",
                "redlist": "VU",
                "status": "N",
                "notes": ""
            }
        ]
    }
};
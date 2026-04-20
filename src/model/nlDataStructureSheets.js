export const OCCURRENCE_IDENTIFIER = "occurrence";

export const ANALYTICAL_INTENT_TAXA = "T";
export const ANALYTICAL_INTENT_OCCURRENCE = "S";

export const nlDataStructureSheets = {
    content: {
        name: "nl_content",
        required: true,
        description: "The [[ref:content]] sheet tells the app what each column in your [[ref:data]] sheet represents. All columns from the [[ref:data]] sheet that you want to display must appear either in [[ref:content.taxa]] (for taxa columns) or in [[ref:content.customDataDefinition]] (for your additional data). Columns not referenced here are silently ignored and can serve as helper or curator-notes columns.",
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
                description: "Declares every non-taxon column you want to use for additional data. Rows corresponds to columns in [[ref:data]] sheet and controls the column's display title, data type, template rendering, placement in the taxon card, and visibility rules.\n\nData paths support dot notation for structured sub-fields (`redListEvaluation.year`) and `#` notation for arrays (`habitat#`). Include one row for the root path and one row for each sub-path you want to control them independently.",
                notes: [
                    {
                        type: "tip",
                        text: "Read about the [data path](/author-guide/data-sheet#22-column-naming-rules-and-data-paths) concept to understand how arrays (`#`) and structured sub-fields (`.`) let you represent complex data using plain spreadsheet columns."
                    }
                ],
                columns: {
                    columnName: {
                        name: "Column name",
                        description: "The data path of the column this row configures. Simple column names (`redlist`), dotted sub-fields (`origPub.author`), and array paths (`habitat#`) are all valid. For array data, include one row for the root path (e.g. `habitat`) and one row for each item path (e.g. `habitat#`).",
                        howToUse: "Every column from [[ref:data]] sheet that you want to appear as data point in your project must have a row here. Columns used only as template inputs can be listed with `hidden = yes`.",
                        notes: [],
                        examples: [
                            {
                                label: "Simple column and array column",
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
                                    ]
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
                        description: "If non-empty, a filter dropdown appears in the search sidebar with this label. The filter type (categorical checkboxes vs. numeric range) is determined automatically from the [[ref:content.customDataDefinition.dataType]] value.\n\nAdd a pipe-separated prefix to group the filter with others under a common section heading - e.g. `Habitat | Ecology` and `Life form | Ecology` both appear under an **Ecology** section.",
                        howToUse: "Set for any column whose values users should be able to filter by. Omit for display-only or template-only columns. Use the `Label | Group` sparingly pattern to organise logically related filters into named sections.",
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
                        description: "The data type for this column. Determines how the app reads the raw cell value, renders it, and (if **Search category title** is set) which filter type to show.\n\nFor array or object root entries (paths using `#` or `.` children), use `list` to control how sub-items are joined for display. Append an optional separator keyword after a space:\n\n| Value | Result |\n|---|---|\n| `list` or `list bullets` | Unordered bullet list (default) |\n| `list numbered` | Ordered list starting at 1 |\n| `list unmarked` | List with no bullets or numbers |\n| `list space` | Items on one line, separated by a space |\n| `list comma` | Items on one line, separated by `, ` |\n| `list <any string>` | Items on one line, separated by that string |\n\nSee [Data Types](/reference/data-types) for the full type reference.",
                        howToUse: "Leave empty (defaults to `text`) for plain string data. Choose the appropriate type whenever the column holds numbers, dates, images, maps, months, intervals, or other structured data - the right type enables the correct filter, renderer, and search indexing.",
                        notes: [
                            {
                                type: "tip",
                                text: "Store bare numbers in your data cells and use the **Template** column to add units at display time (e.g. `{{unit \"m\"}}`). Entering `5 m` in a cell instead of `5` turns the value into text and disables numeric filtering."
                            }
                        ],
                        examples: [
                            {
                                label: "Common data type values",
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
                                        "Numeric value; range filter"
                                    ],
                                    [
                                        "collectionDate",
                                        "date",
                                        "Parsed and formatted date; date range filter"
                                    ],
                                    [
                                        "distribution",
                                        "mapregions",
                                        "SVG map + inline region list"
                                    ],
                                    [
                                        "flowering",
                                        "months",
                                        "Compact month range display; categorical filter"
                                    ],
                                    [
                                        "photo",
                                        "image",
                                        "Clickable thumbnail; not filterable"
                                    ],
                                    [
                                        "basionym",
                                        "taxon",
                                        "Clickable taxon link; text-searchable"
                                    ],
                                    [
                                        "notes",
                                        "markdown",
                                        "Rendered Markdown; not filterable"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "`list` may be followed by a separator keyword (e.g. `list comma`, `list bullets`, `list space`).",
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
                        howToUse: "Use when you need to append a unit, build a URL, select a file path dynamically, or transform the raw value before display. See [Dynamic Content with Templates](/author-guide/templates) for worked examples.",
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
                                        "Append a unit",
                                        "`{{value}} cm`"
                                    ],
                                    [
                                        "Auto-scale a unit",
                                        "`{{unit \"m\"}}`"
                                    ],
                                    [
                                        "Build a hyperlink (use with markdown formatting)",
                                        "`[{{taxon.name}}](https://www.gbif.org/search?q={{value}})`"
                                    ],
                                    [
                                        "Dynamic SVG map path",
                                        "`maps/{{data.region}}.svg`"
                                    ],
                                    [
                                        "Google Maps geopoint",
                                        "`https://www.google.com/maps?q={{lat}},{{long}}`"
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
                        description: "Where the data field appears in the taxon card. Combine with `details` using a pipe to show the field both in the list view and in the Details pane - e.g. `left | details`.\n\nWhen `details` is included, the field appears in a tab determined by its data type: `image` and `sound` → **Media** tab; `map` and `mapregions` → **Map** tab; `text` and `markdown` → **Text** tab.\n\nSee [Placement Options](/reference/placement-options) for the layout diagram and guidance table.",
                        howToUse: "Use `left`, `middle`, or `right` for compact single-value fields (status badges, dates, short measurements). Use `top` or `bottom` for longer content (descriptions, distribution lists). Use `details` for rich content (large images, full maps, long notes) that users seek out by clicking a taxon.",
                        notes: [],
                        examples: [
                            {
                                label: "Typical placement choices",
                                columns: [
                                    "Column name",
                                    "Data type",
                                    "Placement"
                                ],
                                rows: [
                                    [
                                        "redlist",
                                        "category",
                                        "left"
                                    ],
                                    [
                                        "collectionDate",
                                        "date",
                                        "right"
                                    ],
                                    [
                                        "description",
                                        "markdown",
                                        "details"
                                    ],
                                    [
                                        "distribution",
                                        "mapregions",
                                        "bottom | details"
                                    ],
                                    [
                                        "photo",
                                        "image",
                                        "details"
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
                        howToUse: "Use `yes` for columns needed as template inputs but not for display. Use `data` for filter-only or Trait Matrix columns. Use a conditional expression for region- or scenario-specific fields that should only appear when a relevant filter is active.",
                        notes: [
                            {
                                type: "tip",
                                text: "See [End-to-End Examples → Example F](/author-guide/examples#example-f-conditional-data-display) for a complete worked illustration of conditional hiding with a country filter."
                            }
                        ],
                        examples: [
                            {
                                label: "Conditional visibility per country filter",
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
                        description: "Declares whether this data column belongs to taxon rows or occurrence rows.\n\n- Empty (default) or `taxon`: the column belongs to taxon rows. Data found on an occurrence row raises a compiler error and is excluded from the compiled output.\n- `occurrence`: the column belongs to occurrence rows only. Data found on a taxon row raises a compiler error and is excluded from the compiled output.\n\nEvery column must belong to one entity or the other - there is no shared option.\n\nOnly set this on root or simple columns; child columns (`.subfield`, `#`) inherit the value automatically.",
                        howToUse: "Leave empty for columns that contain taxon-level information. Set to `occurrence` for every column that carries occurrence-specific data (e.g. collector name, collection date, catalog number, locality). If a column applies to occurrences it must be declared `occurrence`; taxon columns may be left blank.",
                        notes: [
                            {
                                type: "tip",
                                text: "In the filter sidebar, `taxon` columns are hidden when the user switches to Occurrence mode, and `occurrence` columns are hidden in Taxon mode. This keeps the filter panel uncluttered regardless of which view is active."
                            },
                            {
                                type: "warning",
                                text: "Only set **Belongs to** on the root row of a column group. For example, set it on `origPub`, not on `origPub.author` or `origPub.year` - the value cascades to all child paths automatically."
                            }
                        ],
                        examples: [
                            {
                                label: "Mixed taxon and occurrence columns",
                                columns: [
                                    "Column name",
                                    "Title",
                                    "Belongs to"
                                ],
                                rows: [
                                    [
                                        "redlist",
                                        "Red List",
                                        "taxon"
                                    ],
                                    [
                                        "description",
                                        "Description",
                                        "taxon"
                                    ],
                                    [
                                        "collector",
                                        "Collector",
                                        "occurrence"
                                    ],
                                    [
                                        "collectionDate",
                                        "Collection date",
                                        "occurrence"
                                    ],
                                    [
                                        "catalogNumber",
                                        "Catalog number",
                                        "occurrence"
                                    ],
                                    [
                                        "distribution",
                                        "Distribution",
                                        "taxon"
                                    ]
                                ]
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
                            defaultValue: "",
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
                description: "Defines external search engine links that appear in the Details pane for each taxon, allowing users to look up taxa in online databases, herbaria, encyclopaedias, and other resources. Each row is one link.\n\nThis table can be left completely empty if you do not want to provide external search links.",
                notes: [
                    {
                        type: "tip",
                        text: "For standard biological databases, consider the built-in [Database Shortcodes](/author-guide/nl-content#36-table-database-shortcodes) (`@gbif:ID`, `@inat:ID`, etc.) as an alternative - shortcodes embed links inline in Markdown fields rather than as sidebar buttons."
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
                                columns: [
                                    "Title:en",
                                    "Title:fr"
                                ],
                                rows: [
                                    [
                                        "GBIF occurrence",
                                        "Occurrence GBIF"
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
                        description: "Filename (including extension) of the icon image located in `usercontent/online_search_icons/`. The icon should be square, at least 200 × 200 px, with a white or transparent background. Accepted formats: `.jpg`, `.png`, `.webp`, `.svg`.",
                        howToUse: "Prepare one icon per search engine and upload it to `usercontent/online_search_icons/` before compiling.",
                        notes: [],
                        examples: [
                            {
                                label: "Icon filenames",
                                columns: [
                                    "Icon"
                                ],
                                rows: [
                                    [
                                        "gbif.png"
                                    ],
                                    [
                                        "google.png"
                                    ],
                                    [
                                        "wikipedia.png"
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
                        description: "The URL users are taken to when clicking the link, with Handlebars placeholders for dynamic values. The most common variable is `{{taxon.name}}`; `{{taxon.authority}}`, `{{data.columnname}}`, etc. are also available.\n\nTo construct the URL, search for a known taxon on the target site, copy the results URL, strip unnecessary parameters, and replace the taxon name portion with `{{taxon.name}}`.",
                        howToUse: "Supports multilingual variants if the target site has language-specific URL patterns.",
                        notes: [],
                        examples: [
                            {
                                label: "Common search URL templates",
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
                                        "GBIF species",
                                        "`https://www.gbif.org/species/search?q={{taxon.name}}`"
                                    ],
                                    [
                                        "Wikipedia",
                                        "`https://en.wikipedia.org/wiki/{{taxon.name}}`"
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
                        howToUse: "Use when the linked database covers only a subset of your project's taxa - for example, a beetle database link on a vertebrate checklist should be restricted to `Coleoptera`.",
                        notes: [],
                        examples: [
                            {
                                label: "Restricting a mammal database link",
                                columns: [
                                    "Title",
                                    "Search URL template",
                                    "Restrict to taxon"
                                ],
                                rows: [
                                    [
                                        "Mammal Diversity DB",
                                        "`https://www.mammaldiversity.org/taxa.html#genus={{taxon.name}}`",
                                        "Mammalia"
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
                description: "Embeds dichotomous or polytomous identification keys directly in the spreadsheet, navigable from within the app. Each key is a block of rows using four columns. Multiple keys can coexist in the same table.\n\nAs the user navigates a key, the main checklist filter updates in real time to show only the taxa still reachable given the choices made so far.\n\nThis table can be left completely empty if you do not use identification keys.",
                notes: [
                    {
                        type: "tip",
                        text: "Use `**bold**` in Text cells to highlight the diagnostic character being contrasted, and `*italics*` for taxon names. Images for key steps go in `usercontent/keys/`."
                    }
                ],
                columns: {
                    step: {
                        name: "Step",
                        description: "A text code starts a new key (e.g. `beetles`, or a taxon name such as `Turdus`). An integer starts or continues a question step within the current key. All rows sharing the same integer are the choices for that one question. Step integers must be strictly ascending within a key, and a Target integer must always be higher than the current Step integer.\n\nIf a key result is a taxon name that matches the Step header of another key, the app automatically offers that second key as a continuation - enabling multi-level key chains.",
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
                                        "snake_silhouette.png"
                                    ],
                                    [
                                        "1",
                                        "Four limbs present",
                                        "3",
                                        "lizard_silhouette.png"
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
                                    ]
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
                        description: "Optional image(s) from `usercontent/keys/` to display alongside this step choice. Separate multiple filenames with a pipe `|`. Append a caption after a pipe following the filename: `wing.jpg | Dorsal wing view`.",
                        howToUse: "Provide images for steps where visual comparison aids identification.",
                        notes: [],
                        examples: [
                            {
                                label: "Multiple images with captions",
                                columns: [
                                    "Images"
                                ],
                                rows: [
                                    [
                                        "wing_dorsal.jpg | Dorsal view | wing_ventral.jpg | Ventral view"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
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
                description: "Stores BibTeX entries that can be cited using `@citekey` notation in any Markdown field throughout the project. Each row contains one complete BibTeX entry.\n\nCitations are rendered in APA style. The `@citekey` syntax supports narrative (`@smith2020`), parenthetical (`[@smith2020]`), multiple citations (`[@smith2020; @doe2021]`), suffixes (`@smith2020[p. 12]`), and year-only (`[-@smith2020]`) forms.\n\nThis table can be left completely empty if you do not use bibliographic references.",
                notes: [
                    {
                        type: "tip",
                        text: "Instead of pasting BibTeX entries into cells, you can maintain a `.bib` file in `usercontent/` and reference it with an F-directive: enter `F:references.bib` in the BibTeX entries column. The file is fetched and baked in at compile time."
                    },
                    {
                        type: "warning",
                        text: "The `@citekey` citation syntax is distinct from database shortcodes (see [Database Shortcodes](/author-guide/nl-content#36-table-database-shortcodes)), which use a similar `@code:ID` notation but link to external occurrence records."
                    }
                ],
                columns: {
                    bibtex: {
                        name: "BibTeX entries",
                        description: "One complete BibTeX entry per row, copied directly from a reference manager. Alternatively, enter an F-directive (`F:references.bib` or `F:references.txt`) to load entries from a file in `usercontent/` at compile time.",
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
                            }
                        ],
                        integrity: {
                            description: "",
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
                                columns: [
                                    "Code"
                                ],
                                rows: [
                                    [
                                        "myherb"
                                    ],
                                    [
                                        "myherb.type"
                                    ],
                                    [
                                        "col"
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
                        description: "The text shown as the hyperlink label. Use `{{id}}` where the record ID should appear and optionally `{{author}}` for author attribution. The `{{author}}` placeholder is replaced by the author string followed by a space, or by an empty string if no author was provided - design the template so it reads naturally either way.\n\nMust contain `{{id}}`.",
                        howToUse: "Place `{{author}}` before a noun so the label reads naturally with or without an author: `{{author}}Herbarium record ({{id}})`.",
                        notes: [],
                        examples: [
                            {
                                label: "Label template with optional author",
                                columns: [
                                    "Code",
                                    "Label template"
                                ],
                                rows: [
                                    [
                                        "myherb",
                                        "{{author}}Herbarium ({{id}})"
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
                                    "URL template"
                                ],
                                rows: [
                                    [
                                        "myherb",
                                        "https://herbarium.example.org/occurrences/{{id}}"
                                    ]
                                ]
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
                        code: "reptile",
                        labelTemplate: "{{author}}The Reptile Database ({{id}})",
                        urlTemplate: "https://reptile-database.reptarium.cz/{{id}}"
                    }
                ]
            },
            dwcArchive: {
                name: "DwC archive",
                required: false,
                description: "Configures Darwin Core Archive (DwC-A) export for GBIF submission.",
                columns: {
                    term: {
                        name: "DwC term",
                        description: "The Darwin Core term name (camelCase, e.g. `decimalLatitude`), or an `eml:` prefixed field path (e.g. `eml:title`) for EML metadata fields.",
                        integrity: {
                            allowEmpty: false,
                            allowDuplicates: "no",
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    sourceColumn: {
                        name: "Source column",
                        description: "The NaturaList data path or directive that provides the value for this DwC term.\nLeave empty if you are supplying a Constant value instead.\n\nSUPPORTED DIRECTIVE TYPES:\n\n  Plain column name\n    e.g.  recordedBy\n    Reads the value of that column from the checklist for each row.\n    For compound types (geopoint, interval, date, image, sound, map) append\n    the component key: location.lat · altitude.from · collectionDate.ymd\n    · specimenPhoto.source\n\n  {col1} text {col2} template\n    e.g.  {collector} leg. | {identifier} det.\n    Constructs a string from column values.  Pipe '|' separates fallback\n    alternatives - the first segment where all placeholders are non-empty\n    is used.\n\n  config:Item Name\n    e.g.  config:Checklist name\n    Reads a value from the Customization table.\n\n  taxa:ColumnName  or  taxa:ColumnName.component\n    e.g.  taxa:Species · taxa:Species.authority · taxa:Species.lastNamePart\n    Reads a value from the taxon hierarchy.  Append a component key for\n    compound taxon fields.\n\n  auto:termName\n    e.g.  auto:taxonID · auto:taxonRank · auto:scientificName\n    Uses a value automatically generated by the compiler.\n\n  media:path1, path2, …   ← FOR dwc:associatedMedia\n    e.g.  media:specimenPhoto\n          media:lifePhotos#\n          media:specimenPhoto, lifePhotos#, callsRecs#\n    Collects fully resolved source URLs from one or more NaturaList image,\n    sound, or map columns.  Paths ending in '#' are automatically expanded\n    to all matching numbered columns (lifePhotos# → lifePhotos1, lifePhotos2 …).\n    All URLs are joined with ' | ' in the output.\n    NOTE: do NOT use the template pipe '|' syntax for associatedMedia -\n    the template pipe is a fallback selector, not a list separator.\n    Use this directive instead.",
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
        description: "The `nl_appearance` sheet controls global appearance, language settings, category colours, map region colours, filter ordering, and other visual configuration. The entire sheet is optional. In practice you will want to fill in at least the **Customization** table to set the project name and About text.",
        notes: [
            {
                type: "tip",
                text: "Start from the full blank template (downloadable from the Manage screen), which has all table headers pre-filled. Keeping the full structure - even with empty tables - makes it easy to add appearance settings later without restructuring the workbook."
            }
        ],
        type: "meta",
        tables: {
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
            customization: {
                name: "Customization",
                required: false,
                description: "A fixed set of named configuration items. The **Item** column contains predefined names; you only edit the **Value** column (or `Value:en`, `Value:fr`, etc. for multilingual values). Skip any items you are happy with at their default. Typically you will want to fill in at least **About section** and **Checklist name**.",
                notes: [],
                columns: {
                    item: {
                        name: "Item",
                        description: "Pre-filled item names that control specific app behaviours. Do not edit the values in this column - they are fixed keywords recognised by the app.",
                        howToUse: "Never edit. Add only the items you need to configure by filling in the corresponding **Value** cell.",
                        notes: [],
                        examples: [
                            {
                                label: "Customization table overview",
                                columns: [
                                    "Item",
                                    "Default",
                                    "What it controls"
                                ],
                                rows: [
                                    [
                                        "Color theme hue",
                                        "212",
                                        "Hue (0-360) of the app colour theme"
                                    ],
                                    [
                                        "Checklist name",
                                        "(empty)",
                                        "Short name shown in the app header"
                                    ],
                                    [
                                        "About section",
                                        "(empty)",
                                        "About page text; supports Markdown and F-directives"
                                    ],
                                    [
                                        "How to cite",
                                        "(empty)",
                                        "Citation text shown to users"
                                    ],
                                    [
                                        "[[ref:data]] sheets names",
                                        "checklist",
                                        "[[ref:data]] sheet tab name if renamed"
                                    ],
                                    [
                                        "Date format",
                                        "YYYY-MM-DD",
                                        "day.js format string for date display"
                                    ],
                                    [
                                        "Precache max file size",
                                        "0.5",
                                        "Maximum individual file size (MB) to precache"
                                    ],
                                    [
                                        "Precache max total size",
                                        "200",
                                        "Maximum total precache size (MB)"
                                    ],
                                    [
                                        "Month names",
                                        "English months",
                                        "Comma-separated list of 12 month names"
                                    ],
                                    [
                                        "Custom eml.xml location",
                                        "(empty)",
                                        "Path to a custom DwC-A EML file in the usercontent folder (including the filename, e.g. `dwc/eml.xml`)"
                                    ]
                                ]
                            }
                        ],
                        integrity: {
                            description: "",
                            allowDuplicates: "no",
                            allowEmpty: false,
                            allowedContent: "any",
                            supportsMultilingual: false
                        }
                    },
                    value: {
                        name: "Value",
                        description: "The configured value for each item. Supports multilingual suffixes (`Value:en`, `Value:fr`, etc.) - useful for **Date format**, **About section**, and **Checklist name** that may differ per language.\n\n- **Color theme hue**: integer 0-360. Use an online HSL picker (e.g. [hslpicker.com](https://hslpicker.com)) to find your hue value.\n- **Checklist name**: short project name shown in the app header.\n- **About section**: Markdown text for the About page, or an F-directive (`F:about.md`) pointing to a file in `usercontent/`.\n- **How to cite**: citation text shown to users.\n- **[[ref:data]] sheets names**: comma-separated list of [[ref:data]] sheet tab names, if different from the default `checklist`.\n- **Date format**: [day.js format string](https://day.js.org/docs/en/display/format), e.g. `MMM D, YYYY`, `DD/MM/YYYY`. Default is `YYYY-MM-DD`.\n- **Precache max file size**: maximum size in MB of individual files to precache for offline use. Default `0.5`.\n- **Precache max total size**: maximum total size in MB of all precached assets. Default `200`.\n- **Month names**: comma-separated list of 12 month names (January through December) for the active language. Used for display and search labels only.",
                        howToUse: "Fill in only the items you need to change from their defaults. Leave the Value cell empty for items you are happy with at their default.",
                        notes: [
                            {
                                type: "tip",
                                text: "For lengthy About section text, use an F-directive (`F:about.md`) to maintain the content in a separate file in `usercontent/`. See [External Markdown Files](/author-guide/external-markdown)."
                            }
                        ],
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
                                        "Birds of Vanuatu",
                                        "Oiseaux du Vanuatu"
                                    ],
                                    [
                                        "Date format",
                                        "MMM D, YYYY",
                                        "DD/MM/YYYY"
                                    ],
                                    [
                                        "Color theme hue",
                                        "45",
                                        "45"
                                    ],
                                    [
                                        "[[ref:data]] sheets names",
                                        "checklist",
                                        "checklist"
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
                        item: "Color theme hue",
                        value: 212
                    },
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
                    },
                    {
                        item: "[[ref:data]] sheets names",
                        value: "checklist"
                    }
                ]
            },
            dataCodes: {
                name: "Data codes",
                required: false,
                description: "Translates short codes stored in the [[ref:data]] sheet into human-readable labels, per language. When the app reads a value from a coded column, it replaces it with the full label before displaying. Category matching (Colored Categories table) then operates on the replacement text, not the original code.\n\nThis table can be left completely empty if your [[ref:data]] sheet already contains the display labels you want to show.",
                notes: [
                    {
                        type: "warning",
                        text: "If a value appears in the [[ref:data]] sheet column but has no matching row in the Data Codes table, the app logs a warning and displays the raw value unchanged. Codes are matched exactly and case-sensitively."
                    }
                ],
                columns: {
                    columnName: {
                        name: "Column name",
                        description: "The data path of the column whose values should be translated. Each distinct value in that column needs its own row, all sharing the same **Column name** entry.",
                        howToUse: "Use whenever your [[ref:data]] sheet stores compact codes (like `LC`, `EN`, `N`, `E`) and you want to display full labels instead.",
                        notes: [],
                        examples: [
                            {
                                label: "Red List code translations",
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
                    code: {
                        name: "Code",
                        description: "The raw value as it appears in the [[ref:data]] sheet. Matched exactly and case-sensitively against data cell content.",
                        howToUse: "Enter the value exactly as it appears in your [[ref:data]] sheet cells, including any capitalisation.",
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
                description: "Gives categorical data values a coloured pill/badge appearance instead of plain text. Each row defines one value-to-colour mapping for one column. Typically used for Red List categories, presence/origin status, life-form codes, and similar small fixed-vocabulary fields.\n\nThe **Data type** column in Custom Data Definition must be set to `category` for this table to take effect. Category matching is a case-insensitive substring match against the data value after any Data Code replacement.\n\nThis table can be left completely empty - it is valid to use `category` data type without any entries here; the data will display as plain text but still use the categorical filter.",
                notes: [
                    {
                        type: "warning",
                        text: "Setting the data type to `category` alone does nothing visual - you must also populate this table with colour definitions for each value."
                    },
                    {
                        type: "tip",
                        text: "The **Contains text** match is a substring/regex search: `Endemic` will match both `Endemic` and `Near-endemic`. Be specific enough to avoid unintended matches."
                    }
                ],
                columns: {
                    columnName: {
                        name: "Column name",
                        description: "The data path of the column whose values should be styled as coloured categories. Each distinct value (or group of values matched by **Contains text**) requires its own row, all sharing the same **Column name**.",
                        howToUse: "Enter the same column name as used in Custom Data Definition (with `category` data type).",
                        notes: [],
                        examples: [
                            {
                                label: "Status and Red List categories",
                                columns: [
                                    "Column name",
                                    "Contains text",
                                    "Background color",
                                    "Text color"
                                ],
                                rows: [
                                    [
                                        "status",
                                        "Native",
                                        "#668dbb",
                                        "white"
                                    ],
                                    [
                                        "status",
                                        "Endemic",
                                        "#5e9f5c",
                                        "white"
                                    ],
                                    [
                                        "status",
                                        "Introduced",
                                        "#ed665b",
                                        "white"
                                    ],
                                    [
                                        "redlist",
                                        "Endangered",
                                        "#cd6630",
                                        "#ffcd9a"
                                    ],
                                    [
                                        "redlist",
                                        "Least Concern",
                                        "#006666",
                                        "white"
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
                        description: "The text to match against the data value (after any Data Code replacement). The match is case-insensitive and works as a substring/regex search.",
                        howToUse: "Enter a string distinctive enough to match the intended values without accidentally matching others.",
                        notes: [],
                        examples: [],
                        integrity: {
                            description: "Case-insensitive substring/regex match - e.g. `Endemic` also matches `Near-endemic`.",
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
                        howToUse: "Use `white` for dark backgrounds and `black` (or leave empty) for light backgrounds.",
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
            }
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
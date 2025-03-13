import { Settings } from "../../model/Settings.js";
import { sortByCustomOrder, materialColors } from "../../components/Utils.js";
import { Checklist } from "../../model/Checklist.js";
import { _t, _tf } from "../../model/I18n.js";

// ------------------------------------------------------
// CONFIGURATION & INITIAL SETTINGS
// ------------------------------------------------------
const sumMethods = [
  { name: _t("view_cat_sum_by_taxon"), method: "taxon" },
  { name: _t("view_cat_sum_by_category"), method: "category" },
];

const displayStyles = [
  {
    name: _t("view_cat_percentages_name"),
    method: "percentages",
    info: _t("view_cat_percentages_info"),
  },
  {
    name: _t("view_cat_counts_name"),
    method: "counts",
    info: _t("view_cat_counts_info"),
  },
];

let categoryToView = Settings.categoryChartCategory();
let categoryRoot = Settings.categoryChartRoot();
let sumMethod = Settings.categoryChartSumMethod();
let display = Settings.categoryChartDisplayMode();

// Fallbacks if settings are invalid
if (!displayStyles.find((ds) => ds.method === display)) {
  display = displayStyles[0].method;
  Settings.categoryChartDisplayMode(display);
}
if (!sumMethods.find((sm) => sm.method === sumMethod)) {
  sumMethod = sumMethods[0].method;
  Settings.categoryChartSumMethod(sumMethod);
}

// ------------------------------------------------------
// HELPER FUNCTIONS
// ------------------------------------------------------

/**
 * Generate a descriptive string for the category header.
 */
const categoryVerb = (catView, sumMethodOption) => {
  const meta = Checklist.getMetaForDataPath(catView);
  if (!meta) return "";
  let verb = "";
  switch (sumMethodOption) {
    case "taxon":
      verb = _tf("view_cat_category_verb_taxon", [
        displayStyles.find((ds) => ds.method === display).info,
        meta.searchCategory,
      ]);
      break;
    case "category":
      verb = _tf("view_cat_category_verb_category", [meta.searchCategory]);
      break;
    default:
      break;
  }
  return verb;
};

/**
 * Generate a cell tooltip describing the data.
 */
const cellVerb = (percentage, cKey, taxonKey, matchingCount) => {
  let verb = "";
  switch (sumMethod) {
    case "taxon":
      verb = _t("view_cat_cell_verb_taxon", [
        percentage,
        matchingCount,
        taxonKey,
        cKey,
      ]);
      break;
    case "category":
      verb = _t("view_cat_cell_verb_category", [
        percentage,
        matchingCount,
        cKey,
        taxonKey,
      ]);
      break;
    default:
      break;
  }

  if (Checklist.queryKey() !== "{}") {
    verb =
      verb +
      " " +
      _tf(
        "view_cat_cell_verb_category_filtered",
        [
          Settings.pinnedSearches.getHumanNameForSearch(
            JSON.parse(Checklist.queryKey()),
            true
          ),
        ],
        true
      );
  }

  return verb;
};

/**
 * Return either the percentage or number based on the display setting.
 */
const numericDisplay = (number, percentage) => {
  switch (display) {
    case "percentages":
      return percentage;
    case "counts":
      return number;
    default:
      console.error("Unknown view mode", display);
      return number;
  }
};

/**
 * Finds the parent taxon for a given taxon.
 */
function parentOf(taxon, filteredTaxa) {
  const foundTaxon = filteredTaxa.find((tx) =>
    tx.t.find((tn) => tn.n === taxon)
  );
  if (foundTaxon) {
    const tIndex = foundTaxon.t.findIndex((t) => t.n === taxon);
    if (tIndex === 0) return "";
    const parent = foundTaxon.t[tIndex - 1].n;
    return parent;
  }
  return "";
}

/**
 * Convert a ratio to percent string, if lower than 1% display <1%
 */
function toPctString(ratio) {
  let pct = ratio * 100.0;

  if (pct < 1 && pct > 0) {
    return "< 1%";
  } else {
    return pct.toFixed(0) + "%";
  }
}

/**
 * Build data for the category chart for the given root, taxa, and category.
 */
function dataForCategoryChart(rootTaxon, taxa, dataCategory) {
  const individualResults = {};
  const allCategories = {};

  // Initialize categories based on filter data
  Checklist.filter.data[dataCategory]?.all.forEach((i) => {
    allCategories[i] = { color: "", sum: 0 };
  });
  if (Object.keys(allCategories).length === 0) return null;

  taxa.forEach((taxon) => {
    const currentRootIndex = taxon.t.findIndex((x) => x.n === rootTaxon);
    if (currentRootIndex < 0 && rootTaxon !== "") return;
    const child = taxon.t[currentRootIndex + 1]?.n;
    if (child !== undefined) {
      if (!individualResults.hasOwnProperty(child)) {
        individualResults[child] = { categories: {}, sum: 0, children: 0 };
      }
      let categoryData = [];

      let categoryType = Checklist.filter.data[dataCategory].type;
      switch (categoryType) {
        case "text":
          categoryData = Checklist.getDataFromDataPath(taxon.d, dataCategory);
          if (!Array.isArray(categoryData)) {
            categoryData = [categoryData];
          }
          break;
        case "map regions":
          let tempCategoryData = Checklist.getDataFromDataPath(
            taxon.d,
            dataCategory
          );

          Object.keys(tempCategoryData).forEach((key) => {
            let isPresent =
              tempCategoryData[key] && tempCategoryData[key] != "";
            if (isPresent) {
              let region = Checklist.getMetaForDataPath(
                dataCategory + "." + key
              ).title;
              categoryData.push(region);
            }
          });
          break;

        default:
          break;
      }
      // Count deeper levels as "children"
      if (currentRootIndex < taxon.t.length - 2) {
        individualResults[child].children++;
      }

      categoryData = [...new Set(categoryData)];

      categoryData.forEach((cd) => {
        if (cd == "") {
          return;
        }

        if (!individualResults[child].categories.hasOwnProperty(cd)) {
          individualResults[child].categories[cd] = 0;
        }
        individualResults[child].categories[cd]++;
        allCategories[cd].sum++;
      });
      individualResults[child].sum++;
    }
  });

  if (Object.keys(allCategories).length === 0) return null;
  return {
    individualResults,
    sumByCategory: allCategories,
  };
}

// ------------------------------------------------------
// MAIN EXPORT FUNCTION
// ------------------------------------------------------

export function categoryChart(filteredTaxa) {
  const result = [];

  //remove all non-leaf taxa
  filteredTaxa = filterTerminalLeaves(filteredTaxa);

  // Build available filter options (only small lists)
  const filtersToDisplay = Object.keys(Checklist.filter.data).filter(
    (f) =>
      (Checklist.filter.data[f].type === "text" ||
        Checklist.filter.data[f].type === "map regions") &&
      Checklist.filter.data[f].all.length < 40
  );

  // Get chart data based on current settings
  let categorizedData = dataForCategoryChart(
    categoryRoot,
    filteredTaxa,
    categoryToView
  );

  if (categorizedData == null) {
    categoryRoot = "";
    Settings.categoryChartRoot("");
    categoryToView = "";
    Settings.categoryChartCategory("");
    categorizedData = dataForCategoryChart(
      categoryRoot,
      filteredTaxa,
      categoryToView
    );
  }

  // ------------------------------------------------------
  // RENDER CONTROL PANEL
  // ------------------------------------------------------
  result.push(
    m("div[style=margin: 0.25em]", [
      m("table.buttons-table", [
        // Row for category selection
        m("tr", [
          m(
            "td[style=max-width: fit-content]",
            _t("view_cat_category_to_analyze")
          ),
          m(
            "td[colspan=4]",
            filtersToDisplay.map((f) => {
              const title = Checklist.getMetaForDataPath(f).searchCategory;
              return m(
                "button" + (f === categoryToView ? ".selected" : ""),
                {
                  onclick: () => {
                    if (f === categoryToView) return false;
                    categoryToView = f;
                    Settings.categoryChartCategory(f);
                  },
                },
                title
              );
            })
          ),
          m("td"),
        ]),
        // Row for sum method & display mode (if category is set)
        categoryToView === ""
          ? null
          : m("tr", [
              m("td[style=max-width: fit-content]", _t("view_cat_sum_method")),
              m(
                "td",
                sumMethods.map((mt) =>
                  m(
                    "button" + (mt.method === sumMethod ? ".selected" : ""),
                    {
                      onclick: () => {
                        if (mt.method === sumMethod) return false;
                        sumMethod = mt.method;
                        Settings.categoryChartSumMethod(sumMethod);
                      },
                    },
                    mt.name
                  )
                )
              ),
              sumMethod === ""
                ? null
                : m(
                    "td[style=max-width: fit-content; padding-left: 2em]",
                    _t("view_cat_display")
                  ),
              sumMethod === ""
                ? null
                : m(
                    "td",
                    displayStyles.map((ds) =>
                      m(
                        "button" + (ds.method === display ? ".selected" : ""),
                        {
                          onclick: () => {
                            if (ds.method === display) return false;
                            display = ds.method;
                            Settings.categoryChartDisplayMode(display);
                          },
                        },
                        ds.name
                      )
                    )
                  ),
            ]),
      ]),
      // Info label (if there is data to show)
      categoryToView === "" ||
      sumMethod === "" ||
      Object.keys(categorizedData.individualResults).length === 0
        ? null
        : m(".info-labels", [
            m(
              ".info-label",
              m.trust(
                Checklist.queryKey() === "{}"
                  ? _t("view_cat_counted_all", [
                      categoryVerb(categoryToView, sumMethod),
                    ])
                  : _tf("view_cat_counted_filter", [
                      categoryVerb(categoryToView, sumMethod),
                      Settings.pinnedSearches.getHumanNameForSearch(
                        JSON.parse(Checklist.queryKey())
                      ),
                    ])
              )
            ),
          ]),
    ])
  );

  // ------------------------------------------------------
  // RENDER CATEGORY CHART TABLE
  // ------------------------------------------------------
  if (categoryToView !== "" && sumMethod !== "" && categorizedData != null) {
    // No results? Return only the control panel.
    if (Object.keys(categorizedData.individualResults).length === 0) {
      return result;
    }

    const orderedCategories = sortByCustomOrder(
      Object.keys(categorizedData.sumByCategory),
      "data",
      categoryToView
    );

    // Build header row with navigation "up" button and rotated headers.
    const headerCells = [
      m(
        "th.sticky-row.sticky-column.up-button[style=z-index: 9999]",
        {
          onclick: () => {
            const parent = parentOf(categoryRoot, filteredTaxa);
            categoryRoot = parent;
            Settings.categoryChartRoot(parent);
          },
        },
        [
          categoryRoot === ""
            ? null
            : m("img[src=img/ui/checklist/level_up.svg][style=height: 1em]"),
          categoryRoot,
        ]
      ),
      ...orderedCategories.map((cKey) =>
        m(
          "th.sticky-row.rotate[style=border-bottom: 0.5em solid;]",
          m("div", m("span", cKey))
        )
      ),
    ];

    // Build each row for individual taxon results.
    const rows = Object.keys(categorizedData.individualResults).map(
      (taxonKey) => {
        const taxon = categorizedData.individualResults[taxonKey];

        const leftCell = m(
          "td.sticky-column" + (taxon.children === 0 ? ".noclick" : ""),
          {
            onclick: () => {
              if (taxon.children === 0) return false;
              categoryRoot = taxonKey;
              Settings.categoryChartRoot(taxonKey);
            },
          },
          m(
            "div[style=display: flex; flex-direction: row; flex-wrap: nowrap; align-items: center;]",
            [
              m("b[style=flex-grow: 1]", taxonKey),
              taxon.children === 0
                ? null
                : m(
                    "span[style=margin-left: 0.75em; color: gray; font-size: 85%]",
                    taxon.children
                  ),
            ]
          )
        );

        const dataCells = orderedCategories.map((cKey) => {
          let basis = 0;
          if (sumMethod === "category") {
            basis = categorizedData.sumByCategory[cKey].sum;
          } else if (sumMethod === "taxon") {
            basis = taxon.sum;
          } else {
            console.error("Unknown method", sumMethod);
          }

          if (Object.keys(taxon.categories).includes(cKey)) {
            const ratio = taxon.categories[cKey] / basis;
            const borderSize = Math.max(ratio * 4, 0.01);
            const title = cellVerb(
              toPctString(ratio),
              cKey,
              taxonKey,
              taxon.categories[cKey]
            );
            return m(
              `td[style=border-left: ${borderSize}em solid;][title="${title}"]`,
              m(
                "div.number-container",
                numericDisplay(taxon.categories[cKey], toPctString(ratio))
              )
            );
          } else {
            return m("td[style=border-left: 0.01em solid;]");
          }
        });

        return [leftCell, ...dataCells];
      }
    );

    result.push(
      m(".table-flex-container", [
        m(".table-wrapper", [
          m("table.category-view", [
            m("tr.header-row", headerCells),
            ...rows.map((r) => m("tr", r)),
          ]),
        ]),
      ])
    );
  }

  return result;
}

/**
 * Returns true if the smallPath is a prefix of bigPath.
 * Each node is compared by concatenating `n` and `a` with a space.
 */
function isPrefix(smallPath, bigPath) {
  if (smallPath.length >= bigPath.length) return false;
  for (let i = 0; i < smallPath.length; i++) {
    const smallNode = `${smallPath[i].n} ${smallPath[i].a}`;
    const bigNode = `${bigPath[i].n} ${bigPath[i].a}`;
    if (smallNode !== bigNode) {
      return false;
    }
  }
  return true;
}

/**
 * Filters an array of nodes and returns only the terminal leaves.
 * A terminal leaf is an object whose path is not a prefix of any other node's path.
 * Additionally, duplicate terminal leaves (with identical paths) are removed.
 *
 * @param {Array} nodes - Array of objects that include a property "t" (an array of nodes).
 * @returns {Array} filtered array containing only unique terminal leaves.
 */
function filterTerminalLeaves(nodes) {
  // First, filter out nodes that are non-terminal (i.e. that are prefixes of any other node's path)
  const terminalLeaves = nodes.filter((node) => {
    const nodePath = node.t;
    // Check if there is any other node for which node.t is a prefix of other.t.
    const isIntermediate = nodes.some((other) => {
      if (other === node) return false;
      return isPrefix(nodePath, other.t);
    });
    return !isIntermediate;
  });

  // Remove duplicate terminal leaves.
  // We'll compute a signature for each node's path in the form "A x->B y->..." .
  const seenPaths = new Set();
  const uniqueTerminals = [];
  terminalLeaves.forEach((node) => {
    const pathSignature = node.t.map((n) => `${n.n} ${n.a}`).join("->");
    if (!seenPaths.has(pathSignature)) {
      seenPaths.add(pathSignature);
      uniqueTerminals.push(node);
    }
  });
  return uniqueTerminals;
}

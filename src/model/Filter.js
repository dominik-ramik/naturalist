import { routeTo } from "../components/Utils.js";
import { Checklist } from "./Checklist.js";
import { _t } from "./I18n.js";
import { textLowerCaseAccentless } from "../components/Utils.js";
import { Settings } from "./Settings.js";

// The filter object and all its methods, as previously in Checklist.js
export let Filter = {
  taxa: {},
  data: {},
  text: "",
  delayCommitDataPath: "",
  _queryResultCache: {},

  commit: function (specificRoute) {
    if (specificRoute) {
      routeTo(specificRoute);
    } else {
      routeTo("/checklist");
    }
  },

  numberOfActive: function () {
    let count = 0;

    if (this.text != "") {
      count++;
    }

    ["taxa", "data"].forEach(type => {
      Object.keys(Filter[type]).forEach(filterKey => {
        if (Filter[type][filterKey].selected.length > 0) {
          count++;
        }
      })
    })

    console.log(Filter.taxa, Filter.data, Filter.text, count);

    return count;
  },

  setFromQuery: function (query) {
    Filter.clear();
    ["taxa", "data"].forEach(function (type) {
      if (query[type]) {
        Object.keys(query[type]).forEach(function (dataPath) {
          if (
            Filter[type][dataPath].type == "text" ||
            Filter[type][dataPath].type == "map regions" ||
            Filter[type][dataPath].type == "badge"
          ) {
            Filter[type][dataPath].selected = query[type][dataPath];
          } else if (Filter[type][dataPath].type == "number") {
            Filter[type][dataPath].numeric.operation =
              query[type][dataPath].o;
            Filter[type][dataPath].numeric.threshold1 =
              query[type][dataPath].a;
            if (query[type][dataPath].hasOwnProperty("b")) {
              Filter[type][dataPath].numeric.threshold2 =
                query[type][dataPath].b;
            }
          }
        });
      }
    });
    if (query.text && query.text.length > 0)
      Filter.text = query.text;
  },
  clear: function () {
    Object.keys(Filter.taxa).forEach(function (dataPath) {
      Filter.taxa[dataPath].selected = [];
    });
    Object.keys(Filter.data).forEach(function (dataPath) {
      Filter.data[dataPath].selected = [];
      Filter.data[dataPath].numeric = {
        threshold1: null,
        threshold2: null,
        operation: "",
      };
    });
    Filter.text = "";
  },
  isEmpty: function () {
    let countFilters = 0;
    ["taxa", "data"].forEach(function (type) {
      Object.keys(Filter[type]).forEach(function (dataPath) {
        if (
          Filter[type][dataPath].type == "text" ||
          Filter[type][dataPath].type == "map regions" ||
          Filter[type][dataPath].type == "badge"
        ) {
          countFilters += Filter[type][dataPath].selected.length;
        } else if (Filter[type][dataPath].type == "number") {
          if (Filter[type][dataPath].numeric.operation != "") {
            countFilters++;
          }
        }
      });
    });
    if (Filter.text.length > 0) countFilters++;

    return countFilters == 0;
  },
  numericFilterToHumanReadable: function (
    dataPath,
    operation,
    threshold1,
    threshold2,
    formatPre,
    formatPost,
    ommitSearchCategory
  ) {
    let title = "";
    if (ommitSearchCategory) {
      title +=
        (formatPre ? formatPre : "") +
        Checklist.getMetaForDataPath(dataPath).searchCategory +
        (formatPost ? formatPost : "") +
        " ";
    }
    title += _t("numeric_filter_" + operation + "_short") + " ";
    title += threshold1.toLocaleString();
    if (Filter.numericFilters[operation].values > 1) {
      switch (operation) {
        case "between":
          title += " " + _t("numeric_filter_and") + " ";
          break;
        case "around":
          title += " " + _t("numeric_filter_plusminus") + " ";
        default:
          break;
      }
      title += threshold2.toLocaleString();
    }

    return title;
  },
  numericFilters: {
    equal: {
      operation: "equal",
      icon: "equal",
      values: 1,
      comparer: function (valueToTest, threshold1, threshold2) {
        return valueToTest == threshold1;
      },
    },
    lesser: {
      operation: "lesser",
      icon: "lesser",
      values: 1,
      comparer: function (valueToTest, threshold1, threshold2) {
        return valueToTest < threshold1;
      },
    },
    lesserequal: {
      operation: "lesserequal",
      icon: "lesserequal",
      values: 1,
      comparer: function (valueToTest, threshold1, threshold2) {
        return valueToTest <= threshold1;
      },
    },
    greater: {
      operation: "greater",
      icon: "greater",
      values: 1,
      comparer: function (valueToTest, threshold1, threshold2) {
        return valueToTest > threshold1;
      },
    },
    greaterequal: {
      operation: "greaterequal",
      icon: "greaterequal",
      values: 1,
      comparer: function (valueToTest, threshold1, threshold2) {
        return valueToTest >= threshold1;
      },
    },
    between: {
      operation: "between",
      icon: "between",
      values: 2,
      comparer: function (valueToTest, threshold1, threshold2) {
        return valueToTest >= threshold1 && valueToTest <= threshold2;
      },
    },
    around: {
      operation: "around",
      icon: "around",
      values: 2,
      comparer: function (valueToTest, threshold1, threshold2) {
        return (
          valueToTest >= threshold1 - threshold2 &&
          valueToTest <= threshold1 + threshold2
        );
      },
    },
  },

  calculatePossibleFilterValues: function (taxa) {
    //clear filter possible data
    ["taxa", "data"].forEach(function (dataType) {
      Object.keys(Filter[dataType]).forEach(function (dataPath) {
        if (Filter.delayCommitDataPath == dataType + "." + dataPath) {
          return; //delay this dataPath
        } else {
          if (
            Filter[dataType][dataPath].type == "text" ||
            Filter[dataType][dataPath].type == "map regions" ||
            Filter[dataType][dataPath].type == "badge"
          ) {
            Filter[dataType][dataPath].possible = {};
          }
          if (Filter[dataType][dataPath].type == "number") {
            Filter[dataType][dataPath].possible = [];
            Filter[dataType][dataPath].min = null;
            Filter[dataType][dataPath].max = null;
          }
        }
      });
    });

    taxa.forEach(function (taxon, index) {
      //add number of occurrences of possible taxa items
      Object.keys(Filter.taxa).forEach(function (dataPath, index) {
        if (Filter.delayCommitDataPath == "taxa." + dataPath) {
          return; //delay this dataPath
        }
        if (index >= taxon.t.length) {
          return; //happens when we have data items on a higher than lowest ranking taxon (eg. genus)
        }
        let value = taxon.t[index].name;
        if (
          Filter.taxa[dataPath].type == "text" ||
          Filter.data[dataPath].type == "map regions"
        ) {
          if (!Filter.taxa[dataPath].possible.hasOwnProperty(value)) {
            Filter.taxa[dataPath].possible[value] = 0;
          }
          Filter.taxa[dataPath].possible[value]++;
        }
      });
      //add number of occurrences of possible data items
      Object.keys(Filter.data).forEach(function (dataPath) {
        if (Filter.delayCommitDataPath == "data." + dataPath) {
          return; //delay this dataPath
        }
        let value = Checklist.getDataFromDataPath(taxon.d, dataPath);

        if (value === null) {
          return;
        }

        let leafData = Checklist.getAllLeafData(value, false, dataPath);
        if (
          Filter.data[dataPath].type == "text" ||
          Filter.data[dataPath].type == "map regions" ||
          Filter.data[dataPath].type == "badge"
        ) {
          leafData.forEach(function (value) {
            if (typeof value === "string" && value.trim() == "") {
              return;
            }

            if (
              !Filter.data[dataPath].possible.hasOwnProperty(value)
            ) {
              Filter.data[dataPath].possible[value] = 0;
            }
            Filter.data[dataPath].possible[value]++;
          });
        } else if (Filter.data[dataPath].type == "number") {
          leafData.forEach(function (value) {
            if (
              Filter.data[dataPath].min === null ||
              value < Filter.data[dataPath].min
            ) {
              Filter.data[dataPath].min = value;
            }
            if (
              Filter.data[dataPath].max === null ||
              value > Filter.data[dataPath].max
            ) {
              Filter.data[dataPath].max = value;
            }

            Filter.data[dataPath].possible.push(value);
          });
        }
      });
    });

    Object.keys(Filter.data).forEach(function (dataPath) {
      if (Filter.data[dataPath].type == "number") {
        if (
          Filter.data[dataPath].globalMin === undefined ||
          Filter.data[dataPath].globalMin === null
        ) {
          Filter.data[dataPath].globalMin =
            Filter.data[dataPath].min;
        }
        if (
          Filter.data[dataPath].globalMax === undefined ||
          Filter.data[dataPath].globalMax === null
        ) {
          Filter.data[dataPath].globalMax =
            Filter.data[dataPath].max;
        }
      }
    });
  },

  queryKey: function () {
    let key = { taxa: {}, data: {} };
    Object.keys(key).forEach(function (type) {
      Object.keys(Filter[type]).forEach(function (dataPath) {
        if (
          Filter[type][dataPath].type == "text" ||
          Filter[type][dataPath].type == "map regions" ||
          Filter[type][dataPath].type == "badge"
        ) {
          if (Filter[type][dataPath].selected.length > 0) {
            key[type][dataPath] = [];
          }
          Filter[type][dataPath].selected.forEach(function (
            selected
          ) {
            key[type][dataPath].push(selected);
          });
        } else if (Filter[type][dataPath].type == "number") {
          if (Filter[type][dataPath].numeric.operation != "") {
            key[type][dataPath] = {};
            key[type][dataPath].o =
              Filter[type][dataPath].numeric.operation;
            key[type][dataPath].a =
              Filter[type][dataPath].numeric.threshold1;
            if (
              Filter.numericFilters[
                Filter[type][dataPath].numeric.operation
              ].values > 1
            ) {
              key[type][dataPath].b =
                Filter[type][dataPath].numeric.threshold2;
            }
          }
        }
      });
    });

    if (Object.keys(key.taxa).length == 0) {
      delete key.taxa;
    }
    if (Object.keys(key.data).length == 0) {
      delete key.data;
    }

    if (Filter.text.length > 0) {
      key.text = Filter.text;
    }

    let stringKey = JSON.stringify(key);

    return stringKey;
  },

  queryCache: {
    cache: function (searchResults) {
      let queryKey = Filter.queryKey();
      Filter._queryResultCache[queryKey] = {
        taxa: searchResults,
        // Store only a lightweight snapshot of filter state instead of deep cloning
        filterSnapshot: {
          text: Filter.text,
          taxa: Filter._createFilterSnapshot(Filter.taxa),
          data: Filter._createFilterSnapshot(Filter.data)
        }
      };
    },
    retrieve: function () {
      let queryKey = Filter.queryKey();

      if (Filter._queryResultCache.hasOwnProperty(queryKey)) {
        return Filter._queryResultCache[queryKey];
      }

      return false;
    },
  },

  getTaxaForCurrentQuery: function () {
    if (!Checklist._isDataReady) return [];

    Filter._sanitizeFilters();

    if (Filter.isEmpty()) {
      let allData = Checklist.getData().checklist;
      Filter.calculatePossibleFilterValues(allData);
      return allData;
    }

    let cacheResult = Filter.queryCache.retrieve();
    if (cacheResult) {
      Filter.calculatePossibleFilterValues(cacheResult.taxa);
      return cacheResult.taxa;
    }

    let includeChildren = Settings.includeMatchChildren();
    let checklistData = Checklist.getData().checklist;
    let fullTextIndex = Checklist._dataFulltextIndex[Checklist.getCurrentLanguage()];

    // --- PREPARE REQUIREMENTS ---
    let requirements = [];
    let activeFilters = Filter._getActiveFilters();

    activeFilters.taxa.forEach((f) => {
      requirements.push({ type: "taxa", filter: f, bit: 1 << requirements.length });
    });

    activeFilters.data.forEach((f) => {
      requirements.push({ type: "data", filter: f, bit: 1 << requirements.length });
    });

    if (Filter.text.length > 0) {
      // 1. Split by the OR separator to identify potential terms
      let rawTerms = Filter.text.split(Settings.SEARCH_OR_SEPARATOR);

      // 2. Process terms: Normalize, Trim, Escape, and Filter invalid ones
      let validTerms = rawTerms.map(function (term) {
        // Normalize (lowercase/accents) and remove surrounding whitespace
        let clean = textLowerCaseAccentless(term).trim();

        // Escape Regex characters to ensure text is treated literally
        return clean.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      }).filter(function (term) {
        // Remove empty strings caused by "||", "| ", or trailing pipes
        return term.length > 0;
      });

      // 3. Construct Regex only if we have valid terms
      if (validTerms.length > 0) {
        // Join terms with OR operator, prepending word boundary (\b) to each
        // Example: "term1" and "term2" becomes "\bterm1|\bterm2"
        let pattern = validTerms.map(t => "\\b" + t).join("|");

        // Wrap in non-capturing group for safety: (?:\bterm1|\bterm2)
        let regex = new RegExp("(?:" + pattern + ")");

        requirements.push({ type: "text", regex: regex, bit: 1 << requirements.length });
      }
    }

    const TARGET_MASK = (1 << requirements.length) - 1;
    const dataLength = checklistData.length;

    // --- DATA STRUCTURES ---
    // Stores the local match mask for every item (Order Independent)
    let localMasks = new Int32Array(dataLength);
    // Maps unique path string -> index in checklistData
    let pathMap = new Map();
    // Cache path keys to avoid regenerating strings in Pass 2
    let pathKeys = new Array(dataLength);

    // --- PASS 1: CALCULATE LOCAL COMPLIANCE ---
    for (let i = 0; i < dataLength; i++) {
      let item = checklistData[i];
      // Generate and cache the unique path key
      let pathKey = item.t.map((t) => t.name).join("|");
      pathKeys[i] = pathKey;
      pathMap.set(pathKey, i);

      let localMask = 0;
      for (let r = 0; r < requirements.length; r++) {
        let req = requirements[r];
        let passed = false;

        if (req.type === "taxa") {
          if (req.filter.index < item.t.length && req.filter.selected.includes(item.t[req.filter.index].name)) {
            passed = true;
          }
        } else if (req.type === "data") {
          passed = Filter._checkDataFilters(item, [req.filter]);
        } else if (req.type === "text") {
          passed = req.regex.test(Checklist.getSearchableTextForTaxon(i));
        }

        if (passed) localMask |= req.bit;
      }
      localMasks[i] = localMask;
    }

    let matchedItems = [];
    let matchedKeySet = new Set();
    let parentKeySet = new Set();

    // --- PASS 2: RESOLVE INHERITANCE ---
    for (let i = 0; i < dataLength; i++) {
      let item = checklistData[i];
      let currentMask = localMasks[i];

      // If local match isn't perfect and we are allowed to inherit...
      if (currentMask !== TARGET_MASK && includeChildren) {
        let tempPath = pathKeys[i];

        // Walk up the tree to find ancestors
        while (tempPath.indexOf("|") > -1) {
          tempPath = tempPath.substring(0, tempPath.lastIndexOf("|"));

          if (pathMap.has(tempPath)) {
            let parentIndex = pathMap.get(tempPath);
            currentMask |= localMasks[parentIndex];
          }

          // Optimization: If we already match everything, stop looking up
          if (currentMask === TARGET_MASK) break;
        }
      }

      if (currentMask === TARGET_MASK) {
        matchedItems.push(item);
        let itemKey = item._key || pathKeys[i];
        matchedKeySet.add(itemKey);

        // Ensure tree structure (parents) are added to results later
        let tempPath = "";
        for (let k = 0; k < item.t.length - 1; k++) {
          tempPath += (k > 0 ? "|" : "") + item.t[k].name;
          if (!matchedKeySet.has(tempPath)) {
            parentKeySet.add(tempPath);
          }
        }
      }
    }

    let finalSearchResults = Filter._assembleResults(matchedItems, parentKeySet, checklistData);
    Filter.calculatePossibleFilterValues(finalSearchResults);
    Filter.queryCache.cache(finalSearchResults);

    return finalSearchResults;
  },

  // Helper methods
  _sanitizeFilters: function () {
    // Remove invalid filter values
    ["taxa", "data"].forEach(function (type) {
      Object.keys(Filter[type]).forEach(function (dataPath) {
        if (Filter[type][dataPath].selected) {
          Filter[type][dataPath].selected = Filter[type][dataPath].selected.filter(
            v => v != null && v !== ""
          );
        }
      });
    });
  },

  _createFilterSnapshot: function (filterObj) {
    let snapshot = {};
    Object.keys(filterObj).forEach(key => {
      snapshot[key] = {
        selected: [...(filterObj[key].selected || [])],
        numeric: filterObj[key].numeric ? { ...filterObj[key].numeric } : null
      };
    });
    return snapshot;
  },

  _getActiveFilters: function () {
    let active = { taxa: [], data: [] };

    // Get the keys once to establish the index order
    let taxaKeys = Object.keys(Filter.taxa);

    taxaKeys.forEach((dataPath, index) => {
      if (Filter.taxa[dataPath].selected.length > 0) {
        active.taxa.push({
          dataPath,
          index: index, // Store the pre-calculated index
          selected: Filter.taxa[dataPath].selected
        });
      }
    });

    Object.keys(Filter.data).forEach(dataPath => {
      if (Filter.data[dataPath].type === "number") {
        if (Filter.data[dataPath].numeric.operation) {
          active.data.push({
            dataPath,
            type: "number",
            numeric: Filter.data[dataPath].numeric
          });
        }
      } else if (Filter.data[dataPath].selected.length > 0) {
        active.data.push({
          dataPath,
          type: Filter.data[dataPath].type,
          selected: Filter.data[dataPath].selected
        });
      }
    });

    return active;
  },

  _checkTaxaFilters: function (item, taxaFilters) {
    for (let filter of taxaFilters) {
      // Use the pre-calculated index from _getActiveFilters
      let taxonIndex = filter.index;

      if (taxonIndex >= item.t.length) return false;

      let value = item.t[taxonIndex].name;
      if (!filter.selected.includes(value)) {
        return false;
      }
    }
    return true;
  },

  _checkDataFilters: function (item, dataFilters) {
    for (let filter of dataFilters) {
      let value = Checklist.getDataFromDataPath(item.d, filter.dataPath);

      if (value === null) return false;

      if (filter.type === "number") {
        let leafData = Checklist.getAllLeafData(value, false, filter.dataPath);
        let passes = leafData.some(v =>
          Filter.numericFilters[filter.numeric.operation].comparer(
            v,
            filter.numeric.threshold1,
            filter.numeric.threshold2
          )
        );
        if (!passes) return false;
      } else {
        let leafData = Checklist.getAllLeafData(value, false, filter.dataPath);
        let found = leafData.some(v => filter.selected.includes(v));
        if (!found) return false;
      }
    }
    return true;
  },

  _assembleResults: function (matchedItems, parentKeySet, checklistData) {
    let finalResults = [...matchedItems];

    // Add parent taxa
    if (parentKeySet.size > 0) {
      checklistData.forEach(item => {
        let itemKey = item._key || item.t.map(t => t.name).join("|");
        if (parentKeySet.has(itemKey)) {
          finalResults.push(item);
        }
      });
    }

    return finalResults;
  }
};
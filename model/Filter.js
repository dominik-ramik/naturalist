import { routeTo } from "../components/Utils.js";
import { Checklist } from "./Checklist.js";
import { _t } from "./I18n.js";
import { getGradedColor, textLowerCaseAccentless } from "../components/Utils.js";

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
      routeTo("/search");
    }
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
    console.time("Filter.getTaxaForCurrentQuery - Total");
    
    if (!Checklist._isDataReady) {
      console.timeEnd("Filter.getTaxaForCurrentQuery - Total");
      return [];
    }

    // Phase 1.1: Pre-sanitize filters once
    console.time("Filter.getTaxaForCurrentQuery - Sanitize");
    Filter._sanitizeFilters();
    console.timeEnd("Filter.getTaxaForCurrentQuery - Sanitize");

    let emptyFilter = Filter.isEmpty();
    
    // Phase 1.2: Early return for cached results
    console.time("Filter.getTaxaForCurrentQuery - Cache Check");
    let cacheResult = Filter.queryCache.retrieve();
    console.timeEnd("Filter.getTaxaForCurrentQuery - Cache Check");

    if (cacheResult) {
      console.time("Filter.getTaxaForCurrentQuery - Calculate Possible");
      Filter.calculatePossibleFilterValues(cacheResult.taxa);
      console.timeEnd("Filter.getTaxaForCurrentQuery - Calculate Possible");
      console.timeEnd("Filter.getTaxaForCurrentQuery - Total");
      return cacheResult.taxa;
    }

    // Phase 2.1: Pre-compile regex once
    console.time("Filter.getTaxaForCurrentQuery - Compile Regex");
    let textFilterRegex = null;
    if (Filter.text.length > 0) {
      let textFilter = textLowerCaseAccentless(Filter.text).replace(
        /[-\/\\^$*+?.()|[\]{}]/g,
        "\\$&"
      );
      textFilterRegex = new RegExp("\\b" + textFilter);
    }
    console.timeEnd("Filter.getTaxaForCurrentQuery - Compile Regex");

    // Phase 2.2: Pre-compute filter criteria
    console.time("Filter.getTaxaForCurrentQuery - Get Active Filters");
    let activeFilters = Filter._getActiveFilters();
    console.timeEnd("Filter.getTaxaForCurrentQuery - Get Active Filters");

    let matchedItems = [];
    let parentKeySet = new Set();
    let matchedKeySet = new Set();

    let checklistData = Checklist.getData().checklist;

    // Single pass with early termination
    console.time("Filter.getTaxaForCurrentQuery - Main Loop");
    console.log("Processing items:", checklistData.length);
    
    checklistData.forEach(function (item, itemIndex) {
      let itemKey = item._key || item.t.map((t) => t.name).join("|");
      
      if (emptyFilter) {
        matchedItems.push(item);
        matchedKeySet.add(itemKey);
        return;
      }

      let found = true;

      // Taxa filter
      if (activeFilters.taxa.length > 0) {
        found = Filter._checkTaxaFilters(item, activeFilters.taxa);
      }

      // Data filter
      if (found && activeFilters.data.length > 0) {
        found = Filter._checkDataFilters(item, activeFilters.data);
      }

      // Text filter
      if (found && textFilterRegex) {
        found = textFilterRegex.test(
          Checklist._dataFulltextIndex[Checklist.getCurrentLanguage()][itemIndex]
        );
      }

      if (found) {
        matchedItems.push(item);
        matchedKeySet.add(itemKey);
        
        // Collect parent keys
        for (let i = 1; i < item.t.length; i++) {
          let parentKey = item.t.slice(0, i).map((t) => t.name).join("|");
          if (!matchedKeySet.has(parentKey)) {
            parentKeySet.add(parentKey);
          }
        }
      }
    });
    console.timeEnd("Filter.getTaxaForCurrentQuery - Main Loop");
    console.log("Matched items:", matchedItems.length, "Parent keys:", parentKeySet.size);

    // Assemble final results
    console.time("Filter.getTaxaForCurrentQuery - Assemble Results");
    let finalSearchResults = Filter._assembleResults(matchedItems, parentKeySet, checklistData);
    console.timeEnd("Filter.getTaxaForCurrentQuery - Assemble Results");

    console.time("Filter.getTaxaForCurrentQuery - Calculate Possible");
    Filter.calculatePossibleFilterValues(finalSearchResults);
    console.timeEnd("Filter.getTaxaForCurrentQuery - Calculate Possible");

    console.time("Filter.getTaxaForCurrentQuery - Cache Results");
    Filter.queryCache.cache(finalSearchResults);
    console.timeEnd("Filter.getTaxaForCurrentQuery - Cache Results");

    console.timeEnd("Filter.getTaxaForCurrentQuery - Total");
    return finalSearchResults;
  },

  // Helper methods
  _sanitizeFilters: function() {
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

  _createFilterSnapshot: function(filterObj) {
    let snapshot = {};
    Object.keys(filterObj).forEach(key => {
      snapshot[key] = {
        selected: [...(filterObj[key].selected || [])],
        numeric: filterObj[key].numeric ? {...filterObj[key].numeric} : null
      };
    });
    return snapshot;
  },

  _getActiveFilters: function() {
    let active = { taxa: [], data: [] };
    
    Object.keys(Filter.taxa).forEach(dataPath => {
      if (Filter.taxa[dataPath].selected.length > 0) {
        active.taxa.push({
          dataPath,
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

  _checkTaxaFilters: function(item, taxaFilters) {
    for (let filter of taxaFilters) {
      let taxonIndex = Object.keys(Filter.taxa).indexOf(filter.dataPath);
      if (taxonIndex >= item.t.length) continue;
      
      let value = item.t[taxonIndex].name;
      if (!filter.selected.includes(value)) {
        return false;
      }
    }
    return true;
  },

  _checkDataFilters: function(item, dataFilters) {
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

  _assembleResults: function(matchedItems, parentKeySet, checklistData) {
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
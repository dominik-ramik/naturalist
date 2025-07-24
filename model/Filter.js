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
      Filter._queryResultCache[queryKey] = {};
      Filter._queryResultCache[queryKey].taxa = searchResults;
      Filter._queryResultCache[queryKey].filter = JSON.parse(
        JSON.stringify(Filter)
      );
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
    if (!Checklist._isDataReady) {
      return [];
    }

    //sanitize filter ... remove impossible selected (when in taxa selecting two higher units then one lower and then unchecking the one higher)
    ["taxa", "data"].forEach(function (type) {
      Object.keys(Filter[type]).forEach(function (dataPath) {
        Filter[type][dataPath].selected = Filter[type][
          dataPath
        ].selected.filter(function (selectedItem) {
          if (
            Object.keys(Filter[type][dataPath].possible).indexOf(
              selectedItem
            ) < 0
          ) {
            return false;
          } else {
            return true;
          }
        });
      });
    });

    let emptyFilter = Filter.isEmpty();

    let cacheResult = Filter.queryCache.retrieve();

    if (cacheResult) {
      Filter.calculatePossibleFilterValues(cacheResult.taxa);
      return cacheResult.taxa;
    }

    let textFilter = textLowerCaseAccentless(Filter.text).replace(
      /[-\/\\^$*+?.()|[\]{}]/g,
      "\\$&"
    ); //escape for RegEx use
    let textFilterRegex = new RegExp("\\b" + textFilter);

    let matchedItems = [];
    let parentPaths = [];
    let matchedKeys = new Set();
    let totalProcessed = 0;
    let taxaFilterRejects = 0;
    let dataFilterRejects = 0;
    let textFilterRejects = 0;

    Checklist.getData().checklist.forEach(function (item, itemIndex) {
      totalProcessed++;
      let found = true;
      let rejectionReason = "";

      if (!emptyFilter) {
        // Taxa filter check with early termination
        for (let dataPath of Object.keys(Filter.taxa)) {
          let index = Object.keys(Filter.taxa).indexOf(dataPath);
          if (Filter.taxa[dataPath].selected.length == 0) {
            continue;
          }
          let foundAny = false;
          for (let selectedItem of Filter.taxa[dataPath].selected) {
            if (index < item.t.length && item.t[index].name == selectedItem) {
              foundAny = true;
              break;
            }
          }
          if (!foundAny) {
            found = false;
            rejectionReason = `taxa filter failed for ${dataPath}`;
            taxaFilterRejects++;
            break;
          }
        }
        // Data filter check with early termination
        if (found) {
          for (let dataPath of Object.keys(Filter.data)) {
            // Skip filters that have no criteria set
            let hasFilterCriteria = false;
            if (
              Filter.data[dataPath].type == "text" ||
              Filter.data[dataPath].type == "map regions" ||
              Filter.data[dataPath].type == "badge"
            ) {
              hasFilterCriteria = Filter.data[dataPath].selected.length > 0;
            } else if (Filter.data[dataPath].type == "number") {
              hasFilterCriteria = Filter.data[dataPath].numeric.operation != "";
            }
            
            if (!hasFilterCriteria) {
              continue; // Skip this filter entirely if no criteria is set
            }
            
            let foundAny = false;
            if (
              Filter.data[dataPath].type == "text" ||
              Filter.data[dataPath].type == "map regions" ||
              Filter.data[dataPath].type == "badge"
            ) {
              for (let selectedItem of Filter.data[dataPath]
                .selected) {
                let data = Checklist.getDataFromDataPath(item.d, dataPath);
                if (!data) {
                  continue;
                }
                let leafData = Checklist.getAllLeafData(data, true, dataPath);
                for (let leafDataItem of leafData) {
                  if (selectedItem == leafDataItem) {
                    foundAny = true;
                    break;
                  }
                }
                if (foundAny) break;
              }
            } else if (Filter.data[dataPath].type == "number") {
              let valueToCheck = Checklist.getDataFromDataPath(
                item.d,
                dataPath
              );
              let numericFilter =
                Filter.numericFilters[
                  Filter.data[dataPath].numeric.operation
                ];
              if (
                numericFilter.comparer(
                  valueToCheck,
                  Filter.data[dataPath].numeric.threshold1,
                  Filter.data[dataPath].numeric.threshold2
                )
              ) {
                foundAny = true;
              }
            }

            if (!foundAny) {
              found = false;
              rejectionReason = `data filter failed for ${dataPath}`;
              dataFilterRejects++;
              break;
            }
          }
        }
        // Text filter check with early termination
        if (found && textFilter.length > 0) {
          if (
            !textFilterRegex.test(
              Checklist._dataFulltextIndex[Checklist.getCurrentLanguage()][
                itemIndex
              ]
            )
          ) {
            found = false;
            rejectionReason = "text filter failed";
            textFilterRejects++;
          }
        }
      }

      if (found) {
        matchedItems.push(item);
        let key = item.t.map((t) => t.name).join("|");
        matchedKeys.add(key);
        // Add all parent paths (not just immediate parent)
        for (let i = 1; i < item.t.length; i++) {
          parentPaths.push(item.t.slice(0, i).map((t) => t.name));
        }
      }
    }); 

    // 2. Find true parent items
    let parentItems = [];
    let matchedKeySet = new Set(
      matchedItems.map((item) => item.t.map((t) => t.name).join("|"))
    );

    let parentKeySet = new Set();
    parentPaths.forEach(function (parentPathArr) {
      let parentKey = parentPathArr.join("|");
      if (parentKeySet.has(parentKey) || matchedKeySet.has(parentKey)) return;
      let parent = Checklist.getData().checklist.find(
        (candidate) => candidate.t.map((t) => t.name).join("|") === parentKey
      );
      if (parent) {
        parentItems.push(parent);
        parentKeySet.add(parentKey);
      }
    });

    // 3. Build final results in checklist order
    let finalSearchResults;
    
    if (emptyFilter) {
      // If no filters applied, return all checklist items
      finalSearchResults = Checklist.getData().checklist;
    } else {
      // FIX: Use key-based set for matching, not object reference
      let requiredKeySet = new Set([
        ...matchedItems.map(item => item.t.map(t => t.name).join("|")),
        ...parentItems.map(item => item.t.map(t => t.name).join("|"))
      ]);
      finalSearchResults = Checklist.getData().checklist.filter((item) =>
        requiredKeySet.has(item.t.map(t => t.name).join("|"))
      );
    }

    Filter.calculatePossibleFilterValues(finalSearchResults);
    Filter.queryCache.cache(finalSearchResults);

    return finalSearchResults;
  },
};
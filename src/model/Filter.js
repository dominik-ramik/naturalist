import dayjs from "dayjs";
import { routeTo } from "../components/Utils.js";
import { Checklist } from "./Checklist.js";
import { textLowerCaseAccentless } from "../components/Utils.js";
import { Settings } from "./Settings.js";
import { getMonthNumbers } from "./MonthNames.js";
import { parseNumericStatus } from "../components/MapregionsColorEngine.js";

const selectableFilterTypes = ["text", "mapregions", "category", "months"];
const rangeFilterTypes = ["number", "interval", "date"];
const exactSelectableRangeTypes = ["number", "date"];

function getSortedUniqueNumericValues(values) {
  return [...new Set(
    (values || []).filter(
      (value) => typeof value === "number" && !isNaN(value)
    )
  )].sort((a, b) => a - b);
}

function buildHumanReadableRangeFilter(
  dataPath,
  operation,
  threshold1,
  threshold2,
  formatThreshold,
  formatPre,
  formatPost,
  ommitSearchCategory
) {
  let title = "";
  if (!ommitSearchCategory) {
    title +=
      (formatPre ? formatPre : "") +
      Checklist.getMetaForDataPath(dataPath).searchCategory +
      (formatPost ? formatPost : "") +
      " ";
  }

  title += t("numeric_filter_" + operation + "_short") + " ";
  title += formatThreshold(threshold1);

  if (Filter.numericFilters[operation].values > 1) {
    switch (operation) {
      case "between":
        title += " " + t("numeric_filter_and") + " ";
        break;
      case "around":
        title += " " + t("numeric_filter_plusminus") + " ";
      default:
        break;
    }
    title += formatThreshold(threshold2);
  }

  return title;
}

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
    if (this.text !== "") count++;

    ["taxa", "data"].forEach(type => {
      Object.keys(Filter[type]).forEach(filterKey => {
        const f = Filter[type][filterKey];
        if (f.selected.length > 0 || (rangeFilterTypes.includes(f.type) && f.numeric.operation !== "")) {
          count++;
        }
        if (f.type === "mapregions" && _statusFilterIsActive(f.statusFilter)) {
          count++;
        }
      });
    });

    return count;
  },

  setFromQuery: function (query) {
    Filter.clear();
    ["taxa", "data"].forEach(type => {
      if (!query[type]) return;
      Object.keys(query[type]).forEach(dataPath => {
        const filterDef  = Filter[type][dataPath];
        const queryValue = query[type][dataPath];
        if (filterDef == null) return;

        if (filterDef.type === "mapregions") {
          // Support legacy plain-array format and new { regions, sf } object format
          const regionsArr = Array.isArray(queryValue)            ? queryValue
                           : Array.isArray(queryValue?.regions)   ? queryValue.regions
                           : [];
          filterDef.selected = regionsArr;

          if (queryValue?.sf) {
            const sf = queryValue.sf;
            filterDef.statusFilter.selectedStatuses = Array.isArray(sf.s) ? sf.s : [];
            filterDef.statusFilter.rangeMin = sf.min ?? null;
            filterDef.statusFilter.rangeMax = sf.max ?? null;
          }
          return;
        }

        if (
          selectableFilterTypes?.includes(filterDef.type) ||
          (exactSelectableRangeTypes.includes(filterDef.type) && Array.isArray(queryValue))
        ) {
          let parsedValues = Array.isArray(queryValue) ? queryValue : [queryValue];
          filterDef.selected = filterDef.type === "months"
            ? parsedValues.map(v => parseInt(v, 10))
            : parsedValues;
        } else if (rangeFilterTypes.includes(filterDef.type) && queryValue && typeof queryValue === "object") {
          filterDef.numeric.operation  = queryValue.o;
          filterDef.numeric.threshold1 = queryValue.a;
          if (queryValue.hasOwnProperty("b")) filterDef.numeric.threshold2 = queryValue.b;
        }
      });
    });
    if (query.text?.length > 0) Filter.text = query.text;
  },

  clear: function () {
    Object.keys(Filter.taxa).forEach(dataPath => {
      Filter.taxa[dataPath].selected = [];
    });
    Object.keys(Filter.data).forEach(dataPath => {
      Filter.data[dataPath].selected = [];
      Filter.data[dataPath].numeric = { threshold1: null, threshold2: null, operation: "" };
      if (Filter.data[dataPath].type === "mapregions") {
        Filter.data[dataPath].statusFilter    = { selectedStatuses: [], rangeMin: null, rangeMax: null };
        Filter.data[dataPath].possibleStatuses = {};
      }
    });
    Filter.text = "";
  },

  isEmpty: function () {
    let countFilters = 0;
    ["taxa", "data"].forEach(type => {
      Object.keys(Filter[type]).forEach(dataPath => {
        const f = Filter[type][dataPath];
        if (selectableFilterTypes.includes(f.type)) {
          countFilters += f.selected.length;
        } else if (exactSelectableRangeTypes.includes(f.type) && f.selected.length > 0 && !f.numeric.operation) {
          countFilters++;
        } else if (rangeFilterTypes.includes(f.type) && f.numeric.operation !== "") {
          countFilters++;
        }
        if (f.type === "mapregions" && _statusFilterIsActive(f.statusFilter)) {
          countFilters++;
        }
      });
    });
    if (Filter.text.length > 0) countFilters++;
    return countFilters === 0;
  },

  numericFilterToHumanReadable: function (dataPath, operation, threshold1, threshold2, formatPre, formatPost, ommitSearchCategory) {
    return buildHumanReadableRangeFilter(
      dataPath, operation, threshold1, threshold2,
      (threshold) => threshold === null || threshold === undefined ? "" : threshold.toLocaleString(),
      formatPre, formatPost, ommitSearchCategory
    );
  },

  monthsFilterSortedKeys: function () {
    return getMonthNumbers();
  },

  monthLabelForValue: function (monthNumber) {
    return Checklist.getMonthLabel(monthNumber);
  },

  dateFilterToHumanReadable: function (dataPath, operation, threshold1, threshold2, formatPre, formatPost, ommitSearchCategory) {
    const dateFormat = Checklist.getCurrentDateFormat();
    return buildHumanReadableRangeFilter(
      dataPath, operation, threshold1, threshold2,
      (threshold) => {
        if (threshold === null || threshold === undefined) return "";
        const dateObj = dayjs(threshold);
        return dateObj.isValid() ? dateObj.format(dateFormat) : threshold.toString();
      },
      formatPre, formatPost, ommitSearchCategory
    );
  },

  intervalFilterToHumanReadable: function (dataPath, operation, threshold1, threshold2, formatPre, formatPost, ommitSearchCategory) {
    let title = ommitSearchCategory ? "" :
      (formatPre || "") + Checklist.getMetaForDataPath(dataPath).searchCategory + (formatPost || "") + " ";
    const fmt   = v => (v == null ? "" : v.toLocaleString());
    const opDef = Filter.intervalFilters[operation];
    title += t("interval_filter_" + operation + "_short");
    title += " " + fmt(threshold1);
    if (opDef?.values > 1) title += " " + t("numeric_filter_and") + " " + fmt(threshold2);
    return title;
  },

  intervalFilters: {
    contains:     { operation: "contains",     icon: "contains",     values: 1, comparer: (from, to, t1)     => from <= t1 && t1 <= to },
    overlaps:     { operation: "overlaps",     icon: "overlaps",     values: 2, comparer: (from, to, t1, t2) => from <= t2 && to >= t1 },
    fully_inside: { operation: "fully_inside", icon: "fully_inside", values: 2, comparer: (from, to, t1, t2) => from >= t1 && to <= t2 },
  },

  numericFilters: {
    equal:        { operation: "equal",        icon: "equal",        values: 1, comparer: (v, t1)     => v == t1 },
    lesser:       { operation: "lesser",       icon: "lesser",       values: 1, comparer: (v, t1)     => v < t1 },
    lesserequal:  { operation: "lesserequal",  icon: "lesserequal",  values: 1, comparer: (v, t1)     => v <= t1 },
    greater:      { operation: "greater",      icon: "greater",      values: 1, comparer: (v, t1)     => v > t1 },
    greaterequal: { operation: "greaterequal", icon: "greaterequal", values: 1, comparer: (v, t1)     => v >= t1 },
    between:      { operation: "between",      icon: "between",      values: 2, comparer: (v, t1, t2) => v >= t1 && v <= t2 },
    around:       { operation: "around",       icon: "around",       values: 2, comparer: (v, t1, t2) => v >= t1 - t2 && v <= t1 + t2 },
  },

  calculatePossibleFilterValues: function (taxa) {
    // ── Clear ────────────────────────────────────────────────────────────────
    ["taxa", "data"].forEach(function (dataType) {
      Object.keys(Filter[dataType]).forEach(function (dataPath) {
        if (Filter.delayCommitDataPath == dataType + "." + dataPath) return;

        if (selectableFilterTypes.includes(Filter[dataType][dataPath].type)) {
          Filter[dataType][dataPath].possible = {};
          // FIX 2: also reset possibleStatuses for mapregions
          if (Filter[dataType][dataPath].type === "mapregions") {
            Filter[dataType][dataPath].possibleStatuses = {};
          }
        }
        if (rangeFilterTypes.includes(Filter[dataType][dataPath].type)) {
          Filter[dataType][dataPath].possible = [];
          Filter[dataType][dataPath].min = null;
          Filter[dataType][dataPath].max = null;
        }
      });
    });

    // ── Accumulate ───────────────────────────────────────────────────────────
    taxa.forEach(function (taxon) {
      Object.keys(Filter.taxa).forEach(function (dataPath, index) {
        if (Filter.delayCommitDataPath == "taxa." + dataPath) return;
        if (index >= taxon.t.length || taxon.t[index] === null) return;
        let value = taxon.t[index].name;
        if (Filter.taxa[dataPath].type == "text" || Filter.data[dataPath]?.type == "mapregions") {
          if (!Filter.taxa[dataPath].possible.hasOwnProperty(value)) {
            Filter.taxa[dataPath].possible[value] = 0;
          }
          Filter.taxa[dataPath].possible[value]++;
        }
      });

      Object.keys(Filter.data).forEach(function (dataPath) {
        if (Filter.delayCommitDataPath == "data." + dataPath) return;

        let rawValue = Checklist.getDataFromDataPath(taxon.d, dataPath);
        if (rawValue === null) return;

        // FIX 1: collect status values from the raw mapData object BEFORE getAllLeafData
        // (inside the leafData loop `value` is shadowed with a region-name string)
        if (Filter.data[dataPath].type === "mapregions") {
          _collectPossibleStatuses(rawValue, dataPath);
        }

        let leafData = Checklist.getAllLeafData(rawValue, false, dataPath);

        if (selectableFilterTypes.includes(Filter.data[dataPath].type)) {
          leafData.forEach(function (leafValue) {
            if (typeof leafValue === "string" && leafValue.trim() == "") return;
            if (!Filter.data[dataPath].possible.hasOwnProperty(leafValue)) {
              Filter.data[dataPath].possible[leafValue] = 0;
            }
            Filter.data[dataPath].possible[leafValue]++;
          });
        } else if (rangeFilterTypes.includes(Filter.data[dataPath].type)) {
          leafData.forEach(function (value) {
            if (Filter.data[dataPath].type === "interval") {
              if (!Array.isArray(value) || value.length !== 2) return;
              Filter.data[dataPath].possible.push(value);
              Filter.data[dataPath].min = Filter.data[dataPath].min === null ? value[0] : Math.min(Filter.data[dataPath].min, value[0]);
              Filter.data[dataPath].max = Filter.data[dataPath].max === null ? value[1] : Math.max(Filter.data[dataPath].max, value[1]);
            } else {
              if (typeof value !== "number" || isNaN(value)) return;
              Filter.data[dataPath].possible.push(value);
              Filter.data[dataPath].min = Filter.data[dataPath].min === null ? value : Math.min(Filter.data[dataPath].min, value);
              Filter.data[dataPath].max = Filter.data[dataPath].max === null ? value : Math.max(Filter.data[dataPath].max, value);
            }
          });
        }
      });
    });

    Object.keys(Filter.data).forEach(function (dataPath) {
      if (rangeFilterTypes.includes(Filter.data[dataPath].type)) {
        if (Filter.data[dataPath].globalMin === undefined || Filter.data[dataPath].globalMin === null) {
          Filter.data[dataPath].globalMin = Filter.data[dataPath].min;
        }
        if (Filter.data[dataPath].globalMax === undefined || Filter.data[dataPath].globalMax === null) {
          Filter.data[dataPath].globalMax = Filter.data[dataPath].max;
        }
        if (exactSelectableRangeTypes.includes(Filter.data[dataPath].type) && Filter.data[dataPath].numeric.operation != "") {
          Filter.data[dataPath].selected = getSortedUniqueNumericValues(Filter.data[dataPath].possible);
        }
      }
    });
  },

  // FIX 3: queryKey — mapregions must be handled BEFORE the generic selectableFilterTypes branch
  // because mapregions IS in selectableFilterTypes (making the old else-if dead code).
  queryKey: function (excludedFilterKey = "") {
    let key = { taxa: {}, data: {} };

    Object.keys(key).forEach(function (type) {
      Object.keys(Filter[type]).forEach(function (dataPath) {
        if (excludedFilterKey == type + "." + dataPath) return;

        const fd    = Filter[type][dataPath];
        const ftype = fd.type;

        // ── mapregions: serialize region list + statusFilter ──────────────────
        if (ftype === "mapregions") {
          const sfActive = _statusFilterIsActive(fd.statusFilter);
          if (fd.selected.length > 0 || sfActive) {
            const obj = { regions: fd.selected };
            if (sfActive) {
              obj.sf = {};
              if (fd.statusFilter.selectedStatuses.length > 0) obj.sf.s   = fd.statusFilter.selectedStatuses;
              if (fd.statusFilter.rangeMin !== null)           obj.sf.min = fd.statusFilter.rangeMin;
              if (fd.statusFilter.rangeMax !== null)           obj.sf.max = fd.statusFilter.rangeMax;
            }
            key[type][dataPath] = obj;
          }
          return;
        }

        // ── other selectable types ─────────────────────────────────────────────
        if (selectableFilterTypes.includes(ftype)) {
          if (fd.selected.length > 0) {
            key[type][dataPath] = [];
          }
          fd.selected.forEach(selected => key[type][dataPath].push(selected));
          return;
        }

        // ── exact-select range (list mode) ─────────────────────────────────────
        if (exactSelectableRangeTypes.includes(ftype) && fd.selected.length > 0 && !fd.numeric.operation) {
          key[type][dataPath] = [];
          fd.selected.forEach(selected => key[type][dataPath].push(selected));
          return;
        }

        // ── range with numeric operation ───────────────────────────────────────
        if (rangeFilterTypes.includes(ftype) && fd.numeric.operation !== "") {
          key[type][dataPath] = { o: fd.numeric.operation, a: fd.numeric.threshold1 };
          const opKey = fd.numeric.operation;
          const opDef = ftype === "interval" ? Filter.intervalFilters[opKey] : Filter.numericFilters[opKey];
          if (opDef?.values > 1) key[type][dataPath].b = fd.numeric.threshold2;
        }
      });
    });

    if (Object.keys(key.taxa).length == 0) delete key.taxa;
    if (Object.keys(key.data).length == 0) delete key.data;
    if (Filter.text.length > 0) key.text = Filter.text;

    return JSON.stringify(key);
  },

  queryCache: {
    cache: function (searchResults, excludedFilterKey = "") {
      let queryKey = Filter.queryKey(excludedFilterKey);
      Filter._queryResultCache[queryKey] = {
        taxa: searchResults,
        filterSnapshot: {
          text: Filter.text,
          taxa: Filter._createFilterSnapshot(Filter.taxa),
          data: Filter._createFilterSnapshot(Filter.data)
        }
      };
    },
    retrieve: function (excludedFilterKey = "") {
      let queryKey = Filter.queryKey(excludedFilterKey);
      return Filter._queryResultCache.hasOwnProperty(queryKey)
        ? Filter._queryResultCache[queryKey]
        : false;
    },
  },

  getTaxaForCurrentQuery: function () {
    return Filter._getTaxaForQuery();
  },

  getTaxaForCurrentQueryExcluding: function (type, dataPath) {
    return Filter._getTaxaForQuery(type + "." + dataPath);
  },

  getRangeFilterPreviewData: function (dataPath) {
    let previewTaxa = Filter.getTaxaForCurrentQueryExcluding("data", dataPath);
    let possible = [], min = null, max = null;

    previewTaxa.forEach(function (taxon) {
      let value = Checklist.getDataFromDataPath(taxon.d, dataPath);
      if (value === null) return;

      let leafData = Checklist.getAllLeafData(value, false, dataPath);
      const isInterval = Filter.data[dataPath].type === "interval";
      leafData.forEach(function (leafValue) {
        if (isInterval) {
          if (!Array.isArray(leafValue) || leafValue.length !== 2) return;
          possible.push(leafValue);
          min = min === null ? leafValue[0] : Math.min(min, leafValue[0]);
          max = max === null ? leafValue[1] : Math.max(max, leafValue[1]);
        } else {
          if (typeof leafValue !== "number" || isNaN(leafValue)) return;
          possible.push(leafValue);
          min = min === null ? leafValue : Math.min(min, leafValue);
          max = max === null ? leafValue : Math.max(max, leafValue);
        }
      });
    });

    return { possible, min, max };
  },

  _getTaxaForQuery: function (excludedFilterKey = "") {
    if (!Checklist._isDataReady) return [];

    Filter._sanitizeFilters();

    let activeFilters   = Filter._getActiveFilters(excludedFilterKey);
    let hasActiveFilters = activeFilters.taxa.length > 0 || activeFilters.data.length > 0;

    if (!hasActiveFilters && Filter.text.length == 0) {
      let allData = Checklist.getData().checklist;
      if (!excludedFilterKey) Filter.calculatePossibleFilterValues(allData);
      return allData;
    }

    let cacheResult = Filter.queryCache.retrieve(excludedFilterKey);
    if (cacheResult) {
      if (!excludedFilterKey) Filter.calculatePossibleFilterValues(cacheResult.taxa);
      return cacheResult.taxa;
    }

    let finalSearchResults = Filter._runActiveFilterQuery(activeFilters);
    if (!excludedFilterKey) Filter.calculatePossibleFilterValues(finalSearchResults);
    Filter.queryCache.cache(finalSearchResults, excludedFilterKey);

    return finalSearchResults;
  },

  _runActiveFilterQuery: function (activeFilters) {
    let includeChildren   = Settings.includeMatchChildren();
    let checklistData     = Checklist.getData().checklist;
    let currentLang       = Checklist.getCurrentLanguage();
    let fullTextIndexArray = Checklist._dataFulltextIndex
      ? Checklist._dataFulltextIndex[currentLang]
      : null;

    let requirements = [];
    activeFilters.taxa.forEach(f  => requirements.push({ type: "taxa", filter: f, bit: 1 << requirements.length }));
    activeFilters.data.forEach(f  => requirements.push({ type: "data", filter: f, bit: 1 << requirements.length }));

    if (Filter.text.length > 0) {
      let rawTerms   = Filter.text.split(Settings.SEARCH_OR_SEPARATOR);
      let validTerms = rawTerms
        .map(term => textLowerCaseAccentless(term).trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"))
        .filter(term => term.length > 0);
      if (validTerms.length > 0) {
        let regex = new RegExp("(?:" + validTerms.map(t => "\\b" + t).join("|") + ")", "i");
        requirements.push({ type: "text", regex, bit: 1 << requirements.length });
      }
    }

    const TARGET_MASK = (1 << requirements.length) - 1;
    const dataLength  = checklistData.length;
    let localMasks    = new Int32Array(dataLength);
    let pathMap       = new Map();
    let pathKeys      = new Array(dataLength);

    for (let i = 0; i < dataLength; i++) {
      let item    = checklistData[i];
      let pathKey = item.t.filter(t => t !== null).map(t => t.name).join("|");
      pathKeys[i] = pathKey;
      pathMap.set(pathKey, i);

      let localMask = 0;
      for (let r = 0; r < requirements.length; r++) {
        let req    = requirements[r];
        let passed = false;
        if (req.type === "taxa") {
          if (req.filter.index < item.t.length && item.t[req.filter.index] !== null && req.filter.selected.includes(item.t[req.filter.index].name)) passed = true;
        } else if (req.type === "data") {
          passed = Filter._checkDataFilters(item, [req.filter]);
        } else if (req.type === "text") {
          let searchableText = fullTextIndexArray ? fullTextIndexArray[i] : Checklist.getSearchableTextForTaxon(i);
          passed = req.regex.test(searchableText);
        }
        if (passed) localMask |= req.bit;
      }
      localMasks[i] = localMask;
    }

    let matchedItems  = [];
    let matchedKeySet = new Set();
    let parentKeySet  = new Set();

    for (let i = 0; i < dataLength; i++) {
      let item        = checklistData[i];
      let currentMask = localMasks[i];

      if (currentMask !== TARGET_MASK && includeChildren) {
        let tempPath = pathKeys[i];
        while (tempPath.indexOf("|") > -1) {
          tempPath = tempPath.substring(0, tempPath.lastIndexOf("|"));
          if (pathMap.has(tempPath)) currentMask |= localMasks[pathMap.get(tempPath)];
          if (currentMask === TARGET_MASK) break;
        }
      }

      if (currentMask === TARGET_MASK) {
        matchedItems.push(item);
        let itemKey = item._key || pathKeys[i];
        matchedKeySet.add(itemKey);

        let tempPath = "";
        for (let k = 0; k < item.t.length - 1; k++) {
          if (item.t[k] === null) continue;
          tempPath += (tempPath.length > 0 ? "|" : "") + item.t[k].name;
          if (!matchedKeySet.has(tempPath)) parentKeySet.add(tempPath);
        }
      }
    }

    return Filter._assembleResults(matchedItems, parentKeySet, checklistData);
  },

  _sanitizeFilters: function () {
    ["taxa", "data"].forEach(type => {
      Object.keys(Filter[type]).forEach(dataPath => {
        if (Filter[type][dataPath].selected) {
          Filter[type][dataPath].selected = Filter[type][dataPath].selected.filter(v => v != null && v !== "");
        }
      });
    });
  },

  _createFilterSnapshot: function (filterObj) {
    let snapshot = {};
    Object.keys(filterObj).forEach(key => {
      snapshot[key] = {
        selected: [...(filterObj[key].selected || [])],
        numeric:  filterObj[key].numeric ? { ...filterObj[key].numeric } : null
      };
    });
    return snapshot;
  },

  // FIX 4: _getActiveFilters — handle mapregions explicitly so that:
  //   a) statusFilter is included in the pushed object
  //   b) a statusFilter-only active state (selected.length === 0) is still pushed
  _getActiveFilters: function (excludedFilterKey = "") {
    let active    = { taxa: [], data: [] };
    let taxaKeys  = Object.keys(Filter.taxa);

    taxaKeys.forEach((dataPath, index) => {
      if (excludedFilterKey == "taxa." + dataPath) return;
      if (Filter.taxa[dataPath].selected.length > 0) {
        active.taxa.push({ dataPath, index, selected: Filter.taxa[dataPath].selected });
      }
    });

    Object.keys(Filter.data).forEach(dataPath => {
      if (excludedFilterKey == "data." + dataPath) return;

      const fd    = Filter.data[dataPath];
      const ftype = fd.type;

      if (exactSelectableRangeTypes.includes(ftype) && fd.selected.length > 0 && !fd.numeric.operation) {
        active.data.push({ dataPath, type: ftype, selected: fd.selected });
      } else if (rangeFilterTypes.includes(ftype)) {
        if (fd.numeric.operation) active.data.push({ dataPath, type: ftype, numeric: fd.numeric });
      } else if (ftype === "mapregions") {
        // Must handle mapregions BEFORE the generic selected.length check so we can
        // (a) include statusFilter in the pushed object and
        // (b) push even when selected is empty but statusFilter is active
        if (fd.selected.length > 0 || _statusFilterIsActive(fd.statusFilter)) {
          active.data.push({ dataPath, type: ftype, selected: fd.selected, statusFilter: fd.statusFilter });
        }
      } else if (fd.selected.length > 0) {
        active.data.push({ dataPath, type: ftype, selected: fd.selected });
      }
    });

    return active;
  },

  _checkTaxaFilters: function (item, taxaFilters) {
    for (let filter of taxaFilters) {
      let taxonIndex = filter.index;
      if (taxonIndex >= item.t.length || item.t[taxonIndex] === null) return false;
      if (!filter.selected.includes(item.t[taxonIndex].name)) return false;
    }
    return true;
  },

  _checkDataFilters: function (item, dataFilters) {
    for (let filter of dataFilters) {
      let value = Checklist.getDataFromDataPath(item.d, filter.dataPath);

      if (filter.type === "mapregions") {
        if (!value || typeof value !== "object") return false;
        if (!_checkMapregionsFilter(value, filter)) return false;
        continue;
      }

      if (value === null) return false;

      if (exactSelectableRangeTypes.includes(filter.type) && (!filter.numeric || !filter.numeric.operation)) {
        let leafData = Checklist.getAllLeafData(value, false, filter.dataPath);
        if (!leafData.some(v => filter.selected.includes(v))) return false;
      } else if (filter.type === "interval") {
        const intervalFilter = Filter.intervalFilters[filter.numeric.operation];
        if (!intervalFilter) return false;
        let leafData = Checklist.getAllLeafData(value, false, filter.dataPath);
        if (!leafData.some(v => Array.isArray(v) && v.length === 2 && intervalFilter.comparer(v[0], v[1], filter.numeric.threshold1, filter.numeric.threshold2))) return false;
      } else if (rangeFilterTypes.includes(filter.type)) {
        let leafData = Checklist.getAllLeafData(value, false, filter.dataPath);
        if (!leafData.some(v => Filter.numericFilters[filter.numeric.operation].comparer(v, filter.numeric.threshold1, filter.numeric.threshold2))) return false;
      } else {
        let leafData = Checklist.getAllLeafData(value, false, filter.dataPath);
        if (!leafData.some(v => filter.selected.includes(v))) return false;
      }
    }
    return true;
  },

  _assembleResults: function (matchedItems, parentKeySet, checklistData) {
    let finalResults = [...matchedItems];
    if (parentKeySet.size > 0) {
      checklistData.forEach(item => {
        let itemKey = item._key || item.t.filter(t => t !== null).map(t => t.name).join("|");
        if (parentKeySet.has(itemKey)) finalResults.push(item);
      });
    }
    return finalResults;
  }
};

// ─── Module-level helpers ─────────────────────────────────────────────────────

function _collectPossibleStatuses(mapData, dataPath) {
  if (!mapData || typeof mapData !== "object") return;
  if (!Filter.data[dataPath].possibleStatuses) Filter.data[dataPath].possibleStatuses = {};
  Object.values(mapData).forEach(regionData => {
    const status = regionData?.status ?? "";
    if (status === "") return;
    Filter.data[dataPath].possibleStatuses[status] =
      (Filter.data[dataPath].possibleStatuses[status] || 0) + 1;
  });
}

function _checkMapregionsFilter(mapData, filter) {
  const regionCodes = Object.keys(mapData);

  // Region-name gate
  const regionPasses = filter.selected.length === 0 || regionCodes.some(code => {
    const name = Checklist.nameForMapRegion(code);
    return filter.selected.includes(name) || filter.selected.includes(code);
  });
  if (!regionPasses) return false;

  if (!_statusFilterIsActive(filter.statusFilter)) return true;

  const codesInScope = filter.selected.length > 0
    ? regionCodes.filter(code => {
        const name = Checklist.nameForMapRegion(code);
        return filter.selected.includes(name) || filter.selected.includes(code);
      })
    : regionCodes;

  return codesInScope.some(code => _statusMatchesSF(mapData[code]?.status ?? "", filter.statusFilter));
}

function _statusMatchesSF(status, sf) {
  const hasStatusSel  = sf.selectedStatuses.length > 0;
  const hasRangeLimit = sf.rangeMin !== null || sf.rangeMax !== null;

  if (!hasStatusSel && !hasRangeLimit) return true;

  // Numeric range check (for gradient / stepped)
  if (hasRangeLimit) {
    const n = parseNumericStatus(status);
    if (n !== null) {
      const passesRange = (sf.rangeMin === null || n >= sf.rangeMin) &&
                         (sf.rangeMax === null || n <= sf.rangeMax);
      if (passesRange) return true;
    }
  }

  // Exact status string match (for category overrides)
  if (hasStatusSel && sf.selectedStatuses.includes(status)) return true;

  return false;
}

function _statusFilterIsActive(sf) {
  if (!sf) return false;
  return sf.selectedStatuses.length > 0 || sf.rangeMin !== null || sf.rangeMax !== null;
}
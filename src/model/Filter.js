import { routeTo } from "../components/Utils.js";
import { Checklist } from "./Checklist.js";
import { textLowerCaseAccentless } from "../components/Utils.js";
import { Settings } from "./Settings.js";
import { getMonthNumbers } from "./MonthNames.js";
import { getFilterPlugin } from "./filterPlugins/index.js";

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
    let count = Filter.text !== "" ? 1 : 0;
    ["taxa", "data"].forEach(type =>
      Object.keys(Filter[type]).forEach(path => {
        const fd = Filter[type][path];
        if (getFilterPlugin(fd)?.isActive(fd)) count++;
      })
    );
    return count;
  },

  setFromQuery: function (query) {
    Filter.clear();
    ["taxa", "data"].forEach(type => {
      if (!query[type]) return;
      Object.keys(query[type]).forEach(dataPath => {
        const fd = Filter[type][dataPath];
        if (!fd) return;
        const plugin = getFilterPlugin(fd);
        if (plugin?.deserializeFromQuery) plugin.deserializeFromQuery(fd, query[type][dataPath]);
      });
    });
    if (query.text?.length > 0) Filter.text = query.text;
  },

  clear: function () {
    ["taxa", "data"].forEach(type => {
      Object.keys(Filter[type]).forEach(path => {
        const fd = Filter[type][path];
        const plugin = getFilterPlugin(fd);
        if (plugin?.clearFilter) plugin.clearFilter(fd);
      });
    });
    Filter.text = "";
  },

  isEmpty: function () {
    if (Filter.text.length > 0) return false;
    return ["taxa", "data"].every(type =>
      Object.keys(Filter[type]).every(path => {
        const fd = Filter[type][path];
        const plugin = getFilterPlugin(fd);
        if (!plugin) return true;
        return !plugin.isActive(fd);
      })
    );
  },

  monthsFilterSortedKeys: function () {
    return getMonthNumbers();
  },

  monthLabelForValue: function (monthNumber) {
    return Checklist.getMonthLabel(monthNumber);
  },



  calculatePossibleFilterValues: function (taxa) {
    // ── Clear possible values for all unlocked filter slots ───────────────────
    ["taxa", "data"].forEach(function (type) {
      Object.keys(Filter[type]).forEach(function (path) {
        if (Filter.delayCommitDataPath === type + "." + path) return;
        const fd = Filter[type][path];
        const plugin = getFilterPlugin(fd);
        if (plugin?.clearPossible) plugin.clearPossible(fd);
      });
    });

    // Identify the occurrence taxa level once so per-row entity checks are O(1).
    // When occurrenceMetaIndex === -1 the dataset has no occurrences and entity
    // separation is a no-op — all rows are taxon rows and counts are unambiguous.
    const occurrenceMetaIndex = Checklist.getOccurrenceMetaIndex();
    const hasOccurrenceLevel  = occurrenceMetaIndex !== -1;

    taxa.forEach(function (taxon) {
      // Determine row entity type once per row.  An occurrence row is one
      // where the occurrence-level taxon slot is populated.
      const isOccurrenceRow = hasOccurrenceLevel &&
        taxon.t[occurrenceMetaIndex] != null;

      Object.keys(Filter.taxa).forEach(function (path, index) {
        if (Filter.delayCommitDataPath === "taxa." + path) return;
        if (index >= taxon.t.length || taxon.t[index] === null) return;

        // Entity separation for taxa-filter slots:
        // • The occurrence slot accumulates only from occurrence rows.
        // • Every other slot (family, genus, species…) accumulates only from
        //   taxon rows, preventing occurrence rows from inflating the counts
        //   for higher-rank slots (each occurrence carries its full t[] ancestry,
        //   which would otherwise double-count species/genus/family values).
        if (hasOccurrenceLevel) {
          const isOccurrenceSlot = index === occurrenceMetaIndex;
          if (isOccurrenceSlot && !isOccurrenceRow) return;
          if (!isOccurrenceSlot &&  isOccurrenceRow) return;
        }

        const fd = Filter.taxa[path];
        const plugin = getFilterPlugin(fd);
        const leafValues = [taxon.t[index].name];
        if (plugin?.accumulatePossible) plugin.accumulatePossible(fd, taxon.t[index].name, leafValues);
      });

      Object.keys(Filter.data).forEach(function (path) {
        if (Filter.delayCommitDataPath === "data." + path) return;

        // Entity separation for data-filter slots: accumulate each slot only
        // from rows of the matching entity type.  After the DataManager
        // cross-entity check, taxon rows carry no occurrence data and vice versa,
        // so the null-value guard below would already silence most bleed — but
        // the explicit check here is faster and makes the intent unambiguous.
        if (hasOccurrenceLevel) {
          const belongsTo = Filter.data[path].belongsTo || "taxon";
          if (belongsTo === "occurrence" && !isOccurrenceRow) return;
          if (belongsTo === "taxon"      &&  isOccurrenceRow) return;
        }

        const rawValue = Checklist.getDataFromDataPath(taxon.d, path);
        if (rawValue === null) return;
        const fd = Filter.data[path];
        const plugin = getFilterPlugin(fd);
        const leafValues = Checklist.getAllLeafData(rawValue, false, path);
        if (plugin?.accumulatePossible) plugin.accumulatePossible(fd, rawValue, leafValues);
      });
    });

    Object.keys(Filter.data).forEach(function (path) {
      const fd = Filter.data[path];
      const plugin = getFilterPlugin(fd);
      if (plugin?.finalizeAccumulation) plugin.finalizeAccumulation(fd);
    });
  },

  // NOTE: one deliberate type-check remains — interval preview needs pair-aware
  // accumulation. Candidate for plugin.getPreviewAccumulator() in a future pass.
  queryKey: function (excludedFilterKey = "") {
    const key = { taxa: {}, data: {} };
    ["taxa", "data"].forEach(type => {
      Object.keys(Filter[type]).forEach(path => {
        if (excludedFilterKey === type + "." + path) return;
        const fd = Filter[type][path];
        const plugin = getFilterPlugin(fd);
        const serialized = plugin?.serializeToQuery?.(fd);
        if (serialized != null) key[type][path] = serialized;
      });
    });
    if (!Object.keys(key.taxa).length) delete key.taxa;
    if (!Object.keys(key.data).length) delete key.data;
    if (Filter.text?.length > 0) key.text = Filter.text;
    key.intent = Settings.analyticalIntent();

    let stringified = JSON.stringify(key);
    return stringified;
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

    let activeFilters = Filter._getActiveFilters(excludedFilterKey);
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
    let includeChildren = Settings.includeMatchChildren();
    let checklistData = Checklist.getData().checklist;
    let currentLang = Checklist.getCurrentLanguage();
    Checklist.precomputeSearchableText(currentLang);
    let fullTextIndexArray = Checklist._searchableTextCache[currentLang] || null;

    let requirements = [];
    activeFilters.taxa.forEach(f => requirements.push({ type: "taxa", filter: f, bit: 1 << requirements.length }));
    activeFilters.data.forEach(f => requirements.push({ type: "data", filter: f, bit: 1 << requirements.length }));

    if (Filter.text.length > 0) {
      let rawTerms = Filter.text.split(Settings.SEARCH_OR_SEPARATOR);
      let validTerms = rawTerms
        .map(term => textLowerCaseAccentless(term).trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"))
        .filter(term => term.length > 0);
      if (validTerms.length > 0) {
        let regex = new RegExp("(?:" + validTerms.map(t => "\\b" + t).join("|") + ")", "i");
        requirements.push({ type: "text", regex, bit: 1 << requirements.length });
      }
    }

    const TARGET_MASK = (1 << requirements.length) - 1;
    const dataLength = checklistData.length;
    let localMasks = new Int32Array(dataLength);
    let pathMap = new Map();
    let pathKeys = new Array(dataLength);

    for (let i = 0; i < dataLength; i++) {
      let item = checklistData[i];
      let pathKey = item.t.filter(t => t !== null).map(t => t.name).join("|");
      pathKeys[i] = pathKey;
      pathMap.set(pathKey, i);

      let localMask = 0;
      for (let r = 0; r < requirements.length; r++) {
        let req    = requirements[r];
        let passed = false;

        if (req.type === "taxa") {
          const taxonValue = (req.filter.index < item.t.length && item.t[req.filter.index] !== null)
            ? item.t[req.filter.index].name
            : null;

          if (req.filter.matchMode === "exclude") {
            // Ancestors (taxonValue === null) pass: they don't carry the excluded value.
            // Phase 6 fast-fail is not applied to taxa because null means "ancestor node",
            // not "missing data" — ancestors are valid biological entities that should remain
            // visible alongside their non-excluded descendants.
            passed = taxonValue === null || !req.filter.selected.includes(taxonValue);
          } else {
            // "any" and "all" are equivalent for single-value taxon levels
            passed = taxonValue !== null && req.filter.selected.includes(taxonValue);
          }

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

    let matchedItems = [];
    let matchedKeySet = new Set();
    let parentKeySet = new Set();

    for (let i = 0; i < dataLength; i++) {
      let item = checklistData[i];
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
        numeric: filterObj[key].numeric ? { ...filterObj[key].numeric } : null
      };
    });
    return snapshot;
  },

// ─── in _getActiveFilters ──────────────────────────────────────────────────────
// CHANGE: forward matchMode so the query engine respects Exclude for taxa

  _getActiveFilters: function (excludedFilterKey = "") {
    const active = { taxa: [], data: [] };
    const taxaKeys = Object.keys(Filter.taxa);

    taxaKeys.forEach((dataPath, index) => {
      if (excludedFilterKey === "taxa." + dataPath) return;
      const fd = Filter.taxa[dataPath];
      if (fd.selected.length > 0) {
        active.taxa.push({
          dataPath,
          index,
          selected:  fd.selected,
          matchMode: fd.matchMode || "any",   // Phase 4: forward mode
        });
      }
    });

    Object.keys(Filter.data).forEach(dataPath => {
      if (excludedFilterKey === "data." + dataPath) return;
      const fd     = Filter.data[dataPath];
      const plugin = getFilterPlugin(fd);
      if (plugin?.isActive(fd)) {
        active.data.push({ dataPath, filterDef: fd });
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
    for (const { dataPath, filterDef } of dataFilters) {
      const rawValue = Checklist.getDataFromDataPath(item.d, dataPath);
      if (rawValue === null) {
        // Phase 6 (Exclude fast-fail) + general null handling:
        // A taxon with no data cannot satisfy any categorical/numeric selection (Any/All),
        // and must not silently pass an Exclude filter through an empty leafValues array.
        // mapregions handles its own null case inside matches() to avoid double-counting.
        if (filterDef.type !== "mapregions") return false;
      }
      const leafValues = rawValue !== null
        ? Checklist.getAllLeafData(rawValue, false, dataPath)
        : [];
      const plugin = getFilterPlugin(filterDef);
      if (!plugin) return false;
      if (!plugin.matches(filterDef, rawValue, leafValues)) return false;
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

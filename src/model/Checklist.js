import m from "mithril"
import Handlebars from "handlebars";
import { TinyBibFormatter } from 'bibtex-json-toolbox';

import {
  clearSortByCustomOrderCache,
  getCurrentLocaleBestGuess,
  getGradedColor,
  routeTo,
  textLowerCaseAccentless,
} from "../components/Utils.js";
import { Settings } from "./Settings.js";
import { Filter } from "./Filter.js";
import {
  deriveShortMonthNames,
  getMonthLabel,
  getShortMonthLabel,
  resolveMonthNames,
} from "./MonthNames.js";
import { dataCustomTypes, getSearchableTextByType } from "./customTypes/index.js";

import { validateActiveToolState } from "../view/analysisTools/index.js";
import { clearLegendConfigCache } from "./customTypes/CustomTypeMapregions.js";

const templateResultSuffix = "$$templateresult";

export let Checklist = {
  getData: function () {
    return Checklist._data.versions[Checklist.getCurrentLanguage()].dataset;
  },

  getEntireChecklist: function () {
    return Checklist._data.versions[Checklist.getCurrentLanguage()].dataset
      .checklist;
  },

  getDataRevision: function () {
    return Checklist._dataRevision;
  },

  _data: null,
  _dataRevision: 0,
  _dataFulltextIndex: {},
  _isDraft: false,
  _isDataReady: false,
  _taxonCache: new Map(),
  _keyReachableTaxaCache: new Map(),
  _keyLCACache: new Map(), // Add LCA cache
  _occurrenceDataPathCache: undefined,
  _hasOccurrencesCache: null,

  // Pre-computed searchable text cache per language
  _searchableTextCache: {},

  // Replace single _bibFormatter with a per-language cache
  _bibFormatterCache: {},

  filter: Filter,

  transformDatabaseShortcodes: function (text) {
    if (!text || typeof text !== "string" || text.indexOf("@") === -1) {
      return text;
    }

    const shortcodes = Checklist.getData()?.meta?.databaseShortcodes;
    if (!shortcodes?.length) return text;

    return text.replace(
      /@([a-z]+)(\.[a-z]+)?:(?:([^:@\s]+):)?([a-zA-Z0-9\-_\/]+)/gm,
      (match, prefix, suffix, author, id) => {
        const code = prefix + (suffix ?? "");
        const engine = shortcodes.find(s => s.code === code);
        if (!engine) {
          console.log("Unknown shortcode: " + code);
          return match;
        }
        const authorText = author ? author + " " : "";
        const label = engine.name
          .replace(/{{\s*author\s*}}/gi, authorText)
          .replace(/{{\s*id\s*}}/gi, id)
          .trim();
        const href = engine.url.replace(/{{\s*id\s*}}/gi, id);
        return `<a class="citation" href="${href}" target="_blank">${label}</a>`;
      }
    );
  },

  nameForMapRegionCache: new Map(),
  nameForMapRegion: function (regionCode) {
    if (!this.nameForMapRegionCache.has(regionCode)) {
      const meta = Checklist.getMapRegionsNamesMeta()?.find(
        (x) => x.code == regionCode
      );

      if (meta) {
        this.nameForMapRegionCache.set(regionCode, meta.name);
      } else {
        this.nameForMapRegionCache.set(regionCode, regionCode);
      }
    }

    return this.nameForMapRegionCache.get(regionCode);
  },

  getSingleAccessTaxonomicKeys: function () {
    if (this._isDataReady) {
      return this.getData().singleAccessKeys || [];
    }

    return [];
  },
  getRecursiveTaxaFromKey: function (key, currentId) {
    if (typeof currentId === 'string') return [currentId];
    // Default start
    if (currentId === undefined) currentId = 1;

    const choices = key.steps.filter(s => s.step_id === currentId);
    let taxa = [];
    choices.forEach(choice => {
      if (choice.type === 'external') {
        taxa.push(choice.target);
      } else {
        taxa = taxa.concat(Checklist.getRecursiveTaxaFromKey(key, choice.target));
      }
    });
    return [...new Set(taxa)].sort();
  },
  getKeyReachableTaxa: function (key) {
    if (!key || !key.id) return [];
    if (!this._keyReachableTaxaCache.has(key.id)) {
      this._keyReachableTaxaCache.set(key.id, this.getRecursiveTaxaFromKey(key, 1));
    }
    return this._keyReachableTaxaCache.get(key.id);
  },
  setFilterForPossibleTaxa: function (reachableTaxa) {
    // 1. Construct the separator-delimited regex string for the filter
    // Filter.js handles the separator as an OR operator automatically
    const newFilterText = reachableTaxa && reachableTaxa.length > 0
      ? reachableTaxa.join(" " + Settings.SEARCH_OR_SEPARATOR + " ")
      : "";

    // 2. CRITICAL: Infinite Loop Prevention
    // Only commit if the filter text has actually changed.
    // Without this check: View -> setFilter -> Route Update -> View -> ... (Crash)
    if (Checklist.filter.text !== newFilterText) {

      // 3. Clear previous filters (Data/Taxa dropdowns)
      // This ensures the user only sees results relevant to the Key
      Checklist.filter.clear();

      // 4. Set the new text filter
      Checklist.filter.text = newFilterText;

      // 5. Commit to the CURRENT Route
      // We get the current path (e.g., "/single-access-keys/gbif/1-2")
      // splitting at '?' ensures we don't duplicate existing query params.
      const currentRoutePath = m.route.get().split("?")[0];

      // This triggers routeTo() which appends the new ?q=... param
      Checklist.filter.commit(currentRoutePath);
    }
  },
  /**
   * Compute the Lowest Common Ancestor (LCA) for all result taxa in a key.
   * Returns the taxon path (array of ancestor names) up to and including the LCA.
   * @param {Object} key - The key object
   * @returns {string[]} Array of ancestor names from root to LCA (inclusive)
   */
  getKeyLCA: function (key) {
    if (!key || !key.id) return [];

    if (!this._keyLCACache.has(key.id)) {
      const reachableTaxa = this.getKeyReachableTaxa(key);

      if (reachableTaxa.length === 0) {
        this._keyLCACache.set(key.id, []);
        return [];
      }

      // Get ancestry paths for all result taxa
      const ancestryPaths = reachableTaxa.map(taxonName => {
        const taxonData = this.getTaxonByName(taxonName);
        if (!taxonData || !taxonData.t) return [];
        return taxonData.t.filter(t => t !== null).map(t => t.name);
      }).filter(path => path.length > 0);

      if (ancestryPaths.length === 0) {
        this._keyLCACache.set(key.id, []);
        return [];
      }

      // Find LCA by comparing paths from root
      const lcaPath = [];
      const minLength = Math.min(...ancestryPaths.map(p => p.length));

      for (let i = 0; i < minLength; i++) {
        const ancestorAtLevel = ancestryPaths[0][i];
        const allMatch = ancestryPaths.every(path => path[i] === ancestorAtLevel);

        if (allMatch) {
          lcaPath.push(ancestorAtLevel);
        } else {
          break; // Divergence found, stop here
        }
      }

      this._keyLCACache.set(key.id, lcaPath);
    }

    return this._keyLCACache.get(key.id);
  },

  /**
   * Check if a key is relevant to a given taxon using LCA-based approach.
   * A key is relevant if the taxon is:
   * - The LCA itself, OR
   * - A descendant of the LCA (ancestor of at least one result taxon)
   * 
   * @param {Object} key - The key object
   * @param {string} filterTaxonName - The taxon name to check
   * @returns {boolean}
   */
  isKeyRelevantToTaxon: function (key, filterTaxonName) {
    const lcaPath = this.getKeyLCA(key);

    // If no LCA (no valid results), not relevant
    if (lcaPath.length === 0) return false;

    const lcaName = lcaPath[lcaPath.length - 1]; // The LCA taxon name

    // Case 1: The filter taxon IS the LCA
    if (filterTaxonName === lcaName) return true;

    // Case 2: Check if filter taxon is BELOW the LCA (descendant of LCA, ancestor of a result)
    // First, check if filterTaxonName is in the LCA path (above LCA) - if so, NOT relevant
    if (lcaPath.includes(filterTaxonName)) {
      // filterTaxonName is an ancestor of LCA, not the LCA itself
      return false;
    }

    // Check if filterTaxonName is a descendant of LCA AND ancestor of at least one result taxon
    const reachableTaxa = this.getKeyReachableTaxa(key);

    return reachableTaxa.some(resultTaxonName => {
      // Direct match
      if (resultTaxonName === filterTaxonName) return true;

      // Check if filterTaxonName is an ancestor of this result taxon
      const taxonData = this.getTaxonByName(resultTaxonName);
      if (!taxonData || !taxonData.t) return false;

      // Get the ancestry path of the result taxon
      const resultPath = taxonData.t.filter(t => t !== null).map(t => t.name);

      // Check if filterTaxonName is in the path AND comes after the LCA
      const filterIndex = resultPath.indexOf(filterTaxonName);
      const lcaIndex = resultPath.indexOf(lcaName);

      // filterTaxonName must be in the path, and at or after the LCA position
      return filterIndex !== -1 && filterIndex >= lcaIndex;
    });
  },

  getBibliographyKeys: function () {
    if (!this._isDataReady || this._data.general.bibliography === undefined) {
      return [];
    }

    return Object.keys(this._data.general.bibliography);
  },

  getBibFormatter: function () {
    const lang = Checklist.getCurrentLanguage();
    if (!this._bibFormatterCache) this._bibFormatterCache = {};
    if (!this._bibFormatterCache[lang]) {
      const bibliography = this._data.versions[lang]?.dataset?.general?.bibliography
        || this._data.general?.bibliography;
      const style =
        this._data.versions[lang]?.useCitations ||
        Checklist._data.versions[Checklist.getCurrentLanguage()].useCitations;
      this._bibFormatterCache[lang] = new TinyBibFormatter(
        bibliography,
        {
          style: style ? style : "apa",
          format: "markdown",
        }
      );
    }
    return this._bibFormatterCache[lang];
  },

  getCustomOrderGroupItemsCache: new Map(),
  getCustomOrderGroupItems: function (type, dataPath, groupTitle) {
    let key = type + "|" + dataPath + "|" + groupTitle + "|";

    if (!this.getCustomOrderGroupItemsCache.has(key)) {
      let items = [];

      let searchCategory = undefined;
      if (type == "taxa") {
        searchCategory = Checklist.getTaxaMeta()[dataPath]?.searchCategoryOrder;
      } else if (type == "data") {
        let meta = Checklist.getMetaForDataPath(dataPath);
        searchCategory = meta?.searchCategoryOrder;
      }

      if (searchCategory && Array.isArray(searchCategory)) {
        items = searchCategory
          .filter((c) => c.group == groupTitle)
          .map((c) => c.title);
      }

      this.getCustomOrderGroupItemsCache.set(key, items);
    }

    return this.getCustomOrderGroupItemsCache.get(key);
  },

  getCustomOrderGroupCache: new Map(),
  getCustomOrderGroup: function (title, type, dataPath) {
    let key = title + "|" + type + "|" + dataPath;

    if (!this.getCustomOrderGroupCache.has(key)) {
      let guideItem = undefined;
      if (type == "taxa") {
        let meta = Checklist.getTaxaMeta()[dataPath];
        if (meta?.searchCategoryOrder) {
          guideItem = meta.searchCategoryOrder.find((c) => c.title == title);
        }
      } else if (type == "data") {
        let meta = Checklist.getMetaForDataPath(dataPath);
        if (meta?.searchCategoryOrder) {
          guideItem = meta.searchCategoryOrder.find((c) => c.title == title);
        }
      }

      this.getCustomOrderGroupCache.set(
        key,
        guideItem !== undefined && guideItem.group !== ""
          ? guideItem.group
          : undefined
      );
    }

    return this.getCustomOrderGroupCache.get(key);
  },

  getPreloadableAssets: function () {
    if (!this._isDataReady) {
      return [];
    }
    return Checklist._data.general.assets;
  },

  getBibliography: function () {
    if (!this._isDataReady) {
      return "";
    }
    return Checklist._data.general.bibliography;
  },

  getCurrentLanguage: function () {
    let lang = "";

    if (!this._isDataReady) {
      let versions = Object.keys(this._data?.versions);
      return versions?.length > 0 ? versions[0] : "en";
    }

    if (m.route.param("l")) {
      lang = m.route.param("l");
    } else if (Settings.language()) {
      lang = Settings.language();
    }

    if (Object.keys(this._data.versions).indexOf(lang) < 0) {
      lang = this.getDefaultLanguage();
    }

    return lang;
  },

  getCurrentDateFormat: function (langCode) {
    const resolvedLang = langCode || Checklist.getCurrentLanguage();
    return Checklist._data?.versions?.[resolvedLang]?.dateFormat || "YYYY-MM-DD";
  },

  getMonthNames: function (langCode) {
    const resolvedLang = langCode || Checklist.getCurrentLanguage();
    return resolveMonthNames(Checklist._data?.versions?.[resolvedLang]?.monthNames);
  },

  getShortMonthNames: function (langCode) {
    return deriveShortMonthNames(Checklist.getMonthNames(langCode));
  },

  getMonthLabel: function (monthNumber, langCode) {
    return getMonthLabel(monthNumber, Checklist.getMonthNames(langCode));
  },

  getShortMonthLabel: function (monthNumber, langCode) {
    return getShortMonthLabel(monthNumber, Checklist.getMonthNames(langCode));
  },

  getReferences: function () {
    return Checklist.getData().references;
  },

  getAllLanguages: function () {
    return Object.keys(this._data.versions).map(function (code) {
      return {
        code: code,
        name: Checklist._data.versions[code].languageName,
        fallbackUiLang: Checklist._data.versions[code].fallbackUiLang,
      };
    });
  },

  getDefaultLanguage: function () {
    return this._data.general.defaultVersion;
  },

  loadData: function (jsonData, isDraft) {

    if (
      jsonData === undefined ||
      jsonData === null ||
      jsonData.versions === undefined ||
      Object.keys(jsonData.versions) == 0
    ) {
      console.log("Data not present or malformed");
      this._isDataReady = false;
      m.route.set("/manage");
    }

    if (import.meta.env && import.meta.env.DEV) {
      console.time("Data loaded in");
    }
    if (this._isDataReady) {
      document.title = Checklist.getProjectName() + " | NaturaList";
    }

    this._data = jsonData;
    this._dataRevision += 1;

    this._isDraft = isDraft;
    this._bibFormatter = null;
    
    Checklist._dataFulltextIndex = {};
    Checklist._metaForDataPathCache = {};


    Checklist.handlebarsTemplates = {};

    //deep-clear filter
    Checklist.filter.taxa = {};
    Checklist.filter.data = {};
    Checklist.filter.text = "";
    Checklist.filter.delayCommitDataPath = "";
    Checklist.filter._queryResultCache = {};

    Checklist._taxonCache = new Map();
    Checklist._keyReachableTaxaCache = new Map();
    Checklist._keyLCACache = new Map(); // Clear LCA cache on data load
    Checklist.treefiedTaxaCache = null;
    Checklist._occurrenceDataPathCache = undefined;
    Checklist._hasOccurrencesCache = null;
    Checklist._bibFormatterCache = {};
    Checklist.nameForMapRegionCache = new Map();
    Checklist.getCustomOrderGroupItemsCache = new Map();
    Checklist.getCustomOrderGroupCache = new Map();
    clearSortByCustomOrderCache();
    clearLegendConfigCache();

    // each of taxa or data contains keys as "dataPath" and values as: all: [], possible: {}, selected: [], color: "",
    // "possible" is a hash table of values with number of their occurrences from current search (values and numbers)
    Object.keys(Checklist.getTaxaMeta()).forEach(function (dataPath, index) {
      Checklist.filter.taxa[dataPath] = {
        all: [],
        possible: {},
        selected: [],
        color: "",
        type: "text",
        matchMode: "any",
      };
    });

    let customDatatypeDataPaths = [];
    Object.keys(Checklist.getDataMeta()).forEach(function (dataPath, index) {
      let meta = Checklist.getMetaForDataPath(dataPath);

      let templateString = meta.template != null ? String(meta.template).trim() : "";

      if (templateString === "" && meta.formatting) {
        const reader = dataCustomTypes[meta.formatting];
        if (reader && reader.defaultTemplate) {
          templateString = reader.defaultTemplate;

          // CRITICAL: Write the string back to the meta object!
          // This ensures that helpers.processTemplate (which looks at uiContext.meta.template)
          // sees the injected default as if the user had typed it themselves.
          meta.template = templateString;
        }
      }

      if (templateString) {
        Checklist.handlebarsTemplates[dataPath] = Handlebars.compile(
          templateString
        );
      }

      let datatype = meta.datatype;
      if (datatype == "custom" || datatype == "text") {
        customDatatypeDataPaths.push(dataPath);
      }

      let searchCategory = meta.searchCategory;
      if (searchCategory && searchCategory.length > 0) {
        let filterPath = dataPath;
        let filterType = meta.formatting;

        if (filterType === "list") {
          // A "list" parent with a search category: the filter should
          // operate on the individual array members (the # sub-path),
          // not on the list container itself.
          filterPath = dataPath + "#";

          // Derive the sub-item formatting from any numbered child
          // (e.g. info.habitSearch1 → "category").
          const allMeta = Checklist.getDataMeta();
          const numberedKey = Object.keys(allMeta).find(k =>
            k.length > dataPath.length &&
            k.startsWith(dataPath) &&
            /^\d+$/.test(k.slice(dataPath.length))
          );
          const subMeta = numberedKey ? allMeta[numberedKey] : null;
          filterType = subMeta ? subMeta.formatting : "text";

          // Create a synthetic metadata entry for the # path so that
          // SearchView, FilterDropdownView, FilterCrumbsView and
          // TabSummary can resolve title, formatting and categories.
          allMeta[filterPath] = {
            ...(subMeta || {}),
            searchCategory: searchCategory,
            searchCategoryOrder: meta.searchCategoryOrder || [],
          };
        }

        const _plugin = dataCustomTypes[filterType]?.filterPlugin;
        Checklist.filter.data[filterPath] = {
          color: "",
          ...(_plugin?.createFilterDef
            ? _plugin.createFilterDef(filterType)
            : { type: filterType, all: [], possible: {}, selected: [], numeric: null }
          ),
        };
      }
    });

    //cleanup data-paths to only contain terminals
    customDatatypeDataPaths = customDatatypeDataPaths.filter(function (item) {
      let isPrefixed = false;
      customDatatypeDataPaths.forEach(function (testItem) {
        if (testItem.startsWith(item + ".")) {
          isPrefixed = true;
        }
      });
      if (isPrefixed) {
        return false;
      } else {
        return true;
      }
    });

    Checklist.filter.calculatePossibleFilterValues(this.getData().checklist);

    this.getData().checklist.forEach(t => {
      if (t.t && t.t.length > 0) {
        // Map the leaf name (last item in t) to the taxon object
        Checklist._taxonCache.set(t.t[t.t.length - 1].name, t);
      }
    });

    //fill "all" data
    Checklist.getData().checklist.forEach(function (taxon) {
      ["taxa", "data"].forEach(function (dataType) {
        Object.keys(Checklist.filter[dataType]).forEach(function (dataPath) {
          let value = null;

          if (dataType == "taxa") {
            let taxonTentative =
              taxon.t[Object.keys(Checklist.getTaxaMeta()).indexOf(dataPath)];
            if (taxonTentative !== undefined && taxonTentative !== null) {
              value = taxonTentative.name;
            }
          } else if (dataType == "data") {
            value = Checklist.getDataFromDataPath(taxon.d, dataPath);
          }

          if (value === null) {
            return;
          }

          let leafData = Checklist.getAllLeafData(value, false, dataPath);

          const _customType = dataCustomTypes[Checklist.filter[dataType][dataPath].type];
          const _allValues  = _customType?.extractAllValues
            ? _customType.extractAllValues(value, leafData)
            : leafData;  // default: dedup string/number leaf values (text, category, months, mapregions)
          _allValues.forEach(function (v) {
            if (_customType?.extractAllValues) {
              if (Array.isArray(v) || Checklist.filter[dataType][dataPath].all.indexOf(v) < 0) {
                Checklist.filter[dataType][dataPath].all.push(v);
              }
            } else {
              if (Checklist.filter[dataType][dataPath].all.indexOf(v) < 0) {
                Checklist.filter[dataType][dataPath].all.push(v);
              }
            }
          });
        });
      });
    });

    //browse possible data and add necessary items into filter
    Checklist.getAllLanguages().forEach(function (lang) {
      Checklist._dataFulltextIndex[lang.code] = [];

      Checklist._data.versions[lang.code].dataset.checklist.forEach(function (
        taxon,
        index
      ) {
        Checklist._dataFulltextIndex[lang.code][index] =
          textLowerCaseAccentless(
            Checklist.primitiveKeysOfObject(
              taxon,
              customDatatypeDataPaths,
              lang.code
            ).join("\n")
          );
      });
    });

    //as we just browsed all data, we can copy keys of "possible" to "all" and add colors too
    Object.keys(Checklist.filter.taxa).forEach(function (dataPath, index) {
      Checklist.filter.taxa[dataPath].color = getGradedColor("taxa", "filter");
    });

    Object.keys(Checklist.filter.data).forEach(function (dataPath, index) {
      Checklist.filter.data[dataPath].color = getGradedColor("data", "filter");
    });

    // This has ABSOLUTELY to go AFTER the "possible" and "all" content generation, otherwise we may miss many values that are not present when the data wree filteres with an URL query
    if (m.route.param("q") && m.route.param("q").length > 0) {
      let currentQuery = "{}";
      let q = {};
      currentQuery = decodeURI(m.route.param("q"));
      try {
        q = JSON.parse(currentQuery);
        Checklist.filter.setFromQuery(q);
      } catch (ex) {
        console.error("Malformed url query");
        routeTo("/checklist", "");
      }
    }

    this._isDataReady = true;

    validateActiveToolState(this.getData());

    // Clear and recompute searchable text cache
    this._searchableTextCache = {};
    this.precomputeSearchableText();

    if (import.meta.env && import.meta.env.DEV) {
      console.timeEnd("Data loaded in");
    }
  },

  /**
   * Pre-compute searchable text for all checklist items
   * Called during data loading
   */
  precomputeSearchableText: function () {
    const lang = Checklist.getCurrentLanguage();

    if (this._searchableTextCache[lang]) {
      return; // Already computed for this language
    }

    //console.time("Precompute searchable text");

    const checklist = this.getData().checklist;
    const dataMeta = this.getDataMeta();

    this._searchableTextCache[lang] = [];

    checklist.forEach((taxon, index) => {
      const searchableStrings = [];

      // Add taxa names and authorities
      taxon.t.forEach((taxonLevel) => {
        if (!taxonLevel) return;   // skip null gaps
        if (taxonLevel.name) searchableStrings.push(taxonLevel.name);
        if (taxonLevel.authority) searchableStrings.push(taxonLevel.authority);
      });

      // Add data fields using readers
      this._collectSearchableData(taxon.d, "", dataMeta, searchableStrings, lang);

      // Join and normalize for fulltext search
      this._searchableTextCache[lang][index] = textLowerCaseAccentless(
        searchableStrings.join("\n")
      );
    });

    //console.timeEnd("Precompute searchable text");
  },

  /**
   * Recursively collect searchable data from a data object
   */
  _collectSearchableData: function (dataObj, currentPath, dataMeta, results, langCode) {
    if (!dataObj || typeof dataObj !== "object") return;

    Object.keys(dataObj).forEach((key) => {
      const value = dataObj[key];
      const dataPath = currentPath ? `${currentPath}.${key}` : key;

      if (Array.isArray(value)) {
        // If this dataPath itself has a reader, the array IS its native value
        // (e.g. interval → [from, to], months → [1,3,5]).  Delegate and move on.
        // "list" is structural (container of sub-items), so iterate children instead.
        const ownMeta = dataMeta[dataPath];
        if (ownMeta && ownMeta.formatting && ownMeta.formatting !== "list") {
          const searchable = getSearchableTextByType(value, ownMeta.formatting, { langCode });
          results.push(...searchable);
        } else {
          // Sub-item array: each element has its own child formatting
          value.forEach((item, idx) => {
            const arrayPath = `${dataPath}${idx + 1}`;
            const meta = dataMeta[arrayPath] || dataMeta[dataPath.replace(/\d+$/, '#')];

            if (meta && meta.formatting) {
              const searchable = getSearchableTextByType(item, meta.formatting, { langCode });
              results.push(...searchable);
            } else if (typeof item === "object") {
              this._collectSearchableData(item, arrayPath, dataMeta, results, langCode);
            } else if (item !== null && item !== undefined) {
              results.push(String(item));
            }
          });
        }
      } else {
        const meta = dataMeta[dataPath];

        if (meta && meta.formatting && meta.formatting !== "list") {
          const searchable = getSearchableTextByType(value, meta.formatting, { langCode });
          results.push(...searchable);
        } else if (typeof value === "object") {
          this._collectSearchableData(value, dataPath, dataMeta, results, langCode);
        } else if (value !== null && value !== undefined) {
          results.push(String(value));
        }
      }
    });
  },

  /**
   * Get precomputed searchable text for a taxon by index
   */
  getSearchableTextForTaxon: function (index) {
    const lang = Checklist.getCurrentLanguage();
    if (!this._searchableTextCache[lang]) {
      this.precomputeSearchableText();
    }
    return this._searchableTextCache[lang][index] || "";
  },

  getDataObjectForHandlebars: function (
    currentValue,
    taxonData,
    taxonName,
    taxonAuthority,
    additionalParams = {}
  ) {
    if (currentValue === undefined || currentValue === null) {
      return currentValue;
    }

    const basePayload = {
      value: currentValue,
      data: taxonData,
      taxon: {
        fullName:
          taxonName + (taxonAuthority != "" ? " " + taxonAuthority : ""),
        name: taxonName,
        authority: taxonAuthority,
      },
    };

    return {
      ...basePayload,
      ...additionalParams
    };
  },

  getProjectName: function () {
    return Checklist._data.versions[Checklist.getCurrentLanguage()].name || "";
  },

  getDataCompilerVersion: function () {
    if (!this._isDataReady) {
      return null;
    }
    return Checklist._data?.general?.compiledForVersion;
  },

  getLastUpdatedTimestamp: function () {
    if (!this._isDataReady) {
      return null;
    }
    return Checklist._data?.general?.lastUpdate;
  },


  getProjectAbout: function () {
    let text = Checklist._data.versions[Checklist.getCurrentLanguage()].about;
    return text;
  },

  getProjectHowToCite: function () {
    let text =
      Checklist._data?.versions[Checklist.getCurrentLanguage()].howToCite;
    return text;
  },

  getThemeHsl: function (variant) {
    let sl = "29%, 47%";
    if (variant == "dark") {
      sl = "29%, 16%";
    }

    if (!Checklist._isDataReady) {
      return "hsl(212deg, " + sl + ")";
    }
    return (
      "hsl(" +
      Checklist._data.versions[Checklist.getCurrentLanguage()].colorThemeHue +
      "deg, " +
      sl +
      ")"
    );
  },

  primitiveKeysOfObject: function (taxon, dataPathsToKeep, langCode) {
    let primitives = [];

    taxon.t.forEach(function (scientificName) {
      if (!scientificName) return;   // skip null gaps
      primitives.push(scientificName.name + " " + scientificName.authority);
      if (scientificName.authority) primitives.push(scientificName.authority);
    });

    dataPathsToKeep.forEach(function (dataPath) {
      let currentData = Checklist.getDataFromDataPath(taxon.d, dataPath);
      if (!currentData) {
        return;
      }

      nestedPrimitives(currentData, dataPath).forEach(function (prim) {
        primitives.push(prim);
      });
    });

    return primitives;

    function nestedPrimitives(currentData, dataPath) {
      let primitives = [];

      //console.log("Data path: ", dataPath);
      //console.log("Meta", Checklist.getMetaForDataPath(dataPath));

      //TODO add feature rendering nested objects - this applies only if we have proper support of type (text/number) in complex objects

      if (Checklist.getMetaForDataPath(dataPath)?.formatting == "mapregions") {
        return primitives;
      }

      if (Checklist.getMetaForDataPath(dataPath)?.formatting == "months") {
        // months data is a flat number array, NOT a sub-item array.
        // Iterating it with index-based meta lookups (e.g. dataPath+"1") would
        // crash because those child paths don't exist. Instead, delegate to the
        // reader's getSearchableText so i18n month names ("January" etc.) are
        // properly indexed for full-text search.
        getSearchableTextByType(currentData, "months", { langCode }).forEach(
          text => primitives.push(text)
        );
        return primitives;
      }

      if (Checklist.getMetaForDataPath(dataPath)?.formatting == "interval") {
        // interval data is [from, to] — a pair of numbers, NOT a sub-item array.
        // Delegate to the reader so "3.5 - 7.2" is indexed for full-text search.
        getSearchableTextByType(currentData, "interval", {}).forEach(
          text => primitives.push(text)
        );
        return primitives;
      }

      if (Array.isArray(currentData)) {
        currentData.forEach(function (arrayMember, index) {
          if (Checklist.getMetaForDataPath(dataPath).formatting == "image") {
            primitives.push(arrayMember.source);
            primitives.push(arrayMember.title);
          } else if (
            Checklist.getMetaForDataPath(dataPath + (index + 1)) && Checklist.getMetaForDataPath(dataPath + (index + 1)).formatting ==
            "taxon"
          ) {
            primitives.push(arrayMember.name + " " + arrayMember.authority);
            primitives.push(arrayMember.authority);
          } else {
            primitives.push(arrayMember);
          }
        });
      } else if (
        Checklist.getMetaForDataPath(dataPath)?.formatting == "taxon"
      ) {
        primitives.push(currentData.name);
        primitives.push(currentData.authority);
      } else if (typeof currentData === "object") {
        Object.keys(currentData).forEach(function (key) {
          if (currentData.hasOwnProperty(key)) {
            nestedPrimitives(currentData[key], dataPath + "." + key).forEach(
              function (prim) {
                primitives.push(prim);
              }
            );
          }
        });
      } else {
        primitives.push(currentData);
      }

      return primitives;
    }
  },

  leafDataRenderCache: {},

  getAllLeafDataCache: new Map(),
  getAllLeafData: function (taxonData, includeAuthorities, currentPath = "") {
    let cacheKey = JSON.stringify([taxonData, includeAuthorities, currentPath]);

    if (!this.getAllLeafDataCache.has(cacheKey)) {
      let data = [];

      // Let the CustomType extract its own atomic leaf values when it knows better
      // than the generic recursive descent (interval pairs, mapregion name mapping).
      const _fmt        = Checklist.getDataMeta()[currentPath]?.formatting;
      const _customType = _fmt ? dataCustomTypes[_fmt] : null;
      if (_customType?.extractFilterLeafValues) {
        const _result = _customType.extractFilterLeafValues(taxonData, currentPath);
        this.getAllLeafDataCache.set(cacheKey, _result);
        return _result;
      }

      if (Checklist.getDataMeta()[currentPath]?.formatting == "image") {
        data = "<img src='" + "?" + "' />";
      } else if (Array.isArray(taxonData)) {
        taxonData.forEach(function (item) {
          data = data.concat(
            Checklist.getAllLeafData(
              item,
              includeAuthorities,
              currentPath + "#"
            )
          );
        });
      } else if (typeof taxonData === "object") {
        if (
          taxonData.hasOwnProperty("name") &&
          taxonData.hasOwnProperty("authority")
        ) {
          data.push(
            taxonData.name +
            (includeAuthorities ? " " + taxonData.authority : "")
          );
        } else {
          Object.keys(taxonData).forEach(function (key) {
            if (taxonData[key] == "") {
              return;
            }

            data = data.concat(
              Checklist.getAllLeafData(
                taxonData[key],
                includeAuthorities,
                currentPath + "." + key
              )
            );
          });
        }
      } else if (taxonData != "") {
        data.push(taxonData);
      }

      this.getAllLeafDataCache.set(cacheKey, data);
    }

    return this.getAllLeafDataCache.get(cacheKey);
  },

  getDataFromDataPath(dObject, dataPath) {
    let currentDataItem = dObject;

    dataPath.split(".").forEach(function (item) {
      if (currentDataItem == null) {
        return;
      }

      let arrayMode = false;
      if (item.endsWith("#")) {
        item = item.substring(0, item.length - 1);
        arrayMode = true;
      }

      if (!currentDataItem.hasOwnProperty(item)) {
        currentDataItem = null;
        return;
      }
      currentDataItem = currentDataItem[item];
    });

    return currentDataItem;
  },

  /**
   * Returns the effective data blob for a node, merging parent taxon data
   * when the node represents a occurrence.
   *
   * If `occurrenceMetaIndex` is missing/invalid or the node has no occurrence at
   * that index, the node's own `.d` is returned unchanged.
   *
   * When a occurrence is present the function searches `allTaxa` for the nearest
   * ancestor row that (a) has the same taxon name at the ancestor level and
   * (b) has no lower-level taxon entries after that level (i.e. its `t`
   *   entries for indices > i are all `null`/`undefined`). If such a parent
   * row with `.d` is found, the parent's data is merged with the occurrence's
   * `.d` and the merged result is returned. If no parent is found the
   * occurrence's `.d` is returned.
   *
   * Merge semantics (see `_deepMergeDataBlobs`):
   * - `formatting` is determined by `Checklist.getMetaForDataPath(dataPath)`;
   *   a node is treated as "structural" when `formatting === ""` or
   *   `formatting === "text"`.
   * - Structural nodes:
   *   - Arrays: concatenated then deduplicated using `Set` for primitives.
   *   - Plain objects: merged recursively (occurrence values override parent
   *     where present).
   *   - Scalars: occurrence value wins if not empty (see `_isValueEmpty`),
   *     otherwise parent is kept.
   * - Non-structural (atomic) nodes (e.g., "mapregions", "months"):
   *   treated as opaque: parent value is preserved if present; occurrence
   *   replaces parent only when the parent value is empty and occurrence
   *   provides data.
   *
   * Emptiness checks: `_isValueEmpty` treats `null`, `undefined`, empty
   * string, empty array, and empty object as empty.
   *
   * @param {Object} node - A taxon row from the flat checklist array.
   * @param {number} occurrenceMetaIndex - Index of occurrence level in t[].
   * @param {Array} allTaxa - The full or filtered checklist array (used to
   *   locate the parent row for inheritance). The filter engine already
   *   includes parent rows in filtered results via parentKeySet, so passing
   *   filteredTaxa is sufficient in most cases.
   * @returns {Object} The effective data blob to use for chart data reads.
   */
  getEffectiveDataForNode: function (node, occurrenceMetaIndex, allTaxa) {
    const isOccurrence =
      occurrenceMetaIndex !== undefined &&
      occurrenceMetaIndex !== -1 &&
      node.t[occurrenceMetaIndex] !== null &&
      node.t[occurrenceMetaIndex] !== undefined;

    if (!isOccurrence) {
      return node.d;
    }

    // Walk up t[] to find the parent taxon row.
    // The parent is the nearest ancestor whose row exists in allTaxa
    // and whose t[] stops before the occurrence index.
    let parentData = null;
    for (let i = occurrenceMetaIndex - 1; i >= 0; i--) {
      if (node.t[i] === null || node.t[i] === undefined) continue;
      const ancestorName = node.t[i].name;

      const ancestorRow = allTaxa.find(
        (tx) =>
          tx.t[i]?.name === ancestorName &&
          tx.t.slice(i + 1).every((x) => x === null || x === undefined)
      );

      if (ancestorRow && ancestorRow.d) {
        parentData = ancestorRow.d;
        break;
      }
    }

    if (!parentData) {
      return node.d; // No parent found, use own data as-is
    }

    return Checklist._deepMergeDataBlobs(parentData, node.d);
  },

  /**
     * Helper to check if a value is considered "empty".
     * Catches null, undefined, "", [], and {}.
     */
  _isValueEmpty: function (val) {
    if (val === null || val === undefined) return true;
    if (typeof val === "string" && val.trim() === "") return true;
    if (Array.isArray(val) && val.length === 0) return true;
    if (typeof val === "object" && !Array.isArray(val) && Object.keys(val).length === 0) return true;
    return false;
  },

  /**
   * Deep merges occurrence data into parent data based on schema formatting.
   * @param {Object} parentData - The base data (target)
   * @param {Object} occurrenceData - The incoming data to merge
   * @param {string} currentPath - The dot-notation path for fetching metadata
   */
  _deepMergeDataBlobs: function (parentData, occurrenceData, currentPath = "") {
    if (!parentData) return occurrenceData || {};
    if (!occurrenceData) return parentData || {};

    const result = Object.assign({}, parentData);

    Object.keys(occurrenceData).forEach((key) => {
      const occurrenceVal = occurrenceData[key];
      const parentVal = parentData[key];

      if (occurrenceVal === null || occurrenceVal === undefined) {
        // Occurrence has absolutely nothing — keep parent value
        return;
      }

      // 1. Build the path to fetch metadata
      const dataPath = currentPath ? `${currentPath}.${key}` : key;
      const meta = Checklist.getMetaForDataPath(dataPath);
      const formatting = meta ? (meta.formatting || "text") : "text";

      // 2. Determine if this node should be recursed into
      const isStructural = formatting === "" || formatting === "text" || formatting === "list";

      if (isStructural) {
        // --- RECURSIVE STRUCTURAL MERGE ---
        if (Array.isArray(occurrenceVal) && Array.isArray(parentVal)) {
          // Merge arrays by concatenation.
          // Using Set seamlessly deduplicates primitive values (e.g. ["tree", "tree"] -> ["tree"])
          // while safely keeping distinct object references side-by-side.
          result[key] = Array.from(new Set([...parentVal, ...occurrenceVal]));

        } else if (
          typeof occurrenceVal === "object" &&
          !Array.isArray(occurrenceVal) &&
          typeof parentVal === "object" &&
          !Array.isArray(parentVal) &&
          parentVal !== null
        ) {
          // Drill down into nested objects (e.g., 'info' -> 'habitsearch')
          result[key] = this._deepMergeDataBlobs(parentVal, occurrenceVal, dataPath);

        } else {
          // Scalar fallback for structural types: Occurrence wins if it has data
          const isEmpty = this._isValueEmpty(occurrenceVal);
          result[key] = isEmpty ? parentVal : occurrenceVal;
        }
      } else {
        // --- ATOMIC LITERAL MERGE (e.g., "mapregions", "months") ---
        // Treat as opaque: Perform merge ONLY if the target (parent) doesn't have it defined at all.
        const parentEmpty = this._isValueEmpty(parentVal);
        const occurrenceEmpty = this._isValueEmpty(occurrenceVal);

        if (parentEmpty && !occurrenceEmpty) {
          // Parent lacks data, occurrence provides it -> Occurrence wins
          result[key] = occurrenceVal;
        } else {
          // Parent already has data (or both are empty) -> Parent wins
          result[key] = parentVal;
        }
      }
    });

    return result;
  },

  getI18n: function () {
    return this.getData().i18n;
  },

  queryKey: function () {
    return Filter.queryKey();
  },

  getTaxaForCurrentQuery: function () {
    return Filter.getTaxaForCurrentQuery();
  },

  getTaxaMeta: function () {
    return this.getData().meta.taxa;
  },

  getMapRegionsLegendRows: function () {
    const legend = this.getData().meta.mapRegionsLegend;
    if (!legend) return [];
    const rows = [];
    if (legend.default) rows.push(legend.default);
    if (Array.isArray(legend.statuses)) rows.push(...legend.statuses);
    return rows.map(r => ({
      columnName:     r.columnName || "",
      statusCode:     r.status || "",
      fillColor:      r.fill || "",
      legend:         r.legend || "",
      appendedLegend: r.appendedLegend || "",
      legendType:     r.legendType || "",
    }));
  },

  getOccurrenceDataPath: function () {
    if (this._occurrenceDataPathCache !== undefined) {
      return this._occurrenceDataPathCache;
    }

    if (!this._data) {
      return null;
    }

    this._occurrenceDataPathCache =
      Object.keys(Checklist.getTaxaMeta()).find(
        (key) =>
          Checklist.getTaxaMeta()[key].name?.trim().toLowerCase() ===
          "occurrence"
      ) || null;

    return this._occurrenceDataPathCache;
  },

  getOccurrenceMetaIndex: function () {
    const occurrenceDataPath = Checklist.getOccurrenceDataPath();

    if (occurrenceDataPath === null) {
      return -1;
    }

    return Object.keys(Checklist.getTaxaMeta()).indexOf(occurrenceDataPath);
  },

  hasOccurrences: function () {
    if (this._hasOccurrencesCache !== null) {
      return this._hasOccurrencesCache;
    }

    if (!this._data) {
      return false;
    }

    const occurrenceMetaIndex = Checklist.getOccurrenceMetaIndex();
    this._hasOccurrencesCache =
      occurrenceMetaIndex !== -1 &&
      Checklist.getData().checklist.some(function (taxon) {
        const occurrenceEntry = taxon.t?.[occurrenceMetaIndex];
        return (
          occurrenceEntry !== null &&
          occurrenceEntry !== undefined &&
          occurrenceEntry.name?.trim() !== ""
        );
      });

    return this._hasOccurrencesCache;
  },

  getDataMeta: function (dataType) {
    if (dataType === undefined) {
      return this.getData().meta.data;
    }
    return this.getData().meta[dataType];
  },
  getMapRegionsMeta: function (returnDefault) {
    if (returnDefault) {
      return this.getData().meta.mapRegionsLegend.default;
    } else {
      return this.getData().meta.mapRegionsLegend.statuses;
    }
  },
  getMapRegionsNamesMeta: function () {
    return this.getData().meta.mapRegionsNames;
  },

  getTaxonByName: function (taxonNameFind) {
    if (this._taxonCache && this._taxonCache.has(taxonNameFind)) {
      // Return a copy or extended object to match the expected format (isInChecklist)
      const cached = this._taxonCache.get(taxonNameFind);
      return Object.assign({ isInChecklist: true }, cached);
    }

    let reconstructedTaxonomy = [];

    let found = this.getData().checklist.find(function (taxon) {
      for (let index = 0; index < taxon.t.length; index++) {
        const taxonName = taxon.t[index];
        if (taxonName === null) continue;
        if (taxonName.name == taxonNameFind) {
          if (reconstructedTaxonomy.length == 0) {
            reconstructedTaxonomy = taxon.t.slice(0, index + 1);
            break;
          }
        }
      }

      const taxonName = taxon.t[taxon.t.length - 1]; //the taxon name of this item is the last in the taxon array
      if (taxonName.name == taxonNameFind) {
        return true;
      }
      return false;
    });

    if (!found) {
      if (reconstructedTaxonomy.length > 0) {
        found = { t: reconstructedTaxonomy };
      } else {
        found = { t: [{ name: taxonNameFind, authority: "" }] };
      }
      found.isInChecklist = false;
    } else {
      found.isInChecklist = true;
    }

    return found;
  },

  treefiedTaxaCache: null,
  treefiedTaxa: function (taxa) {
    if (taxa === undefined) {
      //serve a cached version of the full taxa tree
      if (this.treefiedTaxaCache === null) {
        this.treefiedTaxaCache = this.treefiedTaxa(
          Checklist.getData().checklist
        );
      }
      return this.treefiedTaxaCache;
    }

    let treefied = {
      taxon: {},
      data: {},
      children: {},
    };

    taxa.forEach(function (taxon) {
      let currentParent = treefied;
      taxon.t.forEach(function (taxonOfThisLevel, index) {
        // Skip missing taxonomic levels so we can support "occurrences" as dangling taxon without a full taxonomy above them
        if (taxonOfThisLevel === null || taxonOfThisLevel === undefined) {
          return;
        }

        if (!currentParent.children.hasOwnProperty(taxonOfThisLevel.name)) {
          currentParent.children[taxonOfThisLevel.name] = {
            taxon: taxonOfThisLevel,
            taxonMetaIndex: index,
            data: {},
            children: {},
          };
        }

        const isLastNonNull = taxon.t.slice(index + 1).every(x => x === null);
        if (taxon.t.length == index + 1 || isLastNonNull) {
          currentParent.children[taxonOfThisLevel.name].data = taxon.d;
        }

        currentParent = currentParent.children[taxonOfThisLevel.name];
      });
    });

    // do sorting here according to custom rules in meta
    let meta = Checklist.getTaxaMeta();
    let orderByLevel = [];
    Object.keys(meta).forEach(function (metaKey) {
      let order = meta[metaKey].order;
      orderByLevel.push(order);
    });

    orderLevel(0, treefied);

    function orderLevel(level, subtree) {
      if (orderByLevel[level] == "alphabet") {
        let keys = Object.keys(subtree.children);
        keys = keys.sort(function (a, b) {
          return a.localeCompare(b, getCurrentLocaleBestGuess(), {
            ignorePunctuation: true,
          });
        });
        let tmp = {};
        keys.forEach(function (key) {
          tmp[key] = subtree.children[key];
        });
        subtree.children = tmp;
      }
      Object.keys(subtree.children).forEach(function (key) {
        if (subtree.children[key].children) {
          orderLevel(level + 1, subtree.children[key]);
        }
      });
    }

    return treefied;
  },

  getMetaForDataPath: function (dataPath) {
    if (dataPath.endsWith(templateResultSuffix)) {
      dataPath = dataPath.substring(
        0,
        dataPath.length - templateResultSuffix.length
      );
    }
    if (this._metaForDataPathCache.hasOwnProperty(dataPath)) {
      return this._metaForDataPathCache[dataPath];
    }
    let meta = null;
    if (this.getData().meta.data.hasOwnProperty(dataPath)) {
      meta = this.getData().meta.data[dataPath];
    }
    this._metaForDataPathCache[dataPath] = meta;
    return meta;
    //data not intended to be shown in view
    //return this.getData().meta.data["$$default-custom$$"];
  },

  /**
   * Returns true when the data at `dataPath` is inherently multi-value,
   * meaning a single taxon can hold more than one value simultaneously.
   *
   * Used by MatchModeToggle consumers (Phase 1) to decide whether the
   * "Match All" radio option should be offered.
   *
   *   List items  (#-paths):  a taxon may belong to multiple habit categories.
   *   months:                 a taxon is active in multiple months.
   *   mapregions:             a taxon occurs in multiple geographic regions.
   *   Everything else:        single-value — "Match All" would be a logical paradox.
   */
  isMultiValueDataPath: function (dataPath) {
    if (!this._isDataReady) return false;
    // List sub-item paths are registered with a trailing "#"
    if (dataPath.endsWith("#")) return true;
    const meta = this.getMetaForDataPath(dataPath);
    return meta?.formatting === "months" || meta?.formatting === "mapregions";
  },

  getTaxonLevelMeta(levelOrDataPath) {
    if (Number.isInteger(levelOrDataPath)) {
      levelOrDataPath = Object.keys(Checklist.getTaxaMeta())[levelOrDataPath];
    }

    let taxonMeta = Checklist.getTaxaMeta()[levelOrDataPath];
    return taxonMeta;
  },

  getNameOfTaxonLevel(levelOrDataPath) {
    return Checklist.getTaxonLevelMeta(levelOrDataPath)?.name;
  },

  getParentTaxonIndicator(currentLevel, parents) {
    let inverseTaxonLevel =
      Object.keys(Checklist.getTaxaMeta()).length - currentLevel;

    if (currentLevel <= 0 && inverseTaxonLevel <= 1) {
      //Nothing to show for topmost taxa
      return null;
    }

    let currentDataPath = currentLevel;
    currentDataPath = Object.keys(Checklist.getTaxaMeta())[currentDataPath];

    let currentTaxonMeta = Checklist.getTaxaMeta()[currentDataPath];

    let targetDataPath = currentTaxonMeta.parentTaxonIndication;

    if (targetDataPath === "none") {
      return null;
    }

    let offset = 1;
    if (targetDataPath === "") {
      targetDataPath = Object.keys(Checklist.getTaxaMeta()).at(
        currentLevel - offset
      );
    } else {
      offset =
        currentLevel -
        Object.keys(Checklist.getTaxaMeta()).indexOf(targetDataPath);
    }

    let targetTaxonMeta = Checklist.getTaxaMeta()[targetDataPath];

    if (targetTaxonMeta === undefined) {
      return null;
    }

    let parentInfo = {
      rank: targetTaxonMeta.name,
      rankColumnName: targetDataPath,
      taxon: parents.at(-1 * offset),
      offset: offset,
    };

    return parentInfo;
  },

  shouldItalicizeTaxon(levelOrDataPath) {
    let italicize = Checklist.getTaxonLevelMeta(levelOrDataPath)?.italicize;

    if (italicize === "yes") {
      return true;
    } else {
      return false;
    }
  },

  inverseTaxonLevel: function (currentLevel) {
    return Object.keys(Checklist.getTaxaMeta()).length - currentLevel;
  },

  getTaxonLevel: function (taxonName) {
    return Object.keys(this.getData().meta.taxa).indexOf(taxonName);
  },

  getChecklistDataCellsForTaxon: function (taxon) {
    let dataCells = {
      top: [],
      left: [],
      right: [],
      middle: [],
      bottom: [],
      details: [],
    };

    Object.keys(taxon.data).forEach(function (key) {
      let meta = Checklist.getMetaForDataPath(key);

      if (meta === null) {
        return;
      }

      if (meta.hasOwnProperty("datatype") && meta.datatype === "custom") {
        if (meta.hasOwnProperty("placement")) {
          meta.placement.forEach(function (placement) {
            if (
              dataCells.hasOwnProperty(placement) &&
              Array.isArray(dataCells[placement])
            ) {
              dataCells[placement].push(key);
            } else {
              console.log(
                "Unknown placement: '" + meta.placement + "' in '" + key + "'"
              );
              return;
            }
          });
        }
      }
    });

    return dataCells;
  },

  getDetailsTabsForTaxon: function (taxonName) {
    let originalTaxon = Checklist.getTaxonByName(taxonName);

    let tabs = {
      externalsearch: Checklist.getData().meta.externalSearchEngines,
      media: [],
      map: [],
      text: [],
    };

    if (originalTaxon === undefined || !originalTaxon.d) {
      return tabs;
    }

    let taxon = {
      data: originalTaxon.d,
      taxon: originalTaxon.t,
      children: {},
    };

    // Allowed formatting types for each tab
    const allowedMedia = ["image", "sound"];
    const allowedMap = ["map", "mapregions"];
    const allowedText = ["text", "markdown"];

    // Helper: add to correct tab if formatting and value are valid
    function tryAddToTab(formatting, data, meta, dataPath, tabType, arr) {
      // Reject empty containers that exist as placeholders on every row
      if (data === null || data === undefined) return false;
      if (Array.isArray(data) && data.length === 0) return false;
      if (typeof data === "object" && !Array.isArray(data) && Object.keys(data).length === 0) return false;

      if (tabType === "media" && allowedMedia.includes(formatting)) {
        arr.push({ data, meta, dataPath });
        return true;
      } else if (tabType === "map" && allowedMap.includes(formatting)) {
        arr.push({ data, meta, dataPath });
        return true;
      } else if (tabType === "text" && allowedText.includes(formatting)) {
        if (formatting === "text" && typeof data !== "string") return false;
        if (typeof data === "string" && data.trim() === "") return false;
        arr.push({ data, meta, dataPath });
        return true;
      }
      return false;
    }

    // For each tab type, collect rendering items as { groupTitle, items: [...] }
    ["media", "map", "text"].forEach(function (tabType) {
      let renderingItems = [];

      Object.keys(taxon.data).forEach(function (key) {
        let meta = Checklist.getMetaForDataPath(key);
        if (!meta || !meta.placement || !meta.placement.includes("details")) {
          return;
        }
        let data = taxon.data[key];

        // Try to add the parent item itself (root/simple)
        let rootItems = [];
        if (tryAddToTab(meta.formatting, data, meta, key, tabType, rootItems)) {
          renderingItems.push({
            groupTitle: "",
            items: rootItems
          });
          return;
        }

        // If not added, and data is array/object, check immediate children
        let childItems = [];
        if (Array.isArray(data)) {
          data.forEach(function (item, idx) {
            let childPath = key + (idx + 1);
            let childMeta = Checklist.getMetaForDataPath(childPath);
            if (childMeta) {
              tryAddToTab(childMeta.formatting, item, childMeta, childPath, tabType, childItems);
            }
          });
        } else if (typeof data === "object" && data !== null) {
          Object.keys(data).forEach(function (childKey) {
            let childPath = key + "." + childKey;
            let childMeta = Checklist.getMetaForDataPath(childPath);
            if (childMeta) {
              tryAddToTab(childMeta.formatting, data[childKey], childMeta, childPath, tabType, childItems);
            }
          });
        }
        if (childItems.length > 0) {
          renderingItems.push({
            groupTitle: meta.title || "",
            items: childItems
          });
        }
      });

      // Only keep rendering items with at least one item
      tabs[tabType] = renderingItems.filter(ri => ri.items && ri.items.length > 0);
    });

    return tabs;
  },

  getTaxaNamesPerLevel: function (taxonLevel, topmostTaxon) {
    if (!topmostTaxon) {
      topmostTaxon = "*";
    }

    let seen = {};
    let results = [];
    Checklist.getData().checklist.forEach(function (taxon) {
      if (topmostTaxon == "*" || taxon.t[0].name == topmostTaxon) {
        let taxonName = taxon.t[taxonLevel].name;
        if (!seen.hasOwnProperty(taxonName)) {
          seen[taxonName] = true;
          results.push(taxonName);
        }
      }
    });
    results.sort();
    return results;
  },

  postprocessedItemPropSuffix: "$$postprocessed",
  getPostProcessedValueForSimpleItem: function (item, dataPath) {
    let postprocessedKey = dataPath + Checklist.postprocessedItemPropSuffix;
    if (item.d && item.d.hasOwnProperty(postprocessedKey)) {
      return item.d[postprocessedKey];
    } else {
      let postProcessed = { plain: "", html: "" };

      item[postprocessedKey] = postProcessed;

      return postProcessed;
    }
  },
};

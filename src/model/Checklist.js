import m from "mithril"
import Handlebars from "handlebars";
import { TinyBibFormatter } from 'bibtex-json-toolbox';

import {
  getCurrentLocaleBestGuess,
  getGradedColor,
  routeTo,
  textLowerCaseAccentless,
} from "../components/Utils.js";
import { _t } from "./I18n.js";
import { Settings } from "./Settings.js";
import { Filter } from "./Filter.js";

const templateResultSuffix = "$$templateresult";

export let Checklist = {
  getData: function () {
    return Checklist._data.versions[Checklist.getCurrentLanguage()].dataset;
  },

  getEntireChecklist: function () {
    return Checklist._data.versions[Checklist.getCurrentLanguage()].dataset
      .checklist;
  },

  _data: null,
  _dataFulltextIndex: {},
  _isDraft: false,
  _isDataReady: false,

  // Replace single _bibFormatter with a per-language cache
  _bibFormatterCache: {},

  filter: Filter,

  databaseShortcodeList: [
    {
      code: "gbif",
      name: "GBIF ($author$$id$)",
      url: "https://www.gbif.org/occurrence/$id$",
    },
    {
      code: "gbif.s",
      name: "GBIF (Taxon $author$$id$)",
      url: "https://www.gbif.org/species/$id$",
    },
    {
      code: "inat",
      name: "$author$ (iNat $id$)",
      url: "https://www.inaturalist.org/observations/$id$",
    },
    {
      code: "ebird",
      name: "eBird ($author$$id$)",
      url: "https://ebird.org/checklist/S$id$",
      idModifier: (id) =>
        id.toLowerCase().startsWith("s") ? id.substring(1) : id,
    },
    {
      code: "clml",
      name: "ML ($author$$id$)",
      url: "https://macaulaylibrary.org/asset/$id$",
    },
    {
      code: "obse",
      name: "Observation.org ($author$$id$)",
      url: "https://observation.org/observation/$id$",
    },
  ],

  transformDatabaseShortcodes: function (text) {
    if (text === undefined || text === null || typeof text !== "string") {
      return text;
    }

    if (text.indexOf("@") > -1) {
      text = text.replace(
        /@([a-z]+)(\.[a-z]+)?:(?:([^:]+):)?([a-zA-Z0-9-_\/]+)/gm,
        (match, enginePrefix, engineOption, author, value) => {
          let engineCode = enginePrefix + (engineOption ? engineOption : "");

          let engine = Checklist.databaseShortcodeList.find(
            (item) => item.code == engineCode
          );

          if (engine) {
            value =
              engine.idModifier !== undefined
                ? engine.idModifier(value)
                : value;

            // Prepare note and id for replacement
            let authorText = author ? author + " " : "";
            let link =
              '<a class="citation" href="' +
              engine.url.replace("$id$", value) +
              '" target="_blank">' +
              engine.name
                .replace("$author$", authorText)
                .replace("$id$", value) +
              "</a>";
            return match.replace(match, link);
          } else {
            console.log("Unknown engine: " + engineCode);
            return match;
          }
        }
      );
    }

    return text;
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
      //m.redraw();
      //return false;
    }

    console.time("Data loaded in");
    if (this._isDataReady) {
      document.title = Checklist.getProjectName() + " | NaturaList";
    }

    //try {
    this._data = jsonData;

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

    // each of taxa or data contains keys as "dataPath" and values as: all: [], possible: {}, selected: [], color: "",
    // "possible" is a hash table of values with number of their occurrences from current search (values and numbers)
    Object.keys(Checklist.getTaxaMeta()).forEach(function (dataPath, index) {
      Checklist.filter.taxa[dataPath] = {
        all: [],
        possible: {},
        selected: [],
        color: "",
        type: "text",
      };
    });

    let customDatatypeDataPaths = [];
    Object.keys(Checklist.getDataMeta()).forEach(function (dataPath, index) {
      let meta = Checklist.getMetaForDataPath(dataPath);

      if (meta.template && meta.template.length > 0) {
        Checklist.handlebarsTemplates[dataPath] = Handlebars.compile(
          meta.template
        );
      }

      let datatype = meta.datatype;
      if (datatype == "custom" || datatype == "text") {
        customDatatypeDataPaths.push(dataPath);
      }

      let searchCategory = meta.searchCategory;
      if (searchCategory && searchCategory.length > 0) {
        Checklist.filter.data[dataPath] = {
          all: [],
          possible: {},
          selected: [],
          color: "",
          type: Checklist.getMetaForDataPath(dataPath).formatting,
          numeric: {
            threshold1: null,
            threshold2: null,
            operation: "",
          },
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

          if (
            Checklist.filter[dataType][dataPath].type == "text" ||
            Checklist.filter[dataType][dataPath].type == "map regions" ||
            Checklist.filter[dataType][dataPath].type == "badge"
          ) {
            leafData.forEach(function (value) {
              if (Checklist.filter[dataType][dataPath].all.indexOf(value) < 0) {
                Checklist.filter[dataType][dataPath].all.push(value);
              }
            });
          } else if (Checklist.filter.data[dataPath].type == "number") {
            leafData.forEach(function (value) {
              Checklist.filter[dataType][dataPath].all.push(value);
            });
          }
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
              customDatatypeDataPaths
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
    /*
    } catch (ex) {
      console.log("Error loading data: " + ex);
      this._isDataReady = false;
      m.route.set("/manage");
      m.redraw();
      return false;
    }
    */
  },

  getDataObjectForHandlebars: function (
    currentValue,
    taxonData,
    taxonName,
    taxonAuthority
  ) {
    if (currentValue === undefined || currentValue === null) {
      return currentValue;
    }

    return {
      value: currentValue.toString(),
      data: taxonData,
      taxon: {
        fullName:
          taxonName + (taxonAuthority != "" ? " " + taxonAuthority : ""),
        name: taxonName,
        authority: taxonAuthority,
      },
    };
  },

  getProjectName: function () {
    return Checklist._data.versions[Checklist.getCurrentLanguage()].name || "";
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

  primitiveKeysOfObject: function (taxon, dataPathsToKeep) {
    let primitives = [];

    taxon.t.forEach(function (scientificName) {
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

      if (Checklist.getMetaForDataPath(dataPath)?.formatting == "map regions") {
        return primitives;
      }

      if (Array.isArray(currentData)) {
        currentData.forEach(function (arrayMember, index) {
          if (Checklist.getMetaForDataPath(dataPath).formatting == "image") {
            primitives.push(arrayMember.source);
            primitives.push(arrayMember.title);
          } else if (
            Checklist.getMetaForDataPath(dataPath + (index + 1)).formatting ==
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

      if (Checklist.getDataMeta()[currentPath]?.formatting == "map regions") {
        // Work directly with object format
        if (typeof taxonData === "object" && taxonData) {
          data = Object.keys(taxonData).map((regionCode) =>
            Checklist.nameForMapRegion(regionCode)
          );
        }
      } else if (Checklist.getDataMeta()[currentPath]?.formatting == "image") {
        console.log("################### IMG", taxonData);

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
    let reconstructedTaxonomy = [];

    let found = this.getData().checklist.find(function (taxon) {
      for (let index = 0; index < taxon.t.length; index++) {
        const taxonName = taxon.t[index];
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
        if (!currentParent.children.hasOwnProperty(taxonOfThisLevel.name)) {
          currentParent.children[taxonOfThisLevel.name] = {
            taxon: taxonOfThisLevel,
            data: {},
            children: {},
          };
        }

        if (taxon.t.length == index + 1) {
          //add data to the last item
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
    const allowedMap = ["map", "map regions"];
    const allowedText = ["text", "markdown"];

    // Helper: add to correct tab if formatting and value are valid
    function tryAddToTab(formatting, data, meta, dataPath, tabType, arr) {
      if (tabType === "media" && allowedMedia.includes(formatting)) {
        arr.push({ data, meta, dataPath });
        return true;
      } else if (tabType === "map" && allowedMap.includes(formatting)) {
        arr.push({ data, meta, dataPath });
        return true;
      } else if (tabType === "text" && allowedText.includes(formatting)) {
        // Only add "text" if it's a string
        if (formatting === "text" && typeof data !== "string") return false;
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

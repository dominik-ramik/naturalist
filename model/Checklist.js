import { appVersion } from "../app.js";
import { getCurrentLocaleBestGuess, getGradedColor, routeTo, textLowerCaseAccentless } from "../components/Utils.js";
import { _t } from "./I18n.js";
import { Settings } from "./Settings.js";

export let Checklist = {

    getData: function () {
        return Checklist._data.versions[Checklist.getCurrentLanguage()].dataset;
    },

    _data: null,
    _dataFulltextIndex: {},
    _isDraft: false,
    _isDataReady: false,

    filter: {
        taxa: {},
        data: {},
        text: "",
        delayCommitDataPath: "", //this data path is the one of the last used dropdown and will not update possibles of that dropdown untill the dropdown is hidden to allow for multiple selection
        commit: function (specificRoute) {
            if (specificRoute) {
                routeTo(specificRoute);
            } else {
                routeTo("/search");
            }
        },
        setFromQuery: function (query) {
            Checklist.filter.clear();
            ["taxa", "data"].forEach(function (type) {
                if (query[type]) {
                    Object.keys(query[type]).forEach(function (dataPath) {
                        if (Checklist.filter[type][dataPath].type == "text") {
                            Checklist.filter[type][dataPath].selected = query[type][dataPath];
                        } else if (Checklist.filter[type][dataPath].type == "number") {
                            Checklist.filter[type][dataPath].numeric.operation = query[type][dataPath].o;
                            Checklist.filter[type][dataPath].numeric.threshold1 = query[type][dataPath].a;
                            if (query[type][dataPath].hasOwnProperty("b")) {
                                Checklist.filter[type][dataPath].numeric.threshold2 = query[type][dataPath].b;
                            }
                        }
                    });
                }
            });
            if (query.text && query.text.length > 0) Checklist.filter.text = query.text;
        },
        clear: function () {
            Object.keys(Checklist.filter.taxa).forEach(function (dataPath) {
                Checklist.filter.taxa[dataPath].selected = [];
            });
            Object.keys(Checklist.filter.data).forEach(function (dataPath) {
                Checklist.filter.data[dataPath].selected = [];
                Checklist.filter.data[dataPath].numeric = {
                    threshold1: null,
                    threshold2: null,
                    operation: ""
                };
            });
            Checklist.filter.text = "";
        },
        isEmpty: function () {
            let countFilters = 0;
            ["taxa", "data"].forEach(function (type) {
                Object.keys(Checklist.filter[type]).forEach(function (dataPath) {
                    if (Checklist.filter[type][dataPath].type == "text") {
                        countFilters += Checklist.filter[type][dataPath].selected.length;
                    } else if (Checklist.filter[type][dataPath].type == "number") {
                        if (Checklist.filter[type][dataPath].numeric.operation != "") {
                            countFilters++;
                        }
                    }

                });
            });
            if (Checklist.filter.text.length > 0) countFilters++;

            return countFilters == 0;
        },
        numericFilterToHumanReadable: function (dataPath, operation, threshold1, threshold2, formatPre, formatPost, ommitSearchCategory) {
            let title = "";
            if (ommitSearchCategory) {
                title += (formatPre ? formatPre : "") + Checklist.getMetaForDataPath(dataPath).searchCategory + (formatPost ? formatPost : "") + " ";
            }
            title += _t("numeric_filter_" + operation + "_short") + " ";
            title += threshold1.toLocaleString();
            if (Checklist.filter.numericFilters[operation].values > 1) {
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
                }
            },
            lesser: {
                operation: "lesser",
                icon: "lesser",
                values: 1,
                comparer: function (valueToTest, threshold1, threshold2) {
                    return valueToTest < threshold1;
                }
            },
            lesserequal: {
                operation: "lesserequal",
                icon: "lesserequal",
                values: 1,
                comparer: function (valueToTest, threshold1, threshold2) {
                    return valueToTest <= threshold1;
                }
            },
            greater: {
                operation: "greater",
                icon: "greater",
                values: 1,
                comparer: function (valueToTest, threshold1, threshold2) {
                    return valueToTest > threshold1;
                }
            },
            greaterequal: {
                operation: "greaterequal",
                icon: "greaterequal",
                values: 1,
                comparer: function (valueToTest, threshold1, threshold2) {
                    return valueToTest >= threshold1;
                }
            },
            between: {
                operation: "between",
                icon: "between",
                values: 2,
                comparer: function (valueToTest, threshold1, threshold2) {
                    return valueToTest >= threshold1 && valueToTest <= threshold2;
                }
            },
            around: {
                operation: "around",
                icon: "around",
                values: 2,
                comparer: function (valueToTest, threshold1, threshold2) {
                    return valueToTest >= threshold1 - threshold2 && valueToTest <= threshold1 + threshold2;
                }
            },
        }
    },

    getPreloadableAssets: function () {
        if (!this._isDataReady) {
            return [];
        }
        return Checklist._data.general.assets;
    },

    getCurrentLanguage: function () {
        let lang = "";

        if (!this._isDataReady) {
            let versions = Object.keys(this._data?.versions)
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
            return { "code": code, "name": Checklist._data.versions[code].languageName, "fallbackUiLang": Checklist._data.versions[code].fallbackUiLang };
        });
    },

    getDefaultLanguage: function () {
        return this._data.general.defaultVersion;
    },
    getDefaultI18n: function () {
        return this._data.general.default_i18n;
    },

    //precompiled Handlebars templates saved as dataPath key and template as a value ... precompiled during loadData
    handlebarsTemplates: {},

    loadData: function (jsonData, isDraft) {
        if (jsonData === undefined || jsonData === null || jsonData.versions === undefined || Object.keys(jsonData.versions) == 0) {
            console.log("Data not present or malformed");
            this._isDataReady = false;
            m.route.set("/manage");
            //m.redraw();
            //return false;
        }

        console.time("Data loaded in");
        if(this._isDataReady){
            document.title = Checklist.getProjectName() + " | NaturaList";
        }

        try {
            this._data = jsonData;
            this._isDraft = isDraft;

            Checklist._dataFulltextIndex = {};

            Checklist.handlebarsTemplates = {};
            Checklist._queryResultCache = {};

            //deep-clear filter
            Checklist.filter.taxa = {};
            Checklist.filter.data = {};
            Checklist.filter.text = "";
            Checklist.filter.delayCommitDataPath = "";

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
                let meta = Checklist.getMetaForDataPath(dataPath)

                if (meta.template && meta.template.length > 0) {
                    Checklist.handlebarsTemplates[dataPath] = Handlebars.compile(meta.template);
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
                        type: Checklist.getMetaForDataPath(dataPath).contentType,
                        numeric: {
                            threshold1: null,
                            threshold2: null,
                            operation: ""
                        }
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

            Checklist.calculatePossibleFilterValues(this.getData().checklist);

            //fill "all" data
            Checklist.getData().checklist.forEach(function (taxon) {
                ["taxa", "data"].forEach(function (dataType) {
                    Object.keys(Checklist.filter[dataType]).forEach(function (dataPath) {
                        let value = null;

                        if (dataType == "taxa") {
                            let taxonTentative = taxon.t[Object.keys(Checklist.getTaxaMeta()).indexOf(dataPath)];
                            if (taxonTentative !== undefined && taxonTentative !== null) {
                                value = taxonTentative.n;
                            }
                        } else if (dataType == "data") {
                            value = Checklist.getDataFromDataPath(taxon.d, dataPath);
                        }

                        if (value === null) {
                            return;
                        }

                        let leafData = Checklist.getAllLeafData(value);
                        if (Checklist.filter[dataType][dataPath].type == "text") {
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
                Checklist._data.versions[lang.code].dataset.checklist.forEach(function (taxon, index) {
                    Checklist._dataFulltextIndex[lang.code][index] = textLowerCaseAccentless(Checklist.primitiveKeysOfObject(taxon, customDatatypeDataPaths).join("\n"));
                });
            });

            //as we just browsed all data, we can copy keys of "possible" to "all" and add colors too
            Object.keys(Checklist.filter.taxa).forEach(function (dataPath, index) {
                Checklist.filter.taxa[dataPath].color = getGradedColor("taxa", index);
            });

            Object.keys(Checklist.filter.data).forEach(function (dataPath, index) {
                Checklist.filter.data[dataPath].color = getGradedColor("data", index);
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
            console.timeEnd("Data loaded in");
        }

        catch (ex) {
            console.log("Error loading data: " + ex);
            this._isDataReady = false;
            m.route.set("/manage");
            m.redraw();
            return false;
        }

    },

    getDataObjectForHandlebars: function (currentValue, taxonData, taxonName, taxonAuthority) {
        return {
            value: currentValue.toString(),
            data: taxonData,
            taxon: {
                fullName: taxonName + (taxonAuthority != "" ? " " + taxonAuthority : ""),
                name: taxonName,
                authority: taxonAuthority,
            }
        }
    },

    getProjectName: function () {
        return Checklist._data.versions[Checklist.getCurrentLanguage()].name || "";
    },
    getProjectAbout: function () {
        let text = Checklist._data.versions[Checklist.getCurrentLanguage()].about;
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
        return "hsl(" + Checklist._data.versions[Checklist.getCurrentLanguage()].colorThemeHue + "deg, " + sl + ")";
    },

    calculatePossibleFilterValues: function (taxa) {
        //clear filter possible data        
        ["taxa", "data"].forEach(function (dataType) {
            Object.keys(Checklist.filter[dataType]).forEach(function (dataPath) {
                if (Checklist.filter.delayCommitDataPath == dataType + "." + dataPath) {
                    return; //delay this dataPath
                } else {
                    if (Checklist.filter[dataType][dataPath].type == "text") {
                        Checklist.filter[dataType][dataPath].possible = {};
                    }
                    if (Checklist.filter[dataType][dataPath].type == "number") {
                        Checklist.filter[dataType][dataPath].possible = [];
                        Checklist.filter[dataType][dataPath].min = null;
                        Checklist.filter[dataType][dataPath].max = null;
                    }
                }
            });
        });

        taxa.forEach(function (taxon, index) {
            //add number of occurrences of possible taxa items
            Object.keys(Checklist.filter.taxa).forEach(function (dataPath, index) {
                if (Checklist.filter.delayCommitDataPath == "taxa." + dataPath) {
                    return; //delay this dataPath
                }
                if (index >= taxon.t.length) {
                    return; //happens when we have data items on a higher than lowest ranking taxon (eg. genus)
                }
                let value = taxon.t[index].n; // !!! we suppose here that in filter taxa keys are ordered in order of appearance in "t" section                
                if (Checklist.filter.taxa[dataPath].type == "text") {
                    if (!Checklist.filter.taxa[dataPath].possible.hasOwnProperty(value)) {
                        Checklist.filter.taxa[dataPath].possible[value] = 0;
                    }
                    Checklist.filter.taxa[dataPath].possible[value]++;
                }
            });
            //add number of occurrences of possible data items
            Object.keys(Checklist.filter.data).forEach(function (dataPath) {
                if (Checklist.filter.delayCommitDataPath == "data." + dataPath) {
                    return; //delay this dataPath
                }
                let value = Checklist.getDataFromDataPath(taxon.d, dataPath);

                if (value === null) {
                    //enable the next line to test data that were not exported
                    return; //when there is no data associated with the dataPath
                }

                let leafData = Checklist.getAllLeafData(value);
                if (Checklist.filter.data[dataPath].type == "text") {
                    leafData.forEach(function (value) {
                        if (!Checklist.filter.data[dataPath].possible.hasOwnProperty(value)) {
                            Checklist.filter.data[dataPath].possible[value] = 0;
                        }
                        Checklist.filter.data[dataPath].possible[value]++;
                    });
                } else if (Checklist.filter.data[dataPath].type == "number") {
                    leafData.forEach(function (value) {
                        if (Checklist.filter.data[dataPath].min === null || value < Checklist.filter.data[dataPath].min) {
                            Checklist.filter.data[dataPath].min = value;
                        }
                        if (Checklist.filter.data[dataPath].max === null || value > Checklist.filter.data[dataPath].max) {
                            Checklist.filter.data[dataPath].max = value;
                        }

                        Checklist.filter.data[dataPath].possible.push(value);
                    });
                }
            });
        });

        Object.keys(Checklist.filter.data).forEach(function (dataPath) {
            if (Checklist.filter.data[dataPath].type == "number") {
                if (Checklist.filter.data[dataPath].globalMin === undefined || Checklist.filter.data[dataPath].globalMin === null) {
                    Checklist.filter.data[dataPath].globalMin = Checklist.filter.data[dataPath].min;
                }
                if (Checklist.filter.data[dataPath].globalMax === undefined || Checklist.filter.data[dataPath].globalMax === null) {
                    Checklist.filter.data[dataPath].globalMax = Checklist.filter.data[dataPath].max;
                }
            }
        });
    },

    primitiveKeysOfObject: function (taxon, dataPathsToKeep) {
        let primitives = [];

        taxon.t.forEach(function (scientificName) {
            primitives.push(scientificName.n + " " + scientificName.a);
            if (scientificName.a) primitives.push(scientificName.a);
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

            //TODO add feature rendering nested objects - this applies only if we have proper support of type (text/number) in complex objects
            if (Array.isArray(currentData)) {
                currentData.forEach(function (arrayMember, index) {
                    if (Checklist.getMetaForDataPath(dataPath + (index + 1)).contentType == "taxon") {
                        primitives.push(arrayMember.n + " " + arrayMember.a);
                        primitives.push(arrayMember.a);
                    } else {
                        primitives.push(arrayMember);
                    }
                });
            } else if (Checklist.getMetaForDataPath(dataPath).contentType == "taxon") {
                primitives.push(currentData.n);
                primitives.push(currentData.a);
            } else if (typeof currentData === "object") {
                Object.keys(currentData).forEach(function (key) {
                    if (currentData.hasOwnProperty(key)) {
                        nestedPrimitives(currentData[key], dataPath + "." + key).forEach(function (prim) {
                            primitives.push(prim);
                        });
                    }
                });
            } else {
                primitives.push(currentData);
            }

            return primitives;
        }
    },

    getAllLeafData: function (taxonData, includeAuthorities) {
        let data = [];

        if (Array.isArray(taxonData)) {
            taxonData.forEach(function (item) {
                data = data.concat(Checklist.getAllLeafData(item));
            });
        } else if (typeof taxonData === 'object') {
            if (taxonData.hasOwnProperty("n") && taxonData.hasOwnProperty("a")) {
                data.push(taxonData.n + (includeAuthorities ? " " + taxonData.a : ""));
            } else {
                Object.keys(taxonData).forEach(function (key) {
                    data = data.concat(Checklist.getAllLeafData(taxonData[key]));
                });
            }
        } else {
            data.push(taxonData);
        }

        return data;
    },

    getDataFromDataPath(dObject, dataPath) {
        let currentDataItem = dObject;

        dataPath.split(".").forEach(function (item) {

            if (currentDataItem == null) {
                return;
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

    _queryResultCache: {},
    queryKey: function () {
        let key = { "taxa": {}, "data": {} };
        Object.keys(key).forEach(function (type) {
            Object.keys(Checklist.filter[type]).forEach(function (dataPath) {
                if (Checklist.filter[type][dataPath].type == "text") {
                    if (Checklist.filter[type][dataPath].selected.length > 0) {
                        key[type][dataPath] = [];
                    }
                    Checklist.filter[type][dataPath].selected.forEach(function (selected) {
                        key[type][dataPath].push(selected);
                    });
                } else if (Checklist.filter[type][dataPath].type == "number") {
                    if (Checklist.filter[type][dataPath].numeric.operation != "") {
                        key[type][dataPath] = {};
                        key[type][dataPath].o = Checklist.filter[type][dataPath].numeric.operation;
                        key[type][dataPath].a = Checklist.filter[type][dataPath].numeric.threshold1;
                        if (Checklist.filter.numericFilters[Checklist.filter[type][dataPath].numeric.operation].values > 1) {
                            key[type][dataPath].b = Checklist.filter[type][dataPath].numeric.threshold2;
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

        if (Checklist.filter.text.length > 0) {
            key.text = Checklist.filter.text;
        }

        let stringKey = JSON.stringify(key);

        return stringKey;
    },
    queryCache: {
        cache: function (searchResults) {
            let queryKey = Checklist.queryKey();
            Checklist._queryResultCache[queryKey] = {};
            Checklist._queryResultCache[queryKey].taxa = searchResults;
            Checklist._queryResultCache[queryKey].filter = JSON.parse(JSON.stringify(Checklist.filter));
        },
        retrieve: function () {
            let queryKey = Checklist.queryKey();

            if (Checklist._queryResultCache.hasOwnProperty(queryKey)) {
                return Checklist._queryResultCache[queryKey];
            }

            return false;
        }
    },

    getTaxaForCurrentQuery: function () {
        if (!this._isDataReady) {
            return [];
        }

        //sanitize filter ... remove impossible selected (when in taxa selecting two higher units then one lower and then unchecking the one higher)
        ["taxa", "data"].forEach(function (type) {
            Object.keys(Checklist.filter[type]).forEach(function (dataPath) {
                Checklist.filter[type][dataPath].selected = Checklist.filter[type][dataPath].selected.filter(function (selectedItem) {
                    if (Object.keys(Checklist.filter[type][dataPath].possible).indexOf(selectedItem) < 0) {
                        console.log("Sanitized " + type + " - " + dataPath + " - " + selectedItem);
                        return false;
                    } else {
                        return true;
                    }
                });
            });
        });

        let emptyFilter = Checklist.filter.isEmpty();

        let cacheResult = Checklist.queryCache.retrieve();
        if (cacheResult) {
            Checklist.calculatePossibleFilterValues(cacheResult.taxa);
            return cacheResult.taxa;
        }

        let textFilter = textLowerCaseAccentless(Checklist.filter.text).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); //escape for RegEx use
        let textFilterRegex = new RegExp("\\b" + textFilter);

        let searchResults = this.getData().checklist.filter(function (item, itemIndex) {
            let found = true;

            if (!emptyFilter) {
                Object.keys(Checklist.filter.taxa).forEach(function (dataPath, index) {
                    if (Checklist.filter.taxa[dataPath].selected.length == 0) {
                        return;
                    }

                    let foundAny = false;
                    Checklist.filter.taxa[dataPath].selected.forEach(function (selectedItem) {
                        if (index < item.t.length && item.t[index].n == selectedItem) {
                            foundAny = true;
                        }
                    });
                    if (!foundAny) {
                        found = false;
                    }
                });

                Object.keys(Checklist.filter.data).forEach(function (dataPath, index) {
                    if (Checklist.filter.data[dataPath].type == "text") {
                        if (Checklist.filter.data[dataPath].selected.length == 0) {
                            return;
                        }
                    } else if (Checklist.filter.data[dataPath].type == "number") {
                        if (Checklist.filter.data[dataPath].numeric.operation == "") {
                            return;
                        }
                    }

                    let foundAny = false;
                    if (Checklist.filter.data[dataPath].type == "text") {
                        Checklist.filter.data[dataPath].selected.forEach(function (selectedItem) {
                            let data = Checklist.getDataFromDataPath(item.d, dataPath);
                            if (!data) {
                                return;
                            }

                            let leafData = Checklist.getAllLeafData(data, true);
                            leafData.forEach(function (leafDataItem) {
                                if (selectedItem == leafDataItem) {
                                    foundAny = true;
                                }
                            });
                        });
                    } else if (Checklist.filter.data[dataPath].type == "number") {

                        if (Checklist.filter.data[dataPath].numeric.operation != "") {
                            let valueToCheck = Checklist.getDataFromDataPath(item.d, dataPath);

                            let numericFilter = Checklist.filter.numericFilters[Checklist.filter.data[dataPath].numeric.operation];

                            if (numericFilter.comparer(valueToCheck, Checklist.filter.data[dataPath].numeric.threshold1, Checklist.filter.data[dataPath].numeric.threshold2)) {
                                foundAny = true;
                            }
                        }
                    }

                    if (!foundAny) {
                        found = false;
                    }
                });

                if (textFilter.length > 0) { //textFilter is already lowercase and so is $$fulltext$$
                    if (!textFilterRegex.test(Checklist._dataFulltextIndex[Checklist.getCurrentLanguage()][itemIndex])) {
                        found = false;
                    }
                }
            }

            return found;
        });

        Checklist.calculatePossibleFilterValues(searchResults);
        this.queryCache.cache(searchResults);

        return searchResults;
    },

    getTaxaMeta: function () {
        return this.getData().meta.taxa;
    },

    getDataMeta: function () {
        return this.getData().meta.data;
    },
    getMapRegionsMeta: function (returnDefault) {
        if (returnDefault) {
            return this.getData().meta.mapRegions.default;
        } else {
            return this.getData().meta.mapRegions.suffixes;
        }
    },

    getTaxonByName: function (taxonNameFind) {

        let reconstructedTaxonomy = [];

        let found = this.getData().checklist.find(function (taxon) {
            for (let index = 0; index < taxon.t.length; index++) {
                const taxonName = taxon.t[index];
                if (taxonName.n == taxonNameFind) {
                    if (reconstructedTaxonomy.length == 0) {
                        reconstructedTaxonomy = taxon.t.slice(0, index + 1);
                        break;
                    }
                }
            }

            const taxonName = taxon.t[taxon.t.length - 1]; //the taxon name of this item is the last in the taxon array
            if (taxonName.n == taxonNameFind) {
                return true;
            }
            return false;
        });

        if (!found) {
            if (reconstructedTaxonomy.length > 0) {
                found = { t: reconstructedTaxonomy };
            } else {
                found = { t: [{ n: taxonNameFind, a: "" }] }
            }
            found.isInChecklist = false;
        } else {
            found.isInChecklist = true;
        }

        return found;
    },

    treefiedTaxa: function (taxa) {

        let treefied = {
            taxon: {},
            data: {},
            children: {}
        };

        taxa.forEach(function (taxon) {
            let currentParent = treefied;
            taxon.t.forEach(function (taxonOfThisLevel, index) {
                if (!currentParent.children.hasOwnProperty(taxonOfThisLevel.n)) {
                    currentParent.children[taxonOfThisLevel.n] = {
                        taxon: taxonOfThisLevel,
                        data: {},
                        children: {}
                    }
                }

                if (taxon.t.length == index + 1) { //add data to the last item
                    currentParent.children[taxonOfThisLevel.n].data = taxon.d;
                }

                currentParent = currentParent.children[taxonOfThisLevel.n];
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
                    return a.localeCompare(b, getCurrentLocaleBestGuess(), { ignorePunctuation: true });
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
        if (this.getData().meta.data.hasOwnProperty(dataPath)) {
            return this.getData().meta.data[dataPath];
        }
        console.log("Metadata not found for " + dataPath);
        return this.getData().meta.data["$$default-custom$$"];
    },

    getNameOfTaxonLevel(levelOrDataPath) {
        if (Number.isInteger(levelOrDataPath)) {
            levelOrDataPath = Object.keys(Checklist.getTaxaMeta())[levelOrDataPath];
        }

        let taxonMeta = Checklist.getTaxaMeta()[levelOrDataPath];
        return taxonMeta.name;
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
            bottom: []
        };

        Object.keys(taxon.data).forEach(function (key) {

            let meta = Checklist.getMetaForDataPath(key);

            if (meta.hasOwnProperty("datatype") && meta.datatype === "custom") {
                if (meta.hasOwnProperty("placement")) {

                    if (meta.placement == "auto") {
                        console.log("Unexpected placement " + meta.placement + " in key " + key);
                        meta.placement = "top";
                    }

                    switch (meta.placement) {
                        case "top":
                            dataCells.top.push(key)
                            break;
                        case "bottom":
                            dataCells.bottom.push(key)
                            break;
                        case "left":
                            dataCells.left.push(key)
                            break;
                        case "middle":
                            dataCells.middle.push(key)
                            break;
                        case "right":
                            dataCells.right.push(key)
                            break;
                        default:
                            console.log("Unknown placement: '" + meta.placement + "' in '" + key + "'");
                            break;
                    }
                }
            }
        });

        return dataCells;
    },

    getDetailsTabsForTaxon: function (taxonName) {

        let taxon = Checklist.getTaxonByName(taxonName);

        let tabs = {
            externalsearch: Checklist.getData().meta.externalSearchEngines
        };

        if (taxon === undefined || !taxon.d) {
            return tabs;
        }

        Object.keys(Checklist.getDataMeta()).forEach(function (metaKey) {
            let meta = Checklist.getDataMeta()[metaKey];
            if (meta.hasOwnProperty("datatype") && meta.datatype != "custom") {
                if (taxon.d.hasOwnProperty(metaKey)) {

                    let mediaData = taxon.d[metaKey];

                    if (meta.datatype == "media") {
                        let cleanedMediaData = [];

                        mediaData.forEach(function (item) {
                            if (item === undefined || item === null || item.source.trim() == "") {
                                return;
                            }
                            cleanedMediaData.push(item);
                        });

                        if (cleanedMediaData.length == 0) {
                            return;
                        }
                    }

                    if (Object.keys(tabs).indexOf(meta.datatype) < 0) {
                        tabs[meta.datatype] = [];
                    }
                    tabs[meta.datatype].push(metaKey);
                }
            }
        });

        Object.keys(taxon.d).forEach(function (key) {

            let meta = Checklist.getMetaForDataPath(key);

            if (meta.hasOwnProperty("datatype") && meta.datatype !== "custom") {


            }
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
            if (topmostTaxon == "*" || taxon.t[0].n == topmostTaxon) {
                let taxonName = taxon.t[taxonLevel].n;
                if (!seen.hasOwnProperty(taxonName)) {
                    seen[taxonName] = true;
                    results.push(taxonName);
                }
            }
        });
        results.sort();
        return results;
    }
}
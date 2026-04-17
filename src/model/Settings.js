import dayjs from "dayjs";
import { formatList } from "../components/Utils.js";
import { Checklist } from "./Checklist.js";
import { dataCustomTypes } from "./customTypes/index.js";
import { ANALYTICAL_INTENT_OCCURRENCE, ANALYTICAL_INTENT_TAXA } from "./nlDataStructureSheets.js";

export let Settings = {
  // Full-text search OR separator symbol
  SEARCH_OR_SEPARATOR: "/",

  // Storage persistence status (set at runtime)
  _storagePersistent: null,

  lastKnownDataVersion(objToSet) {
    const key = "lastKnownDataVersion";
    if (objToSet === undefined) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) throw new Error();
        const parsed = JSON.parse(raw);
        // Ensure all keys exist
        return {
          lastModified: parsed.lastModified ?? null,
          etag: parsed.etag ?? null,
          lastManualUpdate: parsed.lastManualUpdate ?? null
        };
      } catch {
        // If parsing fails, force manual update
        return { lastModified: null, etag: null, lastManualUpdate: null };
      }
    } else {
      localStorage.setItem(key, JSON.stringify({
        lastModified: objToSet.lastModified ?? null,
        etag: objToSet.etag ?? null,
        lastManualUpdate: objToSet.lastManualUpdate ?? null
      }));
    }
  },

  language: function (languageToSet) {
    if (languageToSet === undefined) {
      return window.localStorage.getItem("language");
    } else {
      window.localStorage.setItem("language", languageToSet);
    }
  },

  viewType: function (viewToSet) {
    if (viewToSet === undefined) {
      const type = window.localStorage.getItem("viewType");
      if (!type || type === undefined) {
        return "tool_taxonomic_tree";
      } else {
        return type;
      }
    } else {
      window.localStorage.setItem("viewType", viewToSet);
    }
  },

  circlePackingMaxLevels: function (val) {
    if (val === undefined) {
      const stored = window.localStorage.getItem("circlePackingMaxLevels");
      return stored ? parseInt(stored) : 4; // Default to 4
    } else {
      window.localStorage.setItem("circlePackingMaxLevels", val);
    }
  },

  mapChartCurrentMap: function (mapJSON) {
    if (mapJSON === undefined) {
      const mapJSON = window.localStorage.getItem("mapChartCurrentMap");
      if (!mapJSON || mapJSON === undefined) {
        return null;
      } else {
        return JSON.parse(mapJSON);
      }
    } else {
      window.localStorage.setItem("mapChartCurrentMap", mapJSON);
    }
  },

  mapChartCurrentSumMethod: function (method) {
    if (method === undefined) {
      const method = window.localStorage.getItem("mapChartCurrentSumMethod");
      if (!method || method === undefined) {
        return "filter";
      } else {
        return method;
      }
    } else {
      window.localStorage.setItem("mapChartCurrentSumMethod", method);
    }
  },

  categoryChartCategory: function (data) {
    if (data === undefined) {
      const value = window.localStorage.getItem("categoryChartCategory");
      if (!value || value === undefined) {
        return "";
      } else {
        return value;
      }
    } else {
      window.localStorage.setItem("categoryChartCategory", data);
    }
  },

  categoryChartRoot: function (data) {
    if (data === undefined) {
      const value = window.localStorage.getItem("categoryChartRoot");
      if (!value || value === undefined) {
        return "";
      } else {
        return value;
      }
    } else {
      window.localStorage.setItem("categoryChartRoot", data);
    }
  },
  categoryChartDisplayMode: function (data) {
    if (data === undefined) {
      const value = window.localStorage.getItem("categoryChartDisplayMode");
      if (!value || value === undefined) {
        return "";
      } else {
        return value;
      }
    } else {
      window.localStorage.setItem("categoryChartDisplayMode", data);
    }
  },

  categoryChartDateBinning: function (data) {
    if (data === undefined) {
      const value = window.localStorage.getItem("categoryChartDateBinning");
      return (!value) ? "month" : value;
    } else {
      window.localStorage.setItem("categoryChartDateBinning", data);
    }
  },

    categoryChartShowEmptyColumns: function (data) {
    if (data === undefined) {
      const value = window.localStorage.getItem("categoryChartShowEmptyColumns");
      // Default true - show all columns out of the box
      return value === null ? true : value === "true";
    } else {
      window.localStorage.setItem("categoryChartShowEmptyColumns", String(data));
    }
  },

    categoryChartSumMethod: function (data) {
    if (data === undefined) {
      const value = window.localStorage.getItem("categoryChartSumMethod");
      return (!value) ? "taxon" : value;
    } else {
      window.localStorage.setItem("categoryChartSumMethod", data);
    }
  },

  categoryChartMode: function (data) {
    if (data === undefined) {
      const value = window.localStorage.getItem("categoryChartMode");
      return (!value) ? "taxa" : value;
    } else {
      window.localStorage.setItem("categoryChartMode", data);
    }
  },

  mapChartMode: function (data) {
    if (data === undefined) {
      const value = window.localStorage.getItem("mapChartMode");
      return (!value) ? "taxa" : value;
    } else {
      window.localStorage.setItem("mapChartMode", data);
    }
  },

  circlePackMode: function (data) {
    if (data === undefined) {
      const value = window.localStorage.getItem("circlePackMode");
      return (!value) ? "taxa" : value;
    } else {
      window.localStorage.setItem("circlePackMode", data);
    }
  },

  circlePackingMaxLevels: function (val) {
    if (val === undefined) {
      const stored = window.localStorage.getItem("circlePackingMaxLevels");
      return stored ? parseInt(stored) : 4; // Default to 4 levels
    } else {
      window.localStorage.setItem("circlePackingMaxLevels", val);
    }
  },

  alreadyViewedAboutSection: function (alreadyViewed) {
    if (alreadyViewed === undefined) {
      const viewed = window.localStorage.getItem("alreadyViewed");
      if (!viewed || viewed === undefined) {
        return false;
      } else {
        return viewed;
      }
    } else {
      window.localStorage.setItem("alreadyViewed", alreadyViewed);
    }
  },

  mobileFiltersPaneCollapsed: function (value) {
    if (value === undefined) {
      const stored = window.localStorage.getItem("mobileFiltersPaneCollapsed");
      return stored === null ? true : stored === "true";

    } else {
      window.localStorage.setItem("mobileFiltersPaneCollapsed", value);
    }
  },

  includeMatchChildren: function (value) {
    // Legacy alias kept for backward compatibility.
    return Settings.checklistIncludeChildren(value);
  },

  includeOccurrencesInView: function (value) {
    // Legacy alias kept for backward compatibility.
    return Settings.checklistShowOccurrences(value);
  },

  analyticalIntent: function (value) {
    if (value === undefined) {
      let stored = window.localStorage.getItem("analyticalIntent");

      if (stored === null) {
        const defaultVal = Checklist.hasOccurrences() ? ANALYTICAL_INTENT_OCCURRENCE : ANALYTICAL_INTENT_TAXA;
        window.localStorage.setItem("analyticalIntent", defaultVal);
        return defaultVal;
      }

      return stored;
    } else {
      window.localStorage.setItem("analyticalIntent", value);
    }
  },

  checklistShowOccurrences: function (value) {
    if (value === undefined) {
      const stored = window.localStorage.getItem("checklistShowOccurrences");
      return stored === null ? true : stored === "true";
    } else {
      window.localStorage.setItem("checklistShowOccurrences", value);
    }
  },

  checklistPruneEmpty: function (value) {
    if (value === undefined) {
      const stored = window.localStorage.getItem("checklistPruneEmpty");
      return stored === null ? true : stored === "true";
    } else {
      window.localStorage.setItem("checklistPruneEmpty", value);
    }
  },

  checklistShowTaxonMeta: function (value) {
    if (value === undefined) {
      const stored = window.localStorage.getItem("checklistShowTaxonMeta");
      return stored === null ? true : stored === "true";
    } else {
      window.localStorage.setItem("checklistShowTaxonMeta", value);
    }
  },

  checklistShowOccurrenceMeta: function (value) {
    if (value === undefined) {
      const stored = window.localStorage.getItem("checklistShowOccurrenceMeta");
      return stored === null ? true : stored === "true";
    } else {
      window.localStorage.setItem("checklistShowOccurrenceMeta", value);
    }
  },

  checklistShowTerminalOnly: function (value) {
    if (value === undefined) {
      const stored = window.localStorage.getItem("checklistShowTerminalOnly");
      return stored === null ? false : stored === "true";
    } else {
      window.localStorage.setItem("checklistShowTerminalOnly", value);
    }
  },

  checklistIncludeChildren: function (value) {
    if (value === undefined) {
      const stored = window.localStorage.getItem("checklistIncludeChildren");
      if (stored === null) {
        return true;
      }
      return stored === "true";
    } else {
      window.localStorage.setItem("checklistIncludeChildren", value);
      // Keep old key synced for older callsites.
      window.localStorage.setItem("includeMatchChildren", value);
    }
  },

  checklistDisplayLevel: function (value) {
    // empty string means all taxon levels
    if (value === undefined) {
      const stored = window.localStorage.getItem("checklistDisplayLevel");
      return stored === null ? "" : stored;
    } else {
      window.localStorage.setItem("checklistDisplayLevel", value);
    }
  },

  lastKnownUploadFormAvailability: function (value) {
    if (value === undefined) {
      return window.localStorage.getItem("lastKnownUploadFormAvailability");
    } else {
      window.localStorage.setItem("lastKnownUploadFormAvailability", value);
    }
  },

    /**
   * Persist the last-used spreadsheet URL (URL-input tab).
   */
  spreadsheetUrl: function (value) {
    if (value === undefined) {
      return window.localStorage.getItem("spreadsheetUrl") || "";
    } else {
      if (value) {
        window.localStorage.setItem("spreadsheetUrl", value);
      } else {
        window.localStorage.removeItem("spreadsheetUrl");
      }
    }
  },
 
  /**
   * Persist which upload source tab the user last used ('file' | 'url').
   */
  manageUploadMode: function (value) {
    if (value === undefined) {
      return window.localStorage.getItem("manageUploadMode") || "file";
    } else {
      window.localStorage.setItem("manageUploadMode", value);
    }
  },

  currentDetailsTab: function (value) {
    if (value) {
      window.localStorage.setItem("currentDetailsTab", value);
    } else {
      return window.localStorage.getItem("currentDetailsTab") || "summary";
    }
  },

  pinnedSearches: {
    getAll: function () {
      let storedItem = window.localStorage.getItem("pinned");
      if (!storedItem) {
        storedItem = "[]";
      }
      let pinned = JSON.parse(storedItem);

      let current = null;
      let others = [];

      pinned.forEach(function (pinnedItem) {
        if (Settings.pinnedSearches.matchesCurrent(pinnedItem)) {
          current = pinnedItem;
        } else {
          others.push(pinnedItem);
        }
      });

      let sortedPinned = [];
      if (current != null) {
        sortedPinned.push(current);
      }
      if (others.length > 0) {
        sortedPinned = sortedPinned.concat(others);
      }

      return sortedPinned;
    },
    addCurrent: function () {
      if (this.isCurrentSearchPinned()) {
        return;
      }

      let pinned = this.getAll();
      let item = JSON.parse(Checklist.queryKey());
      item.v = Settings.viewType();
      item.s = Settings.analyticalIntent();
      pinned.push(item);

      window.localStorage.setItem("pinned", JSON.stringify(pinned));
    },
getHumanNameForSearch: function (itemObject, usePlainTextOutput) {
  if (itemObject === undefined) {
    itemObject = JSON.parse(Checklist.queryKey());
  }

  // Strip tool/scope keys - only the filter portion matters here
  const { v: _v, s: pinnedScope, ...filterPart } = itemObject;
  itemObject = filterPart;

  if (Object.keys(itemObject).length === 0) {
    const scope = pinnedScope || Settings.analyticalIntent();
    return scope === ANALYTICAL_INTENT_OCCURRENCE ? t("view_chart_mode_occurrence") : t("view_chart_mode_taxa");
  }

  const opts  = { html: !usePlainTextOutput };
  const names = [];

  ["taxa", "data"].forEach(function (type) {
    if (!itemObject.hasOwnProperty(type)) return;
    Object.keys(itemObject[type]).forEach(function (dataPath) {
      // Guard: stale pinned searches may reference removed data paths
      if (type === "data" && !Object.prototype.hasOwnProperty.call(Checklist.getDataMeta(), dataPath)) {
        Settings.pinnedSearches.remove(itemObject);
        return;
      }

      const categoryName = type === "taxa"
        ? Checklist.getNameOfTaxonLevel(dataPath)
        : Checklist.getDataMeta()[dataPath].searchCategory;

      // For taxa the filterDef type is always "text"; for data use the column's formatting
      const formatting = type === "taxa"
        ? "text"
        : Checklist.getMetaForDataPath(dataPath).formatting;

      const plugin = dataCustomTypes[formatting]?.filterPlugin;
      if (!plugin) return;

      const desc = plugin.describeSerializedValue(
        dataPath,
        itemObject[type][dataPath],
        { ...opts, categoryName }
      );
      if (desc) names.push(desc);
    });
  });

  if (itemObject.hasOwnProperty("text") && itemObject.text.length > 0) {
    let textDisplay = itemObject.text;
    if (textDisplay.indexOf(Settings.SEARCH_OR_SEPARATOR) !== -1) {
      const joiner = usePlainTextOutput
        ? " " + t("crumb_or") + " "
        : "</strong> " + t("crumb_or") + " <strong>";
      textDisplay = textDisplay.split(Settings.SEARCH_OR_SEPARATOR).join(joiner);
    }
    names.push(
      t("text_is_list_joiner") + " " +
      (usePlainTextOutput ? "" : "<strong>") +
      textDisplay +
      (usePlainTextOutput ? "" : "</strong>")
    );
  }

  return formatList(names);
},
    isCurrentSearchPinned: function () {
      return this.getAll().some(function (pinnedItem) {
        return Settings.pinnedSearches.matchesCurrent(pinnedItem);
      });
    },
    matchesCurrent: function (pinnedItem) {
      const { v, s, ...filterPart } = pinnedItem;
      if (JSON.stringify(filterPart) !== Checklist.queryKey()) return false;
      if (v && v !== Settings.viewType()) return false;
      if (s && s !== Settings.analyticalIntent()) return false;
      return true;
    },
    remove: function (itemObject) {
      let toRemove = JSON.stringify(itemObject);

      let withoutItemToRemove = this.getAll().filter(function (pinnedItem) {
        if (JSON.stringify(pinnedItem) == toRemove) {
          return false;
        }
        return true;
      });

      window.localStorage.setItem(
        "pinned",
        JSON.stringify(withoutItemToRemove)
      );
    },
  },
};

import dayjs from "dayjs";
import m from "mithril";
import { formatList } from "../components/Utils.js";
import { Checklist } from "./Checklist.js";
import { dataCustomTypes } from "./customTypes/index.js";
import { ANALYTICAL_INTENT_OCCURRENCE, ANALYTICAL_INTENT_TAXA } from "./DataStructure.js";
import { selfKey, t, tf } from 'virtual:i18n-self';
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
   * Persist whether the user has acknowledged the static-hosting CORS notice.
   */
  corsWarningAcknowledged: function (value) {
    if (value === undefined) {
      return window.localStorage.getItem("corsWarningAcknowledged") === "true";
    } else {
      if (value) {
        window.localStorage.setItem("corsWarningAcknowledged", "true");
      } else {
        window.localStorage.removeItem("corsWarningAcknowledged");
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
    /*
     * Storage format: each pin is { params, label }
     *
     *   params — the route-param object that routeTo() would build:
     *            { l, q, v, s }  (language, query, viewType, analyticalIntent)
     *            Stored verbatim so restoration is a direct m.route.set() call.
     *            Any future params added to routeTo() are automatically included
     *            when new pins are saved; old pins simply won't have those keys,
     *            which is harmless.
     *
     *   label  — HTML string computed once at save time (keywords bolded).
     *            Frozen so it never mutates with dataset changes.
     *
     * Any entry that doesn't conform to this shape is silently discarded.
     */

    _isValidPin: function (p) {
      return p !== null &&
             typeof p === "object" &&
             typeof p.params === "object" && p.params !== null &&
             typeof p.label === "string";
    },

    _currentParams: function () {
      return {
        l: m.route.param("l") || Settings.language() || "",
        q: Checklist.queryKey(),
        v: Settings.viewType(),
        s: Settings.analyticalIntent(),
      };
    },

    _paramsMatch: function (a, b) {
      if (!a || !b) return false;
      return a.l === b.l &&
             a.q === b.q &&
             a.v === b.v &&
             a.s === b.s;
    },

    getAll: function () {
      try {
        const raw = window.localStorage.getItem("pinned");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        // Discard any entries that don't match the current format.
        const valid = parsed.filter(Settings.pinnedSearches._isValidPin);
        if (valid.length !== parsed.length) {
          window.localStorage.setItem("pinned", JSON.stringify(valid));
        }

        // Active pin (if any) sorts to the top.
        const current = valid.filter(p => Settings.pinnedSearches._paramsMatch(p.params, Settings.pinnedSearches._currentParams()));
        const others  = valid.filter(p => !Settings.pinnedSearches._paramsMatch(p.params, Settings.pinnedSearches._currentParams()));
        return current.concat(others);
      } catch (e) {
        return [];
      }
    },

    addCurrent: function () {
      if (this.isCurrentSearchPinned()) return;

      const params = Settings.pinnedSearches._currentParams();
      const label  = Settings.pinnedSearches.getHumanNameForSearch();

      const pinned = this.getAll();
      pinned.push({ params, label });
      window.localStorage.setItem("pinned", JSON.stringify(pinned));
    },

    /*
     * Returns the HTML label for a given pin, or computes it for the current
     * state when called with no argument (used by ChecklistView and others).
     */
    getHumanNameForSearch: function (pinnedItem) {
      if (pinnedItem && typeof pinnedItem.label === "string") {
        return pinnedItem.label;
      }
      return Settings.pinnedSearches._buildLabel();
    },

    /*
     * Builds an HTML description of the current filter state.
     * Keywords are wrapped in <strong>; falls back to scope name when empty.
     */
    _buildLabel: function () {
      let filterPart;
      try {
        filterPart = JSON.parse(Checklist.queryKey());
      } catch (e) {
        filterPart = {};
      }

      const scope = Settings.analyticalIntent();
      const names = [];

      ["taxa", "data"].forEach(function (type) {
        if (!Object.prototype.hasOwnProperty.call(filterPart, type)) return;
        Object.keys(filterPart[type]).forEach(function (dataPath) {
          if (type === "data" && !Object.prototype.hasOwnProperty.call(Checklist.getDataMeta(), dataPath)) return;

          const categoryName = type === "taxa"
            ? Checklist.getNameOfTaxonLevel(dataPath)
            : Checklist.getDataMeta()[dataPath].searchCategory;

          const dataType = type === "taxa"
            ? "text"
            : Checklist.getMetaForDataPath(dataPath).dataType;

          const plugin = dataCustomTypes[dataType]?.filterPlugin;
          if (!plugin) return;

          const desc = plugin.describeSerializedValue(
            dataPath,
            filterPart[type][dataPath],
            { html: true, categoryName }
          );
          if (desc) names.push(desc);
        });
      });

      if (Object.prototype.hasOwnProperty.call(filterPart, "text") && filterPart.text.length > 0) {
        let textDisplay = filterPart.text;
        if (textDisplay.indexOf(Settings.SEARCH_OR_SEPARATOR) !== -1) {
          textDisplay = textDisplay
            .split(Settings.SEARCH_OR_SEPARATOR)
            .join("</strong> " + t("crumb_or") + " <strong>");
        }
        names.push(t("text_is_list_joiner") + " <strong>" + textDisplay + "</strong>");
      }

      const result = formatList(names);
      if (!result) {
        return scope === ANALYTICAL_INTENT_OCCURRENCE
          ? t("view_chart_mode_occurrence")
          : t("view_chart_mode_taxa");
      }
      return result;
    },

    isCurrentSearchPinned: function () {
      const cur = Settings.pinnedSearches._currentParams();
      return this.getAll().some(p => Settings.pinnedSearches._paramsMatch(p.params, cur));
    },

    matchesCurrent: function (pinnedItem) {
      if (!Settings.pinnedSearches._isValidPin(pinnedItem)) return false;
      return Settings.pinnedSearches._paramsMatch(pinnedItem.params, Settings.pinnedSearches._currentParams());
    },

    remove: function (pinnedItem) {
      const updated = this.getAll().filter(p => !Settings.pinnedSearches._paramsMatch(p.params, pinnedItem.params));
      window.localStorage.setItem("pinned", JSON.stringify(updated));
    },
  },
};
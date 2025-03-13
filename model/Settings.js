import { formatList } from "../components/Utils.js";
import { Checklist } from "./Checklist.js";
import { _t } from "./I18n.js";

export let Settings = {
  lastKnownVersion(timestampToSet) {
    if (timestampToSet === undefined) {
      let timestamp = localStorage.getItem("lastKnownDataVersion");
      if (!timestamp) {
        return 0;
      } else {
        return parseInt(timestamp);
      }
    } else {
      localStorage.setItem("lastKnownDataVersion", timestampToSet.toString());
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
        return "view_details";
      } else {
        return type;
      }
    } else {
      window.localStorage.setItem("viewType", viewToSet);
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
  categoryChartSumMethod: function (data) {
    if (data === undefined) {
      const value = window.localStorage.getItem("categoryChartSumMethod");
      if (!value || value === undefined) {
        return "";
      } else {
        return value;
      }
    } else {
      window.localStorage.setItem("categoryChartSumMethod", data);
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

  lastKnownUploadFormAvailability: function (value) {
    if (value === undefined) {
      return window.localStorage.getItem("lastKnownUploadFormAvailability");
    } else {
      window.localStorage.setItem("lastKnownUploadFormAvailability", value);
    }
  },

  _currentDetailsTab: "externalsearch",
  currentDetailsTab: function (value) {
    if (value) {
      this._currentDetailsTab = value;
    } else {
      return this._currentDetailsTab;
    }
  },

  pinnedSearches: {
    getAll: function () {
      let storedItem = window.localStorage.getItem("pinned");
      if (!storedItem) {
        storedItem = "[]";
      }
      let currentSearchKey = Checklist.queryKey();
      let pinned = JSON.parse(storedItem);

      let current = null;
      let others = [];

      pinned.forEach(function (pinnedItem) {
        if (JSON.stringify(pinnedItem) == currentSearchKey) {
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
      pinned.push(JSON.parse(Checklist.queryKey()));

      window.localStorage.setItem("pinned", JSON.stringify(pinned));
    },
    getHumanNameForSearch: function (itemObject) {
      if (Object.keys(itemObject).length == 0) {
        return "All taxa";
      }

      let names = [];

      ["taxa", "data"].forEach(function (type) {
        if (itemObject.hasOwnProperty(type)) {
          Object.keys(itemObject[type]).forEach(function (dataPath) {
            let categoryName = "";

            if (type == "taxa") {
              categoryName = Checklist.getNameOfTaxonLevel(dataPath);
            } else if (type == "data") {
              if (Object.keys(Checklist.getDataMeta()).indexOf(dataPath) < 0) {
                Settings.pinnedSearches.remove(itemObject);
                return;
              }

              categoryName = Checklist.getDataMeta()[dataPath].searchCategory;
            }

            if (
              type == "taxa" ||
              Checklist.getMetaForDataPath(dataPath).contentType == "text" ||
              Checklist.getMetaForDataPath(dataPath).contentType ==
                "map regions"
            ) {
              names.push(
                categoryName +
                  " " +
                  _t("is_list_joiner") +
                  " " +
                  formatList(
                    itemObject[type][dataPath],
                    _t("or_list_joiner"),
                    "<strong>",
                    "</strong>"
                  )
              );
            } else if (
              Checklist.getMetaForDataPath(dataPath).contentType == "number"
            ) {
              let operation = itemObject[type][dataPath].o;
              let t1 = itemObject[type][dataPath].a;
              let t2 = itemObject[type][dataPath].b;

              names.push(
                Checklist.filter.numericFilterToHumanReadable(
                  dataPath,
                  operation,
                  t1,
                  t2,
                  "<strong>",
                  "</strong>"
                )
              );
            }
          });
        }
      });

      if (itemObject.hasOwnProperty("text") && itemObject.text.length > 0) {
        names.push(_t("text_is_list_joiner") + " " + itemObject.text);
      }

      return formatList(names);
    },
    isCurrentSearchPinned: function () {
      let current = Checklist.queryKey();
      let isCurrentPinned = false;

      this.getAll().forEach(function (pinnedItem) {
        if (JSON.stringify(pinnedItem) == current) {
          isCurrentPinned = true;
        }
      });

      return isCurrentPinned;
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

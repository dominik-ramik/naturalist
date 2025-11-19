import { _t, _tf } from "./model/I18n.js";
import { AppLayoutView, Toast } from "./view/AppLayoutView.js";
import { Checklist } from "./model/Checklist.js";
import { SearchView } from "./view/SearchView.js";
import { DetailsView } from "./view/DetailsView.js";
import { AboutView } from "./view/AboutView.js";
import { ManageView } from "./view/ManageView.js";
import { LiteratureView } from "./view/LiteratureView.js";
import { PinnedView } from "./view/PinnedView.js";
import { Settings } from "./model/Settings.js";
import { compressor, checklistURL } from "./components/Utils.js";

export let appVersion = ""; //will be loaded from SW

window.addEventListener("load", (event) => {
  registerSW();
  //console.log("Return to PWA mode uncomment previous line")
  runApp();
});

async function registerSW() {
  makeStoragePersistent();

  if ("serviceWorker" in navigator) {
    try {
      navigator.serviceWorker.register("./serviceworker.js");
      navigator.serviceWorker.ready.then((registration) => {
        openComChannel(registration.active);
        registration.active.postMessage({ type: "GET_VERSION" });
        checkForChecklistUpdate(registration.active);
        runApp();
      });
    } catch (e) {
      console.log("SW registration failed: " + e.message);
    }
  }
}

function makeStoragePersistent() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then((persistent) => {
      if (persistent) {
        console.log("Storage is persistent");
      } else {
        console.log("No persistency for storage granted by UA");
      }
    });
  }
}

const messageChannel = new MessageChannel();

function openComChannel(sw) {
  sw.postMessage({ type: "PORT_INITIALIZATION" }, [messageChannel.port2]);

  //Listen to messages
  messageChannel.port1.onmessage = function (message) {
    // Process message

    switch (message.data.type) {
      case "APP_UPDATED":
        console.log("App updated");
        alert("UPDATE");
        window.setTimeout(() => {
          location.reload();
        }, 200);
        break;

      case "CHECKLIST_UPDATED":
        console.log("Checklist data updated");
        if (message.data.updateMeta) {
          Settings.lastKnownDataVersion(message.data.updateMeta);
        }
        Toast.show(_t("checklist_data_updated"), {
          whenClosed: function () {
            window.location.href =
              window.location.origin + window.location.pathname;
          },
        });
        break;

      case "VERSION":
        console.log("Version " + message.data.version);
        appVersion = message.data.version;
        break;

      case "FETCHING_RESSOURCE_FAILED":
        console.log("FETCHING_RESSOURCE_FAILED");
        Toast.show(_t("offline_fetch_failed"));
        break;

      default:
        break;
    }
  };
}

const MAX_MANUAL_UPDATE_AGE_DAYS = 3;

function stripQuotes(str) {
  return (typeof str === "string" && str.startsWith('"') && str.endsWith('"'))
    ? str.slice(1, -1)
    : str;
}

function shouldUpdateChecklist({ lastModifiedString, etagString, meta }) {
  const cleanEtag = stripQuotes(etagString);

  // If Last-Modified was previously set but is now missing, treat as update and clear it
  if (meta.lastModified && (!lastModifiedString || lastModifiedString.trim() === "")) {
    return {
      update: true,
      newMeta: {
        lastModified: null,
        etag: cleanEtag || null,
        lastManualUpdate: null
      }
    };
  }

  // If ETag was previously set but is now missing, treat as update and clear it
  if (meta.etag && (!etagString || etagString.trim() === "")) {
    return {
      update: true,
      newMeta: {
        lastModified: lastModifiedString || null,
        etag: null,
        lastManualUpdate: null
      }
    };
  }

  // If Last-Modified is present and changed
  if (typeof lastModifiedString === "string" && lastModifiedString.trim() !== "") {
    if (meta.lastModified !== lastModifiedString) {
      return {
        update: true,
        newMeta: {
          lastModified: lastModifiedString,
          etag: cleanEtag ?? null,
          lastManualUpdate: null
        }
      };
    }
    // If Last-Modified is present and matches, do not use manual fallback
    return { update: false };
  }

  // If ETag is present and changed
  if (typeof etagString === "string" && etagString.trim() !== "") {
    if (meta.etag !== cleanEtag) {
      return {
        update: true,
        newMeta: {
          lastModified: null,
          etag: cleanEtag,
          lastManualUpdate: null
        }
      };
    }
    // If ETag is present and matches, do not use manual fallback
    return { update: false };
  }

  // Only if both are missing, use manual update fallback
  const now = Date.now();
  let lastManual = meta.lastManualUpdate;
  if (!lastManual || isNaN(lastManual)) lastManual = 0;
  const daysSince = (now - lastManual) / (1000 * 60 * 60 * 24);
  if (!meta.lastManualUpdate || daysSince >= MAX_MANUAL_UPDATE_AGE_DAYS) {
    return {
      update: true,
      newMeta: {
        lastModified: null,
        etag: null,
        lastManualUpdate: now
      }
    };
  }
  return { update: false };
}

export function checkForChecklistUpdate(sw) {
  var checkDataUpdate = new XMLHttpRequest();
  checkDataUpdate.open("HEAD", checklistURL, true);
  checkDataUpdate.onreadystatechange = function () {
    if (checkDataUpdate.readyState === 2) {
      if (checkDataUpdate.status === 200) {
        let lastModifiedString = checkDataUpdate.getResponseHeader("Last-Modified");
        let etagString = checkDataUpdate.getResponseHeader("ETag");
        let meta = Settings.lastKnownDataVersion();

        const result = shouldUpdateChecklist({ lastModifiedString, etagString, meta });

        if (result.update) {
          Settings.lastKnownDataVersion(result.newMeta);
          sw.postMessage({
            type: "UPDATE_CHECKLIST_DATA",
            updateMeta: result.newMeta
          });
        } else {
          // Neither Last-Modified nor ETag present or no update needed
          if (
            (!lastModifiedString || lastModifiedString.trim() === "") &&
            (!etagString || etagString.trim() === "")
          ) {
            console.log("No Last-Modified or ETag header received.");
            if (checkDataUpdate.getAllResponseHeaders) {
              console.log("checkDataUpdate headers:\n" + checkDataUpdate.getAllResponseHeaders());
            }
          }
          //something failed, just get the cached version
          return;
        }
      } else {
        console.log("XHR status error: " + checkDataUpdate.status);
        //something failed, just get the cached vesion
      }
    }
  };
  checkDataUpdate.onerror = function (e) {
    console.log("Error trying to get checklist update: ", e);
  };
  checkDataUpdate.send();
}

Handlebars.registerHelper("ifeq", function (arg1, arg2, options) {
  return arg1 == arg2 ? options.fn(this) : options.inverse(this);
});

function runApp() {

  m.request({
    method: "GET",
    url: checklistURL,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      Accept: "*/*",
    },
    extract: function (xhr) {
      if (xhr.status != 200) {
        return null;
      }

      let parsed = "";
      try {
        parsed = JSON.parse(compressor.decompress(xhr.responseText));
        console.log(parsed);
      } catch (ex) {
        console.log("Error parsing: ", ex);
      }
      return parsed;
    },
  }).then(function (checklistData) {

    window.setTimeout(function () {
      if (checklistData) {
        Checklist.loadData(checklistData, false);
      }

      let w = document.documentElement.clientWidth;
      let h = document.documentElement.clientHeight;
      if (w > 1024 || (w > 800 && w > h)) {
        AppLayoutView.mode = "desktop";
      } else {
        AppLayoutView.mode = "mobile";
      }

      readyPreloadableAssets();

      function onMatchGuard() {
        if (!isDataReady(checklistData)) m.route.set("/manage");
        if (
          !Settings.alreadyViewedAboutSection() &&
          Checklist.getProjectAbout()?.trim() != ""
        ) {
          m.route.set("/about/checklist");
        }

        Settings.alreadyViewedAboutSection(true);
      }

      m.route(document.body, "/checklist", {
        "/search": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [m(SearchView)]);
          },
          onmatch: onMatchGuard,
        },
        "/checklist": {
          render: function () {
            AppLayoutView.display = "checklist";
            return m(AppLayoutView, [m(SearchView)]);
          },
          onmatch: onMatchGuard,
        },
        "/details/:taxon/:tab": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [m(DetailsView)]);
          },
          onmatch: onMatchGuard,
        },
        "/about/checklist": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [
              m(AboutView, { text: Checklist.getProjectAbout() }),
            ]);
          },
          onmatch: onMatchGuard,
        },
        "/about/cite": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [
              m(AboutView, {
                text:
                  _tf("how_to_cite_header", [Checklist.getProjectName()]) +
                  "\n\n<p style='user-select: all'>" +
                  Checklist.getProjectHowToCite() +
                  " </p>",
              }),
            ]);
          },
          onmatch: onMatchGuard,
        },
        "/references": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [m(LiteratureView)]);
          },
          onmatch: onMatchGuard,
        },
        "/references/:citekey": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [m(LiteratureView)]);
          },
          onmatch: onMatchGuard,
        },
        "/pinned": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [m(PinnedView)]);
          },
          onmatch: onMatchGuard,
        },
        "/about/app": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [
              m(AboutView, { text: _t("about_app", appVersion) }),
            ]);
          },
          onmatch: onMatchGuard,
        },
        "/manage": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [m(ManageView)]);
          },
        },
      });
    }, 50);
  });
}

function isDataReady(checklistData) {
  return checklistData || Checklist._isDataReady;
}

function readyPreloadableAssets() {
  // Send asset URLs to service worker for caching
  const assets = Checklist.getPreloadableAssets();
  if (assets && assets.length > 0) {
    messageChannel.port1.postMessage({
      type: "CACHE_ASSETS",
      assets: assets
    });
  }
}
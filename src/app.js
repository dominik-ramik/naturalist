import m from "mithril"
import { registerSW } from 'virtual:pwa-register';
import Handlebars from "handlebars";
import "./styles/style.css";

import { t, tf, setLocale } from "./i18n/index.js";
import { AppLayoutView, Toast } from "./view/AppLayoutView.js";
import { Checklist } from "./model/Checklist.js";
import { SearchView } from "./view/SearchView.js";
import { DetailsView } from "./view/DetailsView.js";
import { AboutView } from "./view/AboutView.js";
import { ManageView } from "./view/ManageView.js";
import { LiteratureView } from "./view/LiteratureView.js";
import { SingleAccessKeyView } from "./view/SingleAccessKeyView.js";
import { PinnedView } from "./view/PinnedView.js";
import { Settings } from "./model/Settings.js";
import { compressor, checklistURL } from "./components/Utils.js";

export let appVersion = import.meta.env.VITE_APP_VERSION;

const messageChannel = new MessageChannel();

console.log("NaturaList version " + appVersion);

let hasCriticalError = false;

const updateServiceWorker = registerSW({
  immediate: false, // You can keep this false if you prefer
  onNeedRefresh() {
    // If the app has already crashed, do not wait for user input.
    // FORCE the update immediately to unbrick the client.
    if (hasCriticalError) {
      console.warn("App in critical state. Forcing Service Worker update...");
      updateServiceWorker(true); // Triggers SKIP_WAITING
      return;
    }

    // Standard behavior: Ask the user
    Toast.show(t("new_version_available"), {
      showPermanently: true,
      whenClosed: function () {
        updateServiceWorker(true);
      },
    });
  },
  onOfflineReady() {
    console.log("App ready to work offline");
  },
});

// --- EMERGENCY VALVE: Catch rendering crashes ---
function handleCriticalError(event) {
  hasCriticalError = true;
  console.error("CRITICAL APP FAILURE DETECTED:", event);

  // If an update is pending, apply it immediately to recover
  // We check if the SW is registered; registerSW exposes the update function
  if (updateServiceWorker) {
    // We force the check. If onNeedRefresh was already pending, 
    // calling this with true might not work directly depending on PWA plugin internals,
    // but usually, strictly calling updateServiceWorker(true) works if it's in 'waiting' state.
    updateServiceWorker(true);
  }
}

window.addEventListener("unhandledrejection", handleCriticalError);
window.addEventListener("error", handleCriticalError);

window.addEventListener("load", (event) => {
  // Remove the registerSW call from here, it is now at the top

  makeStoragePersistent();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      openComChannel(registration.active);
      checkForChecklistUpdate(registration.active);

      // Extra safety: If the controller changes (update applied), reload the page
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    });
  }

  runApp();
});

function makeStoragePersistent() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then((persistent) => {
      Settings._storagePersistent = persistent;
      if (persistent) {
        console.log("Storage is persistent");
      } else {
        console.log("No persistency for storage granted by UA");
      }
      m.redraw();
    });
  } else {
    Settings._storagePersistent = false;
  }
}
function openComChannel(sw) {
  sw.postMessage({ type: "PORT_INITIALIZATION" }, [messageChannel.port2]);

  //Listen to messages
  messageChannel.port1.onmessage = function (message) {
    // Process message

    switch (message.data.type) {
      case "PORT_INITIALIZED":
        break;

      case "CHECKLIST_UPDATED":
        console.log("Checklist data updated");
        if (message.data.updateMeta) {
          Settings.lastKnownDataVersion(message.data.updateMeta);
        }
        Toast.show(t("checklist_data_updated"), {
          whenClosed: function () {
            window.location.href =
              window.location.origin + window.location.pathname;
          },
        });
        break;

      case "FETCHING_RESSOURCE_FAILED":
        Toast.show(t("offline_fetch_failed"));
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
          // Neither Last-Modified nor ETag present or no update needed, just get the cached version
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
        if (import.meta.env.DEV) {
          console.log("Data:", parsed);
        }
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

      readyPreloadableAssets();
      
      function updateLanguage() {
        const lang = m.route.param("l");
        if (lang) {
          setLocale(lang);
        }
      }

      function onMatchGuard() {
        updateLanguage(); // Ensure language is set based on URL
        if (!isDataReady(checklistData)) m.route.set("/manage");
        if (
          !Settings.alreadyViewedAboutSection() &&
          Checklist.getProjectAbout()?.trim() != ""
        ) {
          Toast.show(t("show_about"), {
            timeout: 10000,
            actionLabel: t("open_about_page"),
            actionCallback: () => {
              m.route.set("/about/checklist");
            },
          });
        }

        Settings.alreadyViewedAboutSection(true);
      }

      m.route(document.body, "/checklist", {
        "/checklist": {
          render: function () {
            // AppLayoutView.display = "checklist"; // DELETE display setting
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
                  tf("how_to_cite_header", [Checklist.getProjectName()]) +
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
        "/single-access-keys": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [m(SingleAccessKeyView)]);
          },
          onmatch: onMatchGuard,
        },
        "/single-access-keys/filter/:taxon": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [m(SingleAccessKeyView)]);
          },
          onmatch: onMatchGuard,
        },
        "/single-access-keys/:key": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [m(SingleAccessKeyView)]);
          },
          onmatch: onMatchGuard,
        },
        "/single-access-keys/:key/:steps": {
          render: function () {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [m(SingleAccessKeyView)]);
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
            console.log("Rendering about app with version: " + appVersion);
            return m(AppLayoutView, [
              m(AboutView, { text: t("about_app", appVersion) }),
            ]);
          },
          onmatch: onMatchGuard,
        },
        "/manage": {
          onmatch: function () {
            // Redirect root /manage to the upload step
            m.route.set("/manage/upload", null, { replace: true });
          }
        },
        "/manage/:step": {
          render: function (vnode) {
            AppLayoutView.display = "details";
            return m(AppLayoutView, [m(ManageView, vnode.attrs)]);
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
  // Ensure checklist.json is always included
  const assets = ['./usercontent/data/checklist.json', ...Checklist.getPreloadableAssets()];

  if (assets && assets.length > 0) {
    messageChannel.port1.postMessage({
      type: "CACHE_ASSETS",
      assets: assets
    });
  }
}
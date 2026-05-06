import m from "mithril"
import { registerSW } from 'virtual:pwa-register';
import "./styles/style.css";

import { setLocale, loadLocales } from "./i18n/index.js";
import { deriveRequiredUiLocales, resolveUiLocaleForDataLang } from "./i18n/localeLoader.js";
import { t, tf } from 'virtual:i18n-self';
import { AppLayoutView, Toast } from "./view/AppLayoutView.js";
import { Checklist } from "./model/Checklist.js";
import { SearchView } from "./view/SearchView.js";
import { DetailsView } from "./view/DetailsView.js";
import { AboutView } from "./view/AboutView.js";
import { LiteratureView } from "./view/LiteratureView.js";
import { SingleAccessKeyView } from "./view/SingleAccessKeyView.js";
import { PinnedView } from "./view/PinnedView.js";
import { Settings } from "./model/Settings.js";
import { CacheManager, CacheScope } from "./model/CacheManager.js";
import { checklistURL, unitToHtml } from "./components/Utils.js";
import { validateActiveToolState, TOOL_REGISTRY, isProgrammaticRouteChange, clearProgrammaticRouteChange } from "./view/analysisTools/index.js";
import { compressor } from "./components/LZString.js";
import { ManageView, deepLinkProcessing, DEEP_LINK_STORAGE_KEY, DEMO_CHECKLIST_KEY } from "./view/ManageView.js";
import { registerHandlebarHelpers } from "./components/handlebarHelpers.js";
import { FullscreenManager } from "./components/FullscreenManager.js";

export let appVersion = import.meta.env.VITE_APP_VERSION;
export const DOCS_URL = "https://naturalist.netlify.app/";
export let isDemoMode = false;



let RenderTracker;
const TRACE_RENDERING = false; // Set to true to enable render tracking in development mode
const SHOULD_TRACE = import.meta.env.DEV && TRACE_RENDERING;
if (SHOULD_TRACE) {
  let burstCount = 0;
  let renderTimeout;

  RenderTracker = {
    view: function (vnode) {
      burstCount++;

      // Log the live count as it happens
      console.log(`[Render] VDOM evaluating... (${burstCount})`);

      // Clear the previous timer if a new render happens quickly
      clearTimeout(renderTimeout);

      // Set a new timer. If 200ms passes without another render, 
      // we consider the interaction "done" and reset.
      renderTimeout = setTimeout(() => {
        console.log(`%c--- Interaction Complete: ${burstCount} render(s) ---`, 'color: #4CAF50; font-weight: bold;');
        burstCount = 0; // Reset for the next interaction
      }, 1000);

      return vnode.children;
    }
  };
}

let syncRouteStateBeforeRender = null;
let lastAppliedDataLanguage = null;

function componentRender(component) {
  if (syncRouteStateBeforeRender) {
    syncRouteStateBeforeRender();
  }
  return SHOULD_TRACE ? m(RenderTracker, component) : component;
}

function hasDeepLinkParam() {
  // Hash-based routing: #!/manage/upload?xlsxUrl=...
  // Also check sessionStorage for the post-reload pass where the hash may have
  // been rewritten by the browser or Mithril and no longer contains xlsxUrl=.
  const hash = window.location.hash;
  const inHash = hash.includes("xlsxUrl=");
  const inStorage = !!sessionStorage.getItem("xlsxDeepLinkUrl");
  const result = inHash || inStorage;
  return result;
}

const messageChannel = new MessageChannel();

console.log("NaturaList version " + appVersion);

let hasCriticalError = false;
let appUpdatePending = false;
let checklistUpdateInFlight = false;

function hasPendingAppShellUpdate(registration = null) {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
    return false;
  }

  return appUpdatePending || !!registration?.installing || !!registration?.waiting;
}

const updateServiceWorker = registerSW({
  immediate: false, // You can keep this false if you prefer
  onNeedRefresh() {
    appUpdatePending = true;

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
      registration.addEventListener("updatefound", () => {
        if (navigator.serviceWorker.controller) {
          appUpdatePending = true;
        }
      });

      openComChannel(registration.active);
      checkForChecklistUpdate(registration.active, registration);

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        appUpdatePending = false;
        checklistUpdateInFlight = false;

        if (DOCS_URL.includes(window.location.hostname) || window.location.href.includes("localhost")) {
          const deepLinkHref = sessionStorage.getItem(DEEP_LINK_STORAGE_KEY + "_href");
          const deepLinkUrl = sessionStorage.getItem(DEEP_LINK_STORAGE_KEY);

          if (deepLinkHref && deepLinkUrl) {
            // Pipeline has not started yet - reload to original href so oninit can pick it up.
            window.location.href = deepLinkHref;
          } else if (deepLinkHref && !deepLinkUrl) {
            // oninit already consumed the URL - pipeline ran (or is running) - do NOT reload.
            sessionStorage.removeItem(DEEP_LINK_STORAGE_KEY + "_href"); // clean up the stale _href
          }
        }
        else {
          // Not on docs page - normal SW activation reload.
          console.log("[controllerchange] No deep-link pending. Normal reload.");
          window.location.reload();
        }
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
      // No m.redraw() here: this resolves before m.route() is called, so there
      // is no root mounted yet. Views that display this setting read it during
      // their own render cycle, which is always triggered after mount.
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
        checklistUpdateInFlight = false;
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

      case "CHECKLIST_UPDATE_FAILED":
        checklistUpdateInFlight = false;
        console.warn("Checklist data update failed; will retry on the next check.");
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

registerHandlebarHelpers();

function runApp() {

  // Demo-preview mode: if a compiled checklist was stored in sessionStorage by
  // the xlsxUrl deep-link pipeline, use it directly without hitting the network.
  const rawDemoData = sessionStorage.getItem(DEMO_CHECKLIST_KEY);

  if (rawDemoData) {
    let demoChecklistData = null;
    try {
      demoChecklistData = JSON.parse(compressor.decompress(rawDemoData));
      isDemoMode = true;
    } catch (e) {
      console.warn("Failed to parse demo checklist from sessionStorage, clearing.", e);
      sessionStorage.removeItem(DEMO_CHECKLIST_KEY);
    }

    if (isDemoMode) {
      window.setTimeout(async function () {
        if (demoChecklistData) {
          Checklist.loadData(demoChecklistData, false);
          const requiredLocales = deriveRequiredUiLocales(Checklist);
          await loadLocales(requiredLocales);
          setLocale(resolveUiLocaleForDataLang(Settings.language(), Checklist));
        }
        readyPreloadableAssets();
        setupRoutes();
      }, 50);
      return;
    }
  }

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

    window.setTimeout(async function () {
      if (checklistData) {
        Checklist.loadData(checklistData, false);
        const requiredLocales = deriveRequiredUiLocales(Checklist);
        await loadLocales(requiredLocales);
        setLocale(resolveUiLocaleForDataLang(Settings.language(), Checklist));
      }
      readyPreloadableAssets();
      setupRoutes();
    }, 50);
  });
}

function setupRoutes() {
  function updateLanguage() {
    // URL param takes priority, persists to localStorage as the data lang code
    const langParam = m.route.param("l");
    if (langParam && (!Checklist._isDataReady || Checklist.isLanguageAvailable(langParam))) {
      Settings.language(langParam);
    }

    // Resolve the stored data lang code to a UI locale before applying.
    // This handles cases where the data code differs from the UI locale code
    // (e.g. data lang "bislama" with fallbackUiLang "fr" → setLocale("fr")).
    let dataLang = Settings.language();
    if (Checklist._isDataReady && !Checklist.isLanguageAvailable(dataLang)) {
      dataLang = Checklist.ensureStoredLanguageIsAvailable();
    }
    if (dataLang && Checklist._isDataReady) {
      if (lastAppliedDataLanguage !== null && dataLang !== lastAppliedDataLanguage) {
        CacheManager.invalidate(CacheScope.LANGUAGE, "route-language-change");
      }
      lastAppliedDataLanguage = dataLang;
      setLocale(resolveUiLocaleForDataLang(dataLang, Checklist));
    } else if (dataLang) {
      if (lastAppliedDataLanguage !== null && dataLang !== lastAppliedDataLanguage) {
        CacheManager.invalidate(CacheScope.LANGUAGE, "route-language-change-before-data-ready");
      }
      lastAppliedDataLanguage = dataLang;
      // Checklist not yet loaded - set directly if it's a known UI locale,
      // full resolution will happen again after loadLocales() completes.
      setLocale(dataLang);
    }
  }

  function updateToolAndScope() {
    // When the route was changed programmatically (e.g. from the
    // ConfigurationDialog), Settings already hold the correct values.
    // m.route.param() would still return stale (pre-set) values at
    // this point, so skip the read-back to avoid reverting the change.
    if (isProgrammaticRouteChange()) {
      clearProgrammaticRouteChange();
      if (Checklist._isDataReady) {
        validateActiveToolState(Checklist.getData());
      }
      return;
    }

    const toolParam = m.route.param("v");
    const scopeParam = m.route.param("s");

    if (toolParam && TOOL_REGISTRY[toolParam]) {
      Settings.viewType(toolParam);
    }
    if (scopeParam && (scopeParam === "T" || scopeParam === "S")) {
      Settings.analyticalIntent(scopeParam);
    }

    if (Checklist._isDataReady) {
      validateActiveToolState(Checklist.getData());
    }
  }

  function onMatchGuard() {
    updateLanguage();
    updateToolAndScope();
    if (!Checklist._isDataReady && !deepLinkProcessing) {
      m.route.set("/manage");
    }
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

  syncRouteStateBeforeRender = updateLanguage;

  const initialRoute = hasDeepLinkParam() ? "/manage/upload" : "/checklist";

  FullscreenManager.init();

  m.route(document.body, initialRoute, {
    "/checklist": {
      render: function () {
        // AppLayoutView.display = "checklist"; // DELETE display setting
        return componentRender(m(AppLayoutView, [m(SearchView)]));
      },
      onmatch: onMatchGuard,
    },
    "/details/:taxon/:tab": {
      render: function () {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [m(DetailsView)]));
      },
      onmatch: onMatchGuard,
    },
    "/about/checklist": {
      render: function () {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [
          m(AboutView, { text: Checklist.getProjectAbout() }),
        ]));
      },
      onmatch: onMatchGuard,
    },
    "/about/cite": {
      render: function () {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [
          m(AboutView, {
            text:
              tf("how_to_cite_header", [Checklist.getProjectName()]) +
              "\n\n<p style='user-select: all'>" +
              Checklist.getProjectHowToCite() +
              " </p>",
          }),
        ]));
      },
      onmatch: onMatchGuard,
    },
    "/references": {
      render: function () {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [m(LiteratureView)]));
      },
      onmatch: onMatchGuard,
    },
    "/references/:citekey": {
      render: function () {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [m(LiteratureView)]));
      },
      onmatch: onMatchGuard,
    },
    "/single-access-keys": {
      render: function () {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [m(SingleAccessKeyView)]));
      },
      onmatch: onMatchGuard,
    },
    "/single-access-keys/filter/:taxon": {
      render: function () {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [m(SingleAccessKeyView)]));
      },
      onmatch: onMatchGuard,
    },
    "/single-access-keys/:key": {
      render: function () {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [m(SingleAccessKeyView)]));
      },
      onmatch: onMatchGuard,
    },
    "/single-access-keys/:key/:steps": {
      render: function () {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [m(SingleAccessKeyView)]));
      },
      onmatch: onMatchGuard,
    },
    "/pinned": {
      render: function () {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [m(PinnedView)]));
      },
      onmatch: onMatchGuard,
    },
    "/about/app": {
      render: function () {
        AppLayoutView.display = "details";
        console.log("Rendering about app with version: " + appVersion);
        return componentRender(m(AppLayoutView, [
          m(AboutView, { text: t("about_app", appVersion) }),
        ]));
      },
      onmatch: onMatchGuard,
    },
    "/manage": {
      onmatch: function () {
        // Redirect root /manage to the upload step, preserving all params (incl. l=)
        const params = m.route.param();
        m.route.set("/manage/upload", params, { replace: true });
      }
    },
    "/manage/:step": {
      render: function (vnode) {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [m(ManageView, vnode.attrs)]));
      },
      onmatch: onMatchGuard,
    },
  });
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

export function checkForChecklistUpdate(sw, knownRegistration = null) {
  if (!sw || checklistUpdateInFlight) {
    return;
  }

  let registrationPromise = Promise.resolve(knownRegistration);
  if (!knownRegistration && "serviceWorker" in navigator) {
    registrationPromise = navigator.serviceWorker.getRegistration().catch(() => null);
  }

  registrationPromise.then((registration) => {
    if (hasPendingAppShellUpdate(registration)) {
      console.log("Checklist update check deferred because an app update is already pending.");
      return;
    }

    var checkDataUpdate = new XMLHttpRequest();
    checkDataUpdate.open("HEAD", checklistURL, true);
    checkDataUpdate.onreadystatechange = function () {
      if (checkDataUpdate.readyState === 4) {
        if (checkDataUpdate.status === 200) {

          let lastModifiedString = checkDataUpdate.getResponseHeader("Last-Modified");
          let etagString = checkDataUpdate.getResponseHeader("ETag");
          let meta = Settings.lastKnownDataVersion();

          const result = shouldUpdateChecklist({ lastModifiedString, etagString, meta });

          if (result.update) {
            if (hasPendingAppShellUpdate(registration)) {
              console.log("Checklist refresh skipped because an app update started during the version check.");
              return;
            }

            checklistUpdateInFlight = true;
            try {
              sw.postMessage({
                type: "UPDATE_CHECKLIST_DATA",
                updateMeta: result.newMeta
              });
            } catch (error) {
              checklistUpdateInFlight = false;
              console.warn("Could not request checklist cache refresh from the service worker.", error);
            }
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
  });
}

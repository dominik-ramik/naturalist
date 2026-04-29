import m from "mithril"
import { registerSW } from 'virtual:pwa-register';
import "./styles/style.css";

import { setLocale } from "./i18n/index.js";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { AppLayoutView, Toast } from "./view/AppLayoutView.js";
import { Checklist } from "./model/Checklist.js";
import { SearchView } from "./view/SearchView.js";
import { DetailsView } from "./view/DetailsView.js";
import { AboutView } from "./view/AboutView.js";
import { LiteratureView } from "./view/LiteratureView.js";
import { SingleAccessKeyView } from "./view/SingleAccessKeyView.js";
import { PinnedView } from "./view/PinnedView.js";
import { Settings } from "./model/Settings.js";
import { checklistURL, unitToHtml } from "./components/Utils.js";
import { validateActiveToolState, TOOL_REGISTRY, isProgrammaticRouteChange, clearProgrammaticRouteChange } from "./view/analysisTools/index.js";
import { compressor } from "./components/LZString.js";
import { ManageView, deepLinkProcessing, DEEP_LINK_STORAGE_KEY } from "./view/ManageView.js";
import { registerHandlebarHelpers } from "./components/handlebarHelpers.js";
import { FullscreenManager } from "./components/FullscreenManager.js";

export let appVersion = import.meta.env.VITE_APP_VERSION;
export const DOCS_URL = "https://naturalist.netlify.app/";

registerMessages(selfKey, {
  en: {
    about_app: "# NaturaList\n\n## Flexible biodiversity data publishing\n\n![NaturaList logo](img/icon_transparent_blue.svg)\n\n**NaturaList** is a flexible taxonomic checklist and biodiversity data platform for publishing, exploring, and analysing biodiversity data. It supports both formal scientific and indigenous/folk taxonomies, handles everything from simple species lists to fully annotated occurrence catalogues, and comes with powerful filtering, search, and data visualisation tools.\n\n**NaturaList** doesn't come with a pre-defined structure you would have to fit your project into. Your taxonomy, your data fields, and the way they are displayed are all defined in a single spreadsheet - making it easy to set up, update, or extend your checklist without any IT expertise or complex software. Individual occurrence records can be attached to taxa, turning the app into a lightweight collection management tool where species-level and occurrence-level data coexist and can be explored independently.\n\nBeyond browsing the taxonomic tree, NaturaList lets you and your users explore the data through several analytical lenses: a bubble chart of taxonomic composition, a trait matrix for comparing attributes across taxa, a regional distribution map, and built-in identification keys that narrow the taxa in real time as choices are made.\n\nNaturaList is a progressive web app - it works in any browser and can be installed on any device (phone, tablet, laptop) to work fully offline, making it as useful in a remote field site as at a desk.\n\n**NaturaList** has been originally developed for the [Checklist of the vascular flora of Vanuatu](https://pvnh.net) under the **Plants mo Pipol blong Vanuatu** (Plants and People of Vanuatu) project.\n\n## Get NaturaList\n\nVisit [naturalist.netlify.app](https://naturalist.netlify.app/) for more details about NaturaList app including its latest version, a demo implementation and extensive documentation\n\n## How to cite the app\n\nD.M. Ramík. 2022. NaturaList, a flexible taxonomic checklist app. (version {0})\n\n## Contact the author\n\nDominik M. Ramík, web: [dominicweb.eu](https://dominicweb.eu), email: [dominik.ramik{'@'}seznam.cz](mailto:dominik.ramik{'@'}seznam.cz)",
    how_to_cite_header: "# {0}\n\n## How to cite",
    show_about: "Do you want to learn about this project?",
    open_about_page: "Open About page",
    new_version_available: "A new version of NaturaList is available. Click on this message to refresh the page and complete the update.",
    checklist_data_updated: "Project data updated",
    offline_fetch_failed: "Could not load some resources from the network. Are you offline?",
  },
  fr: {
    about_app: "# NaturaList\n\n## Plateforme flexible de publication de données sur la biodiversité\n\n![Logo de NaturaList](img/icon_transparent_blue.svg)\n\n**NaturaList** est une plateforme flexible de listes taxonomiques et de données sur la biodiversité pour publier, explorer et analyser les données sur la biodiversité. Elle prend en charge à la fois les taxonomies scientifiques formelles et les taxonomies indigènes/folk, gère tout, des simples listes d'espèces aux catalogues d'occurrences entièrement annotés, et est livrée avec des outils puissants de filtrage, de recherche et de visualisation des données.\n\n**NaturaList** ne vient pas avec une structure pré-définie dans laquelle vous devriez adapter votre projet. Votre taxonomie, vos champs de données et la façon dont ils sont affichés sont tous définis dans une seule feuille de calcul - ce qui facilite la configuration, la mise à jour ou l'extension de votre liste sans aucune expertise informatique ou logiciel complexe. Des enregistrements d'occurrence individuels peuvent être attachés à des taxa, transformant l'application en un outil de gestion de collection léger où les données au niveau de l'espèce et au niveau de l'occurrence coexistent et peuvent être explorées indépendamment.\n\nAu-delà de la navigation dans l'arbre taxonomique, NaturaList vous permet à vous et à vos utilisateurs d'explorer les données à travers plusieurs lentilles analytiques : un graphique à bulles de composition taxonomique, une matrice de traits pour comparer les attributs entre les taxa, une carte de distribution régionale, et des clés d'identification intégrées qui réduisent les taxa en temps réel à mesure que les choix sont faits.\n\nNaturaList est une application web progressive - elle fonctionne dans n'importe quel navigateur et peut être installée sur n'importe quel appareil (téléphone, tablette, ordinateur portable) pour fonctionner entièrement hors ligne, ce qui la rend aussi utile sur un site de terrain éloigné qu'à un bureau.\n\n**NaturaList** a été initialement développé pour le [Checklist of the vascular flora of Vanuatu](https://pvnh.net) dans le cadre du projet **Plants mo Pipol blong Vanuatu** (Plantes et Peuples du Vanuatu).\n\n## Obtenir NaturaList\n\nVisitez [naturalist.netlify.app](https://naturalist.netlify.app/) pour plus de détails sur l'application NaturaList, y compris sa dernière version, une implémentation de démonstration et une documentation complète\n\n## Comment citer l'application\n\nD.M. Ramík. 2022. NaturaList, une application de liste taxonomique flexible. (version {0})\n\n## Contacter l'auteur\n\nDominik M. Ramík, web : [dominicweb.eu](https://dominicweb.eu), email : [dominik.ramik{'@'}seznam.cz](mailto:dominik.ramik{'@'}seznam.cz)",
    how_to_cite_header: "# {0}\n\n## Comment citer",
    show_about: "Voulez-vous en savoir plus sur ce projet ?",
    open_about_page: "Ouvrir la page À propos",
    new_version_available: "Une nouvelle version de NaturaList est disponible. Cliquez sur ce message pour actualiser la page et compléter la mise à jour.",
    checklist_data_updated: "Données du projet mises à jour",
    offline_fetch_failed: "Impossible de charger certaines ressources depuis le réseau. Êtes-vous hors ligne ?",
  }
});

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

function componentRender(component) {
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
            // Redirect root /manage to the upload step
            m.route.set("/manage/upload", null, { replace: true });
          }
        },
        "/manage/:step": {
          render: function (vnode) {
            AppLayoutView.display = "details";
            return componentRender(m(AppLayoutView, [m(ManageView, vnode.attrs)]));
          },
        },
      });
    }, 50);
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
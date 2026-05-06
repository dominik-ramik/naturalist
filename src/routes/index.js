import m from "mithril";
import { setLocale } from "../i18n/index.js";
import { resolveUiLocaleForDataLang } from "../i18n/localeLoader.js";
import { t, tf } from 'virtual:i18n-self';
import { AppLayoutView, Toast } from "../view/AppLayoutView.js";
import { Checklist } from "../model/Checklist.js";
import { SearchView } from "../view/SearchView.js";
import { DetailsView } from "../view/DetailsView.js";
import { AboutView } from "../view/AboutView.js";
import { LiteratureView } from "../view/LiteratureView.js";
import { SingleAccessKeyView } from "../view/SingleAccessKeyView.js";
import { PinnedView } from "../view/PinnedView.js";
import { Settings } from "../model/Settings.js";
import { CacheManager, CacheScope } from "../model/CacheManager.js";
import { validateActiveToolState, TOOL_REGISTRY, isProgrammaticRouteChange, clearProgrammaticRouteChange } from "../view/analysisTools/index.js";
import { ManageView, deepLinkProcessing } from "../view/ManageView.js";
import { FullscreenManager } from "../components/FullscreenManager.js";

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

export function setupRoutes(appVersion) {
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

function onMatchGuard(attrs, requestedPath) {
    updateLanguage();
    updateToolAndScope();
    if (!Checklist._isDataReady && !deepLinkProcessing && !requestedPath.startsWith("/manage")) {
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

  const initialRoute = hasDeepLinkParam() ? "/manage" : "/checklist";

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
      render: function (vnode) {
        AppLayoutView.display = "details";
        return componentRender(m(AppLayoutView, [m(ManageView, vnode.attrs)]));
      },
      onmatch: onMatchGuard,
    },
  });
}

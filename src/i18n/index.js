import { createI18n } from 'vue-i18n';
import { AVAILABLE_LOCALES_INFO, DEFAULT_LOCALE_CODE } from './availableLocalesInfo';
import { bundleLoaders } from 'virtual:i18n-loaders';

// Static import: Vite inlines the entire default-locale bundle (shared +
// every .i18n/ component namespace) at build time into a synchronously
// available chunk.  By the time any other module's top-level code runs,
// index.js will have already populated the composer - making module-level
// t() calls safe for the default locale.
import _defaultBundle from 'virtual:i18n-bundle/en';

// ---------------------------------------------------------------------------
// Composer bootstrap
// ---------------------------------------------------------------------------

const i18n = createI18n({
  locale: DEFAULT_LOCALE_CODE,
  fallbackLocale: DEFAULT_LOCALE_CODE,
  messages: {},
  legacy: false,
  warnHtmlMessage: false,
  missingWarn: false,
  fallbackWarn: false,
});

const composer = i18n.global;

// ---------------------------------------------------------------------------
// Available locales - derived at build time from the files in ./locales/.
// Adding a new locale only requires dropping a JSON file there; no code change.
// Exported so app.js and localeLoader.js can import it without a separate file.
// ---------------------------------------------------------------------------

export const AVAILABLE_LOCALES = Object.keys(AVAILABLE_LOCALES_INFO);

// ---------------------------------------------------------------------------
// Loaded-locale registry
// ---------------------------------------------------------------------------

const _loadedLocales = new Set();

/** Returns the locale codes currently registered in the composer. */
export function getLoadedLocales() {
  return [..._loadedLocales];
}

// ---------------------------------------------------------------------------
// Internal bundle application helper
// ---------------------------------------------------------------------------

function _applyBundle(code, bundle) {
  composer.mergeLocaleMessage(code, bundle.shared);
  for (const [key, msgs] of Object.entries(bundle.components)) {
    composer.mergeLocaleMessage(code, { [key]: msgs });
  }
}

// ---------------------------------------------------------------------------
// Default locale: registered synchronously at module-evaluation time.
// Because this is a static import, JS guarantees _applyBundle runs before
// any importing module's own top-level code, so module-level t() calls
// in components always resolve correctly for the fallback locale.
// ---------------------------------------------------------------------------

_applyBundle(DEFAULT_LOCALE_CODE, _defaultBundle);
_loadedLocales.add(DEFAULT_LOCALE_CODE);

export const i18nReady = Promise.resolve();

// ---------------------------------------------------------------------------
// Locale loading - call once from app.js after the checklist resolves,
// passing the full derived set of required UI locale codes.
// DEFAULT_LOCALE_CODE is already loaded above and will be skipped (idempotent).
// ---------------------------------------------------------------------------

export async function loadLocales(localeCodes) {
  await Promise.all(localeCodes.map(async code => {
    if (_loadedLocales.has(code)) return;
    const loader = bundleLoaders[code];
    if (!loader) {
      console.warn(`[i18n] No locale bundle for: ${code}`);
    } else {
      const bundle = (await loader()).default;
      _applyBundle(code, bundle);
    }
    _loadedLocales.add(code);
  }));
}

// ---------------------------------------------------------------------------
// Locale switching
// ---------------------------------------------------------------------------

export function setLocale(lang) {
  if (_loadedLocales.has(lang)) {
    composer.locale.value = lang;
  } else {
    console.warn(`[i18n] setLocale: "${lang}" not loaded - using '${DEFAULT_LOCALE_CODE}'`);
    composer.locale.value = DEFAULT_LOCALE_CODE;
  }
}

// ---------------------------------------------------------------------------
// Per-module dictionary registration (called by the Vite plugin transform)
// ---------------------------------------------------------------------------

export function registerMessages(namespaceKey, messagesByLocale) {
  console.error(`[i18n] registerMessages called at runtime. Namespace: ${namespaceKey}`);
  if (
    typeof namespaceKey !== 'string' ||
    !namespaceKey ||
    namespaceKey === '__unknown__'
  ) {
    console.warn('[i18n] registerMessages: invalid or missing namespace key.');
    return;
  }
  Object.entries(messagesByLocale).forEach(([locale, messages]) => {
    composer.mergeLocaleMessage(locale, { [namespaceKey]: messages });
  });
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const i18nMetadata = {
  getDefaultTranslationLanguage: () => DEFAULT_LOCALE_CODE,
  getSupportedLanguageCodes:     () => AVAILABLE_LOCALES,
};

export { i18nMetadata as i18n };

// ---------------------------------------------------------------------------
// XSS sanitisation
// ---------------------------------------------------------------------------

const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPE_MAP[ch]);
}

// ---------------------------------------------------------------------------
// Key resolution - flat key first, then namespace-prefixed.
// ---------------------------------------------------------------------------

function resolveKey(tag, namespace) {
  // DEV guard: if this fires, a t() call is running before index.js has
  // initialised - most likely a circular import that delays this module.
  // In normal operation _loadedLocales is never empty here because the
  // default locale is registered synchronously above.
  if (import.meta.env.DEV && _loadedLocales.size === 0) {
    console.error(
      `[i18n] t("${tag}") called before any locale was loaded. ` +
      'This usually means a circular import is preventing index.js from ' +
      'initialising before the calling module runs.',
      new Error('i18n timing violation'),
    );
  }

  if (
    composer.te(tag, composer.locale.value) ||
    composer.te(tag, composer.fallbackLocale.value)
  ) return tag;

  if (namespace) {
    const nsTag = `${namespace}.${tag}`;
    if (
      composer.te(nsTag, composer.locale.value) ||
      composer.te(nsTag, composer.fallbackLocale.value)
    ) return nsTag;
  }

  return null;
}

// ---------------------------------------------------------------------------
// createLocalT - factory used by the Vite plugin.
// ---------------------------------------------------------------------------

export function createLocalT(namespace) {
  function localT(tag, substitute) {
    const resolved = resolveKey(tag, namespace);
    if (!resolved) {
      console.warn(`[i18n] Missing translation for: ${tag}${namespace ? ` (namespace: ${namespace})` : ''}`);
      return `[${tag}]`;
    }
    const args = substitute !== undefined && substitute !== null
      ? [resolved, substitute]
      : [resolved];
    return composer.t(...args);
  }

  function localTf(tag, substitute, usePlainTextOutput = false) {
    let params;
    if (substitute !== undefined && substitute !== null) {
      const wrap = value =>
        usePlainTextOutput ? value : `<strong>${escapeHtml(value)}</strong>`;
      if (Array.isArray(substitute))           params = substitute.map(wrap);
      else if (typeof substitute === 'object') params = Object.fromEntries(Object.entries(substitute).map(([k, v]) => [k, wrap(v)]));
      else                                     params = wrap(substitute);
    }
    return localT(tag, params);
  }

  return { t: localT, tf: localTf };
}

// ---------------------------------------------------------------------------
// Named global t/tf - flat keys from shared locale JSON only.
// ---------------------------------------------------------------------------

export const { t, tf } = createLocalT(null);

// ---------------------------------------------------------------------------
// Key existence check
// ---------------------------------------------------------------------------

export function te(tag, namespace) {
  return resolveKey(tag, namespace) !== null;
}
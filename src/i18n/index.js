import { createI18n } from 'vue-i18n';
import { AVAILABLE_LOCALES_INFO, DEFAULT_LOCALE_CODE } from './availableLocalesInfo';
import { bundleLoaders } from 'virtual:i18n-loaders';

// ---------------------------------------------------------------------------
// Composer bootstrap — no locale messages yet, loaded dynamically below.
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
// Available locales — derived at build time from the files in ./locales/.
// Adding a new locale only requires dropping a JSON file there; no code change.
// Exported so app.js and localeLoader.js can import it without a separate file.
// ---------------------------------------------------------------------------

export const AVAILABLE_LOCALES = Object.keys(AVAILABLE_LOCALES_INFO)

// ---------------------------------------------------------------------------
// Loaded-locale registry
// ---------------------------------------------------------------------------

const _loadedLocales = new Set();

/** Returns the locale codes currently registered in the composer. */
export function getLoadedLocales() {
  return [..._loadedLocales];
}

// ---------------------------------------------------------------------------
// Locale loading — all translations for a given locale (shared + all
// component namespaces) are inlined into a single virtual bundle per locale
// by vite-plugin-i18n-self.  One dynamic import → one chunk.
// Call once from app.js after the checklist is resolved, passing the full
// derived set of required UI locale codes (always includes DEFAULT_LOCALE_CODE).
// ---------------------------------------------------------------------------

export async function loadLocales(localeCodes) {
  await Promise.all(localeCodes.map(async code => {
    if (_loadedLocales.has(code)) return; // idempotent
    const loader = bundleLoaders[code];
    if (!loader) {
      console.warn(`[i18n] No locale bundle for: ${code}`);
    } else {
      const bundle = (await loader()).default;
      composer.mergeLocaleMessage(code, bundle.shared);
      for (const [key, msgs] of Object.entries(bundle.components)) {
        composer.mergeLocaleMessage(code, { [key]: msgs });
      }
    }
    _loadedLocales.add(code);
  }));
}

// ---------------------------------------------------------------------------
// English loads eagerly — must be present before the first render, before
// the checklist resolves, as it is the authoritative fallback locale.
// ---------------------------------------------------------------------------

export const i18nReady = loadLocales([DEFAULT_LOCALE_CODE]);

// ---------------------------------------------------------------------------
// Locale switching
// ---------------------------------------------------------------------------

export function setLocale(lang) {
  if (_loadedLocales.has(lang)) {
    composer.locale.value = lang;
  } else {
    console.warn(`[i18n] setLocale: "${lang}" not loaded — using '${DEFAULT_LOCALE_CODE}'`);
    composer.locale.value = DEFAULT_LOCALE_CODE;
  }
}

// ---------------------------------------------------------------------------
// Per-module dictionary registration (called by the Vite plugin transform)
// ---------------------------------------------------------------------------

export function registerMessages(namespaceKey, messagesByLocale) {
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
  getSupportedLanguageCodes:     () => [..._loadedLocales],
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
// Key resolution — flat key first, then namespace-prefixed.
// ---------------------------------------------------------------------------

function resolveKey(tag, namespace) {
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
// createLocalT — factory used by the Vite plugin.
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
      if (Array.isArray(substitute))       params = substitute.map(wrap);
      else if (typeof substitute === 'object') params = Object.fromEntries(Object.entries(substitute).map(([k, v]) => [k, wrap(v)]));
      else                                    params = wrap(substitute);
    }
    return localT(tag, params);
  }

  return { t: localT, tf: localTf };
}

// ---------------------------------------------------------------------------
// Named global t/tf — flat keys from shared locale JSON only.
// ---------------------------------------------------------------------------

export const { t, tf } = createLocalT(null);

// ---------------------------------------------------------------------------
// Key existence check
// ---------------------------------------------------------------------------

export function te(tag, namespace) {
  return resolveKey(tag, namespace) !== null;
}

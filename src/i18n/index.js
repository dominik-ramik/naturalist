import { createI18n } from 'vue-i18n';
import m from 'mithril';
import en from './locales/en.json';
import fr from './locales/fr.json';

const defaultLanguage = 'en';
const supportedLanguages = ['en', 'fr'];

let currentLang = (m.route.param('l') || defaultLanguage).toLowerCase();
if (!supportedLanguages.includes(currentLang)) {
  currentLang = defaultLanguage;
}

const i18n = createI18n({
  locale: currentLang,
  fallbackLocale: defaultLanguage,
  messages: { en, fr },
  legacy: false,
  warnHtmlMessage: false,
  missingWarn: false,
  fallbackWarn: false,
});

const composer = i18n.global;

// ---------------------------------------------------------------------------
// Locale switching
// ---------------------------------------------------------------------------

export function setLocale(lang) {
  if (supportedLanguages.includes(lang)) {
    composer.locale.value = lang;
  }
}

// ---------------------------------------------------------------------------
// Per-module dictionary registration
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
  getDefaultTranslationLanguage: () => defaultLanguage,
  getSupportedLanguageCodes:     () => supportedLanguages,
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
// Returns a { t, tf } pair bound to a namespace so components use flat keys.
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
      else                                 params = wrap(substitute);
    }
    return localT(tag, params);
  }

  return { t: localT, tf: localTf };
}

// ---------------------------------------------------------------------------
// Named global t/tf for modules that import directly from the i18n index
// (no namespace — flat keys from shared JSON only).
// ---------------------------------------------------------------------------

export const { t, tf } = createLocalT(null);
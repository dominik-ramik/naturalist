import { createI18n } from 'vue-i18n';
import m from 'mithril';
import en from './locales/en.json';
import fr from './locales/fr.json';

const defaultLanguage = "en";
const supportedLanguages = ["en", "fr"];

let currentLang = m.route.param("l") || defaultLanguage;
if (!supportedLanguages.includes(currentLang.toLowerCase())) {
  currentLang = defaultLanguage;
}

const i18n = createI18n({
  locale: currentLang,
  fallbackLocale: defaultLanguage,
  messages: {
    en: en,
    fr: fr
  },
  legacy: false, // Independent Composition API mode
  warnHtmlMessage: false
});

const composer = i18n.global;

export function setLocale(lang) {
    if (supportedLanguages.includes(lang)) {
        composer.locale.value = lang;
    }
}

// Metadata for manage view
export let i18nMetadata = {
  getDefaultTranslationLanguage: function () {
    return defaultLanguage;
  },
  getSupportedLanguageCodes: function () {
    return supportedLanguages;
  },
};
export { i18nMetadata as i18n };

/**
 * Main translation function
 */
export function t(tag, substitute) {
  // If substitute is a number, use pluralization API
  if (substitute !== undefined && substitute !== null && typeof substitute === 'number') {
    if (!composer.te(tag, composer.locale.value) && !composer.te(tag, composer.fallbackLocale.value)) {
      console.log("Missing translation for: " + tag);
      return "[" + tag + "]";
    }
    return composer.tc ? composer.tc(tag, substitute) : composer.t(tag, substitute);
  }

  let params = undefined;
  if (substitute !== undefined && substitute !== null) {
    params = Array.isArray(substitute) ? substitute : substitute;
  }

  // Logging for missing keys (optional, matches your old logic)
  if (!composer.te(tag, composer.locale.value) && !composer.te(tag, composer.fallbackLocale.value)) {
     console.log("Missing translation for: " + tag);
     return "[" + tag + "]";
  }

  return composer.t(tag, params);
}

/**
 * Formatted translation function
 * Preserves the logic of wrapping substitutes in <strong> tags
 */
export function tf(tag, substitute, usePlainTextOutput) {
  let params = undefined;
  if (substitute !== undefined && substitute !== null) {
    if (Array.isArray(substitute)) {
      params = substitute.map(s => usePlainTextOutput ? s : `<strong>${s}</strong>`);
    } else if (typeof substitute === 'object' && !(substitute instanceof Array)) {
      params = {};
      Object.keys(substitute).forEach(k => {
        params[k] = usePlainTextOutput ? substitute[k] : `<strong>${substitute[k]}</strong>`;
      });
    } else {
      params = usePlainTextOutput ? substitute : `<strong>${substitute}</strong>`;
    }
  }

  return t(tag, params);
}

window.t = t;
window.tf = tf;
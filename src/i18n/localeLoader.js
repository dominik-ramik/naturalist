import { DEFAULT_LOCALE_CODE } from './availableLocalesInfo.js';
import { AVAILABLE_LOCALES } from './index.js';

/**
 * Derives the complete set of UI locale codes that must be loaded to support
 * all language versions declared in the current checklist.
 *
 * For each data version:
 *   - DEFAULT_LOCALE_CODE is always included - it is the authoritative fallback
 *   - If the data version code matches an available UI locale → include it
 *   - Otherwise use its fallbackUiLang if that matches an available UI locale
 *   - If neither matches → DEFAULT_LOCALE_CODE covers it, nothing extra added
 */
export function deriveRequiredUiLocales(checklist) {
  const required = new Set([DEFAULT_LOCALE_CODE]);

  checklist.getAllLanguages().forEach(({ code, fallbackUiLang }) => {
    const normalized = code.toLowerCase();
    if (AVAILABLE_LOCALES.includes(normalized)) {
      required.add(normalized);
    } else if (fallbackUiLang && AVAILABLE_LOCALES.includes(fallbackUiLang.toLowerCase())) {
      required.add(fallbackUiLang.toLowerCase());
    }
    // else: no UI translation for this version - DEFAULT_LOCALE_CODE fallback covers it
  });

  return [...required];
}

/**
 * Resolves the UI locale code for a single data language code.
 * Mirrors deriveRequiredUiLocales() but for one version at a time -
 * used when applying the active language after loadLocales() completes.
 */
export function resolveUiLocaleForDataLang(dataLangCode, checklist) {
  if (!dataLangCode) return DEFAULT_LOCALE_CODE;

  const normalized = dataLangCode.toLowerCase();

  if (AVAILABLE_LOCALES.includes(normalized)) {
    return normalized;
  }

  const version = checklist.getAllLanguages()
    .find(({ code }) => code.toLowerCase() === normalized);

  if (version?.fallbackUiLang) {
    const fb = version.fallbackUiLang.toLowerCase();
    if (AVAILABLE_LOCALES.includes(fb)) return fb;
  }

  return DEFAULT_LOCALE_CODE;
}
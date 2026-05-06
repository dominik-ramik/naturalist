import { t } from 'virtual:i18n-self';
import { textLowerCaseAccentless } from "../components/Utils.js";
import { CacheManager, CacheScope } from "./CacheManager.js";

export const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const MONTH_COUNT = MONTH_KEYS.length;

function isUsableMonthName(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isValidMonthNamesArray(value) {
  return (
    Array.isArray(value) &&
    value.length === MONTH_COUNT &&
    value.every(isUsableMonthName)
  );
}

function normalizeMonthAlias(value) {
  return textLowerCaseAccentless(String(value ?? "")).replace(/[^\p{L}\p{N}]+/gu, "");
}

function uniqueValues(values) {
  return [...new Set(values)];
}

function trimmedMonthNames(names) {
  return names.map((name) => name.trim());
}

export function getMonthNumbers() {
  return Array.from({ length: MONTH_COUNT }, (_, index) => index + 1);
}

let _fallbackCache = null;
let _fallbackCacheCanary = null;

export function getFallbackMonthNames() {
  const canary = t('months.jan');
  if (_fallbackCache !== null && _fallbackCacheCanary === canary) {
    return [..._fallbackCache];
  }
  _fallbackCache = MONTH_KEYS.map(key => t(`months.${key}`));
  _fallbackCacheCanary = canary;
  return [..._fallbackCache];
}

export function validateConfiguredMonthNames(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return {
      hasValue: false,
      names: null,
      splitNames: [],
      wrongCount: false,
      duplicates: [],
    };
  }

  const splitNames = rawValue.split(",").map((name) => name.trim());
  const wrongCount =
    splitNames.length !== MONTH_COUNT || splitNames.some((name) => name === "");

  const seen = new Map();
  const duplicates = [];

  splitNames.forEach((name) => {
    const key = normalizeMonthAlias(name) || textLowerCaseAccentless(name);
    if (!key) {
      return;
    }

    if (seen.has(key)) {
      duplicates.push(seen.get(key), name);
      return;
    }

    seen.set(key, name);
  });

  return {
    hasValue: true,
    names:
      !wrongCount && duplicates.length === 0 ? trimmedMonthNames(splitNames) : null,
    splitNames,
    wrongCount,
    duplicates: uniqueValues(duplicates),
  };
}

export function resolveMonthNames(monthNamesOrRawValue) {
  if (isValidMonthNamesArray(monthNamesOrRawValue)) {
    return trimmedMonthNames(monthNamesOrRawValue);
  }

  const validation = validateConfiguredMonthNames(monthNamesOrRawValue);
  return validation.names ?? getFallbackMonthNames();
}

function normalizedPrefix(name, length) {
  const trimmed = name.trim();
  const prefix = trimmed.slice(0, length);
  return normalizeMonthAlias(prefix) || normalizeMonthAlias(trimmed);
}

const _shortNamesCache = new Map();

export function clearMonthNameCaches() {
  _fallbackCache = null;
  _fallbackCacheCanary = null;
  _shortNamesCache.clear();
}

export function deriveShortMonthNames(monthNamesOrRawValue) {
  const canary = t('months.jan');
  const inputKey = Array.isArray(monthNamesOrRawValue)
    ? monthNamesOrRawValue.join('\0')
    : String(monthNamesOrRawValue ?? '');
  const cacheKey = `${inputKey}|${canary}`;
  if (_shortNamesCache.has(cacheKey)) {
    return _shortNamesCache.get(cacheKey);
  }

  const fullNames = resolveMonthNames(monthNamesOrRawValue);
  const prefixLengths = fullNames.map((name) => Math.min(3, name.trim().length));

  let keepResolving = true;

  while (keepResolving) {
    keepResolving = false;

    const groups = new Map();

    fullNames.forEach((name, index) => {
      const key = normalizedPrefix(name, prefixLengths[index]);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(index);
    });

    groups.forEach((indices) => {
      if (indices.length < 2) {
        return;
      }

      indices.forEach((index) => {
        const trimmed = fullNames[index].trim();
        if (prefixLengths[index] < trimmed.length) {
          prefixLengths[index] += 1;
          keepResolving = true;
        }
      });
    });
  }

  const result = fullNames.map((name, index) => name.trim().slice(0, prefixLengths[index]));
  _shortNamesCache.set(cacheKey, result);
  return result;
}

export function getMonthLabel(monthNumber, monthNamesOrRawValue) {
  const monthNames = resolveMonthNames(monthNamesOrRawValue);
  const monthIndex = Number(monthNumber) - 1;

  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex >= MONTH_COUNT) {
    return String(monthNumber);
  }

  return monthNames[monthIndex];
}

export function getShortMonthLabel(monthNumber, monthNamesOrRawValue) {
  const monthNames = deriveShortMonthNames(monthNamesOrRawValue);
  const monthIndex = Number(monthNumber) - 1;

  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex >= MONTH_COUNT) {
    return String(monthNumber);
  }

  return monthNames[monthIndex];
}

CacheManager.subscribe("model.MonthNames", {
  scopes: [CacheScope.DATASET, CacheScope.LANGUAGE],
  description: "Fallback and derived month labels from active UI locale and checklist configuration.",
  clear: clearMonthNameCaches,
});

import en from "../i18n/locales/en.json";
import { textLowerCaseAccentless } from "../components/Utils.js";

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
const FALLBACK_MONTH_NAMES = MONTH_KEYS.map((key) => en.months?.[key] || key);

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

export function getFallbackMonthNames() {
  return [...FALLBACK_MONTH_NAMES];
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

export function deriveShortMonthNames(monthNamesOrRawValue) {
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

  return fullNames.map((name, index) => name.trim().slice(0, prefixLengths[index]));
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

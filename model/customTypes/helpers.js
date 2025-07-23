import { nlDataStructure } from "../DataManagerData.js";
import { dataPath } from "../DataPath.js";

const data = nlDataStructure;

export const helpers = {
  dataCodesCache: new Map(),
  
  purifyCssString: function (css) {
    if (css.indexOf('"') >= 0) {
      css = css.substring(0, css.indexOf('"'));
    }
    if (css.indexOf("'") >= 0) {
      css = css.substring(0, css.indexOf("'"));
    }
    if (css.indexOf(";") >= 0) {
      css = css.substring(0, css.indexOf(";"));
    }
    if (css.indexOf(":") >= 0) {
      css = css.substring(0, css.indexOf(":"));
    }
    return css;
  },
  
  getDataCodeValue: function (currentDataPath, value, langCode) {
    const dataCodes = data.sheets.appearance.tables.dataCodes.data;

    // Early return for empty/null values
    if (!value || value === "") return value;

    // Create cache key
    const cacheKey = `${currentDataPath}|${value}|${langCode}`;
    
    // Check cache first
    if (this.dataCodesCache.has(cacheKey)) {
      return this.dataCodesCache.get(cacheKey);
    }

    // Check if we have data codes for this language
    if (!dataCodes[langCode]) {
      this.dataCodesCache.set(cacheKey, value);
      return value;
    }

    // Normalize the data path to match the format used in data codes
    const normalizedPath = dataPath.modify.itemNumbersToHash(currentDataPath).toLowerCase();

    // Find matching data code entry
    const matchingEntry = dataCodes[langCode].find((entry) => {
      const entryColumnName = entry.columnName.toLowerCase();
      return entryColumnName === normalizedPath && entry.code === value;
    });

    let result;
    if (matchingEntry) {
      result = matchingEntry.replacement;
    } else {
      // Check if we have any codes for this column at all
      const hasCodesForColumn = dataCodes[langCode].some((entry) => {
        const entryColumnName = entry.columnName.toLowerCase();
        return entryColumnName === normalizedPath;
      });

      if (hasCodesForColumn) {
        // Only warn if we have codes for this column but not this specific value
        Logger.warning(
          "Code '" +
            value +
            "' found in column '" +
            currentDataPath +
            "' but no correspondence found in sheet 'nl_appearance' in table 'Data codes'"
        );
      }

      result = value;
    }

    // Cache the result before returning
    this.dataCodesCache.set(cacheKey, result);
    return result;
  },
  processPossibleDataCode: function (currentDataPath, value, langCode) {
    return this.getDataCodeValue(currentDataPath, value, langCode);
  },
};
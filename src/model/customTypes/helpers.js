import { nlDataStructure } from "../DataManagerData.js";
import { dataPath } from "../DataPath.js";
import { Checklist } from "../Checklist.js";

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
  
  /**
   * Process template if available for the given data and context
   * @param {any} data - The data to process with template
   * @param {Object} uiContext - UI context containing meta, dataPath, originalData, taxon
   * @returns {any} Processed data or original data if no template
   */
  processTemplate: function(data, uiContext) {
    if (
      uiContext.meta.template && 
      uiContext.meta.template !== "" &&
      Checklist.handlebarsTemplates[uiContext.dataPath]
    ) {
      let templateData = Checklist.getDataObjectForHandlebars(
        data,
        uiContext.originalData,
        uiContext.taxon.name,
        uiContext.taxon.authority
      );
      return Checklist.handlebarsTemplates[uiContext.dataPath](templateData);
    }
    return data;
  },

  /**
   * Extract plain text from markdown for search indexing.
   * Keeps only link text, alt-text from images, strips formatting syntax.
   * @param {string} markdown - Markdown string
   * @returns {string} Plain text suitable for search
   */
  extractSearchableTextFromMarkdown: function(markdown) {
    if (!markdown || typeof markdown !== "string") return "";
    
    let text = markdown;
    
    // Extract alt text from images: ![alt](url) -> alt
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    
    // Extract link text from links: [text](url) -> text
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    
    // Remove inline code: `code` -> code
    text = text.replace(/`([^`]*)`/g, '$1');
    
    // Remove bold: **text** or __text__ -> text
    text = text.replace(/\*\*([^*]*)\*\*/g, '$1');
    text = text.replace(/__([^_]*)__/g, '$1');
    
    // Remove italic: *text* or _text_ -> text
    text = text.replace(/\*([^*]*)\*/g, '$1');
    text = text.replace(/_([^_]*)_/g, '$1');
    
    // Remove strikethrough: ~~text~~ -> text
    text = text.replace(/~~([^~]*)~~/g, '$1');
    
    // Remove headers: # Header -> Header
    text = text.replace(/^#+\s*/gm, '');
    
    // Remove blockquotes: > text -> text
    text = text.replace(/^>\s*/gm, '');
    
    // Remove horizontal rules
    text = text.replace(/^[-*_]{3,}$/gm, '');
    
    // Remove list markers: - item or * item or 1. item -> item
    text = text.replace(/^[\s]*[-*+]\s+/gm, '');
    text = text.replace(/^[\s]*\d+\.\s+/gm, '');
    
    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }
};
import { nlDataStructure } from "../DataManagerData.js";
import { dataPath } from "../DataPath.js";
import { Checklist } from "../Checklist.js";
import { relativeToUsercontent } from "../../components/Utils.js";

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
  processTemplate: function(data, uiContext, additionalParams = {}) {
    const compiledTemplate =
      uiContext?.compiledTemplate || Checklist.handlebarsTemplates?.[uiContext?.dataPath];

    if (
      uiContext?.meta?.template &&
      uiContext.meta.template !== "" &&
      compiledTemplate
    ) {
      let templateData = Checklist.getDataObjectForHandlebars(
        data,
        uiContext.originalData,
        uiContext.taxon.name,
        uiContext.taxon.authority,
        additionalParams
      );
      return compiledTemplate(templateData);
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
  },

  /**
   * Resolve a media source path to its final URL, applying Handlebars template
   * substitution (if configured) and then resolving it relative to the
   * usercontent folder.
   *
   * This is the canonical pipeline shared by all media custom types (image,
   * sound, map).  Call it early in a `render` function, right after extracting
   * the raw `source` string from the data object.
   *
   * Processing steps, in order:
   *   1. **Template substitution** – if `uiContext.meta.template` is a
   *      non-empty string and a compiled Handlebars template is available
   *      (either via `uiContext.compiledTemplate` or
   *      `Checklist.handlebarsTemplates[uiContext.dataPath]`), the source
   *      string is passed through that template.  The template receives the
   *      full data object, original row data, and taxon metadata so that
   *      dynamic path segments (e.g. `{{name}}`) can be resolved at render
   *      time.
   *   2. **Usercontent resolution** – the resulting string is converted to a
   *      path relative to the application's usercontent base directory via
   *      `relativeToUsercontent`, making it safe to use as an `src` / `href`
   *      attribute regardless of where the app is hosted.
   *
   * @param {string} source - Raw source value read from the data row.  May be
   *   a plain relative path (e.g. `"images/frog.jpg"`), an absolute URL, or a
   *   Handlebars template string (e.g. `"sounds/{{name}}.mp3"`) when
   *   `uiContext.meta.template` is set.
   *
   * @param {Object} uiContext - UI rendering context passed down from the view.
   *   @param {Function}  [uiContext.compiledTemplate] - Pre-compiled Handlebars
   *     template function.  When present it takes priority over the global
   *     `Checklist.handlebarsTemplates` lookup.
   *   @param {string}    [uiContext.dataPath] - The column/data-path key used
   *     to look up a pre-compiled template in `Checklist.handlebarsTemplates`
   *     when `uiContext.compiledTemplate` is absent.
   *   @param {Object}    [uiContext.meta] - Column metadata object.
   *   @param {string}    [uiContext.meta.template] - Raw Handlebars template
   *     string declared in the spreadsheet column definition.  Template
   *     substitution is only performed when this is a non-empty string and a
   *     compiled template is available.
   *   @param {Object}    [uiContext.originalData] - The full data row (taxon
   *     record) for the currently rendered item.  Passed as context to the
   *     Handlebars template so that per-row field values can be referenced.
   *   @param {Object}    [uiContext.taxon] - Taxon descriptor object.
   *   @param {string}    [uiContext.taxon.name] - Scientific name of the taxon.
   *   @param {string}    [uiContext.taxon.authority] - Taxonomic authority.
   *   @param {string}    [uiContext.placement] - Where the component is being
   *     rendered, e.g. `"details"` (details panel) or `"list"` (checklist
   *     row).  Not used by this function but present in the same context
   *     object.
   *   @param {RegExp|null} [uiContext.highlightRegex] - Search-term highlight
   *     regex.  Not used by this function but present in the same context
   *     object.
   *
   * @returns {string} The fully resolved source URL ready for use in `src` /
   *   `href` attributes.
   */
  processSource: function (source, uiContext) {
    source = this.processTemplate(source, uiContext);
    source = relativeToUsercontent(source);
    return source;
  },
};

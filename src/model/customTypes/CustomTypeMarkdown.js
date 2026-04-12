import m from "mithril";
import { helpers } from "./helpers.js";
import { processMarkdownWithBibliography } from "../../components/Utils.js";
import { filterPluginText } from "../filterPlugins/filterPluginText.js";

export let customTypeMarkdown = {
  dataType: "markdown",
  
  meta: {
    summary: "Markdown-formatted rich text. Renders headings, bold, italic, lists, links, images, blockquotes, code, and bibliography `@citekey` references.",
    whenToUse: "Long descriptions, field notes, habitat descriptions, species accounts — any text requiring rich formatting or external links.",
    behaviorFulltextIndexing: "Markdown syntax is stripped and plain text is indexed. Link text and image alt-text are preserved; formatting markers are removed.",
    detailsPaneTab: "Text",
    inputFormats: [
      {
        label: "Single cell — inline Markdown",
        syntax: "Any valid Markdown string. Bibliography `@citekey` references and database shortcodes `@code:ID` are also processed.",
        example: { columns: ["description"], rows: [["A **large** green tree frog. See [@smith2020]."], ["F:species_notes/litoria.md"]] },
      },
      {
        label: "F-directive (external file)",
        syntax: "`F:path/to/file.md` — the file is fetched from `usercontent/` at compile time and its content is substituted.",
        example: null,
      },
    ],
    notes: [
      {
        type: "tip",
        text: "For very long texts or content reused across many taxa, store the Markdown in a separate file in `usercontent/` and reference it with `F:filename.md`. Set placement to `details` for encyclopaedia-style species articles. See [External Markdown Files](/author-guide/external-markdown).",
      },
    ],
  },
  
  filterPlugin: filterPluginText,

  readData: function (context, computedPath) {
    const { headers, row, langCode } = context;
    let columnIndex = headers.indexOf(computedPath.toLowerCase());

    if (columnIndex < 0) {
      columnIndex = headers.indexOf(
        computedPath.toLowerCase() + ":" + langCode
      );
    }

    if (columnIndex < 0 || row[columnIndex] === undefined) {
      return null;
    }

    let value = row[columnIndex].toString().trim();

    if (value === "") {
      return null;
    }

    return value;
  },

  /**
   * Extract searchable text from markdown data
   * @param {any} data - The markdown string
   * @param {Object} uiContext - UI context (optional)
   * @returns {string[]} Array of searchable strings
   */
  getSearchableText: function (data, uiContext) {
    if (!data || typeof data !== "string") return [];
    return [helpers.extractSearchableTextFromMarkdown(data)];
  },

  render: function (data, uiContext) {
    if (!data || data.toString().trim() === "") {
      return null;
    }

    if (typeof data !== "string") {
      //console.log("Warning: readerMarkdown received non-string data:", data);
      return data;
    }

    // Apply template if available
    let displayData = helpers.processTemplate(data, uiContext);

    // Process markdown
    const htmlContent = processMarkdownWithBibliography(displayData);

    return m("span", m.trust(htmlContent));
  },
};

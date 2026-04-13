// src/model/customTypes/CustomTypeMarkdown.meta.js
import { filterMetaText } from "./filterMeta.js";

export const customTypeMarkdownMeta = {
  dataType:   "markdown",
  filterMeta: filterMetaText,
  meta: {
    summary:                  "Markdown-formatted rich text. Renders headings, bold, italic, lists, links, images, blockquotes, code, and bibliography `@citekey` references.",
    whenToUse:                "Long descriptions, field notes, habitat descriptions, species accounts — any text requiring rich formatting or external links.",
    behaviorFulltextIndexing: "Markdown syntax is stripped and plain text is indexed. Link text and image alt-text are preserved; formatting markers are removed.",
    detailsPaneTab:           "Text",
    inputFormats: [
      {
        label:  "Single cell — inline Markdown",
        syntax: "Any valid Markdown string. Bibliography `@citekey` references and database shortcodes `@code:ID` are also processed.",
        example: { columns: ["description"], rows: [["A **large** green tree frog. See [@smith2020]."], ["F:species_notes/litoria.md"]] },
      },
      {
        label:  "F-directive (external file)",
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
};

// src/model/customTypes/CustomTypeMarkdown.meta.js
import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";

export const customTypeMarkdownMeta = {
  dataType: "markdown",
  filterMeta: null,
  meta: {
    summary: "[Markdown](https://en.wikipedia.org/wiki/Markdown)-formatted rich text. Renders headings, bold, italic, lists, links, images, blockquotes, code, and bibliography `@citekey` references. See Markdown syntax guide at [commonmark.org](https://commonmark.org/help/).",
    whenToUse: "Long descriptions, field notes, habitat descriptions, species accounts - any text requiring rich formatting or external links.",
    behaviorFulltextIndexing: "Markdown syntax is stripped and plain text is indexed.",
    dwcNotes: {
      output: "Rendered text (without HTML markup). [[ref:content.bibliography]] `@citekey` references are resolved to their citation text and so are [[ref:content.databaseShortcodes]]. E.g. markdown string: <code>A **large** beetle reported on [EntomoSmith](http://smith.example) and published in [@smith2020].</code> renders to **A large beetle reported on EntomoSmith and published in (Smith et al. 2020).** in the DwC output.",
      subPaths: [
        {suffix: "", label: "rendered plain text"},
      ]
    },
    detailsPaneTab: "Text",
    inputFormats: [
      {
        label: "Single cell - inline Markdown",
        syntax: "Any valid Markdown string. Bibliography `@citekey` references (see [[ref:content.bibliography]]) and database shortcodes `@code:ID` (see [[ref:content.databaseShortcodes]]) are also processed.",
        example: {
          columns: ["description", "[comment]"], rows: [
            ["A \*\*large\*\* green tree frog. See [@smith2020].", "This renders: A **large** green tree frog. See [(Smith et al. 2020)](#)."],
            ["F:species_accounts/litoria.md", "This renders the content of `usercontent/species_accounts/litoria.md` at compile time."],]
        },
      },
      {
        label: "F: directive (external file)",
        syntax: "`F:path/to/file.md` - the file is fetched from `usercontent/` at compile time and its content is substituted.",
        example: null,
      },
    ],
    notes: [
      {
        type: "tip",
        text: "For very long texts or content reused across many taxa, store the Markdown in a separate file in `usercontent/` and reference it with `F: directive`. Set placement to `details` for encyclopaedia-style species articles that would otherwise clutter the taxon card. See [External text files](./external-text-files).",
      },
    ],
  },
};

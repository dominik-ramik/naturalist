// src/model/customTypes/CustomTypeSound.meta.js
import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";

export const customTypeSoundMeta = {
  dataType: "sound",
  filterMeta: filterMetaText,
  meta: {
    summary: "An audio file, rendered as a minimal inline audio player with a play button and title.",
    whenToUse: "Bird calls, animal vocalisations, insect sounds, or any audio recording associated.",
    behaviorFulltextIndexing: "The sound title is indexed for full-text search.",
    dwcNotes: {
      output: "not accessible through column names, use `media:` directive in DwC export for media files, see [[ref:content.dwcArchive.valueSource]]",
      subPaths: []
    },
    detailsPaneTab: "Media",
    inputFormats: [
      {
        label: "Two columns (source + title)",
        syntax: "`[columnname].source` and `[columnname].title` as separate columns.",
        example: { columns: ["call.source", "call.title"], rows: [["sounds/litoria_call.mp3", "Advertisement call"]] },
      },
      {
        label: "Single column - pipe-separated",
        syntax: "`source|title` in one cell.",
        example: { columns: ["call"], rows: [["sounds/litoria_call.mp3|Advertisement call"]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "Supported formats are whatever the user's browser supports natively - typically MP3, OGG, WAV, AAC. Use a **Template** such as `sounds/{{value}}.mp3` to enter only the base filename in each cell and avoid repeating a shared directory path (see [[ref:content.customDataDefinition.template]] column).",
      },
    ],
  },
};

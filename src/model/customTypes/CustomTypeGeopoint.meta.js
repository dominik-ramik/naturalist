// src/model/customTypes/CustomTypeGeopoint.meta.js

export const customTypeGeopointMeta = {
  dataType:   "geopoint",
  filterMeta: null,
  meta: {
    summary:                  "A geographic point coordinate (latitude/longitude). Rendered as a clickable link showing the original coordinate text; clicking opens a configurable online map URL (external page) at those coordinates.",
    whenToUse:                "Collection localities, observation coordinates, occurrence origins - any geographic point coordinate that users should open on an online map.",
    behaviorFulltextIndexing: "Geographic coordinates are not indexed for full-text search.",
    detailsPaneTab:           null,
    inputFormats: [
      {
        label:  "Format 1: Two columns (.lat and .long)",
        syntax: "`[columnname].lat` and `[columnname].long`. Each accepts DD, DDM, DMS, hemisphere letters (N/S/E/W) as prefix or suffix.",
        example: { columns: ["collectedAt.lat", "collectedAt.long"], rows: [["48.8566", "2.3522"], ["51°30'N", "0°7'W"]] },
      },
      {
        label:  "Format 2: Single column - pipe-separated",
        syntax: "`lat|long` in one cell.",
        example: { columns: ["collectedAt"], rows: [["48.8566|2.3522"]] },
      },
      {
        label:  "Format 3: Single cell - auto-parsed",
        syntax: "DD, DDM, DMS, ISO 6709, hemisphere letters, French decimal commas.",
        example: { columns: ["collectedAt"], rows: [["48.8566, 2.3522"], ["N 48°51'23.76\" E 2°21'7.92\""]] },
      },
    ],
    notes: [
      {
        type: "tip",
        text: "The [[ref:content.customDataDefinition.template]] column must specify the map URL using `{{lat}}` and `{{long}}` - e.g. `https://www.openstreetmap.org/?mlat={{lat}}&mlon={{long}}`. Without a template the field falls back to a Google Maps URL.",
      },
    ],
  },
};

// src/model/customTypes/filterMeta.js
//
// Dependency-free filter plugin meta constants, shared across CustomType
// meta sidecar files. Kept here rather than duplicated in each sidecar.
//
// These are the documentation-facing descriptors for each filter plugin type.
// Update these if the corresponding filterPlugin*.js meta objects change.

export const filterMetaText = {
  filterType:        "categorical",
  filterLabel:       "Categorical multi-select",
  filterDescription: "Shows a searchable dropdown of all unique values present in the data. Users tick one or more values; a taxon matches if it has **any** of the selected values (OR logic within the filter).",
};

export const filterMetaNumber = {
  filterType:        "numeric-range",
  filterLabel:       "Numeric range",
  filterDescription: "Shows a range control with operations: equal to, less than, less than or equal, greater than, greater than or equal, between (two bounds), and around (value ± margin).",
};

export const filterMetaDate = {
  filterType:        "date-range",
  filterLabel:       "Date range",
  filterDescription: "Shows a date range control with the same operations as the numeric range filter. Dates are compared as timestamps so all standard operators apply.",
};

export const filterMetaInterval = {
  filterType:        "numeric-range",
  filterLabel:       "Numeric range (interval)",
  filterDescription: "Shows a range control identical to the numeric filter. A taxon matches if any part of its [from, to] interval satisfies the chosen operation.",
};

export const filterMetaMonths = {
  filterType:        "categorical",
  filterLabel:       "Categorical multi-select (month names)",
  filterDescription: "Shows month names as checkboxes. A taxon matches if it is active in **any** of the selected months.",
};

export const filterMetaMapregions = {
  filterType:        "categorical",
  filterLabel:       "Categorical multi-select (region names) + optional status filter",
  filterDescription: "Shows region names as checkboxes, resolved from the [[ref:appearance.mapRegionsNames]] table. An optional status sub-filter (categorical or numeric range) is shown when the column's [[ref:appearance.mapRegionsLegend]] contains status codes.",
};

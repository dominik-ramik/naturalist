// Barrel that imports per-plugin meta sidecars and re-exports them.
// Sidecars keep each plugin's documentation-facing descriptors separate,
// allowing other tooling (docs, loaders) to import individual plugin meta.

import { filterMetaText } from "../filterPlugins/filterPluginText.meta.js";
import { filterMetaNumber } from "../filterPlugins/filterPluginNumber.meta.js";
import { filterMetaDate } from "../filterPlugins/filterPluginDate.meta.js";
import { filterMetaInterval } from "../filterPlugins/filterPluginInterval.meta.js";
import { filterMetaMonths } from "../filterPlugins/filterPluginMonths.meta.js";
import { filterMetaMapregions } from "../filterPlugins/filterPluginMapregions.meta.js";

export const filterMeta = [
  filterMetaText,
  filterMetaNumber,
  filterMetaDate,
  filterMetaInterval,
  filterMetaMonths,
  filterMetaMapregions
];

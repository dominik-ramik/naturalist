// src/model/customTypes/filterMeta.js
// Barrel that imports per-plugin meta sidecars and re-exports them.
// Sidecars keep each plugin's documentation-facing descriptors separate,
// allowing other tooling (docs, loaders) to import individual plugin meta.

import { filterMetaText }       from "./filterPluginText.meta.js";
import { filterMetaNumber }     from "./filterPluginNumber.meta.js";
import { filterMetaDate }       from "./filterPluginDate.meta.js";
import { filterMetaInterval }   from "./filterPluginInterval.meta.js";
import { filterMetaMonths }     from "./filterPluginMonths.meta.js";
import { filterMetaMapregions } from "./filterPluginMapregions.meta.js";

export { filterMetaText, filterMetaNumber, filterMetaDate, filterMetaInterval, filterMetaMonths, filterMetaMapregions };

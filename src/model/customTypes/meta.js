// src/model/customTypes/meta.js
//
// Dependency-free barrel - aggregates meta from all CustomType sidecar files.
//
// Imported by docs/.vitepress/loaders/data-types.data.js via a path like:
//   import { dataTypesMeta } from "../../../../naturalist/src/model/customTypes/meta.js";
//
// ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────
// The runtime CustomType*.js files import Mithril, Checklist, Logger and other
// browser-only modules. VitePress runs in Node.js SSR and cannot load those.
// This barrel and its *.meta.js sidecars contain only plain JS objects with
// no imports except filterMeta.js - which is itself dependency-free.
// ─────────────────────────────────────────────────────────────────────────────

import { customTypeTextMeta }       from "./CustomTypeText.meta.js";
import { customTypeCategoryMeta }   from "./CustomTypeCategory.meta.js";
import { customTypeMarkdownMeta }   from "./CustomTypeMarkdown.meta.js";
import { customTypeNumberMeta }     from "./CustomTypeNumber.meta.js";
import { customTypeDateMeta }       from "./CustomTypeDate.meta.js";
import { customTypeTaxonMeta }      from "./CustomTypeTaxon.meta.js";
import { customTypeImageMeta }      from "./CustomTypeImage.meta.js";
import { customTypeSoundMeta }      from "./CustomTypeSound.meta.js";
import { customTypeMapMeta }        from "./CustomTypeMap.meta.js";
import { customTypeMapregionsMeta } from "./CustomTypeMapregions.meta.js";
import { customTypeMonthsMeta }     from "./CustomTypeMonths.meta.js";
import { customTypeGeopointMeta }   from "./CustomTypeGeopoint.meta.js";
import { customTypeIntervalMeta }   from "./CustomTypeInterval.meta.js";

// Order controls display order on /reference/data-types.
export const dataTypesMeta = [
  customTypeTextMeta,
  customTypeCategoryMeta,
  customTypeMarkdownMeta,
  customTypeNumberMeta,
  customTypeDateMeta,
  customTypeTaxonMeta,
  customTypeImageMeta,
  customTypeSoundMeta,
  customTypeMapMeta,
  customTypeMapregionsMeta,
  customTypeMonthsMeta,
  customTypeGeopointMeta,
  customTypeIntervalMeta,
];

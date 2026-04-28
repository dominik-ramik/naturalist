import Handlebars from "handlebars";

export function registerHandlebarHelpers() {

  /**
   * {{img}} Handlebars helper family — resolves an image source to its full-size
   * and thumbnail URLs when a template is evaluated twice by
   * processSourceBothVariants.
   *
   * The app calls your template twice automatically — once with _isThumb: false
   * (full-size) and once with _isThumb: true (thumbnail). You only need to
   * describe the variants; the helpers return the right string each time.
   *
   * ─── COMPANION SUBEXPRESSION HELPERS ────────────────────────────────────────
   *
   *   Four subexpression helpers declare how each variant is derived from the
   *   base value. They are only meaningful inside {{img}} and must not be used
   *   standalone.
   *
   *   (thumb "_320")
   *     Appends "_320" to the base value to form the thumbnail stem.
   *     Use for suffix-based naming conventions: agastarche → agastarche_320.
   *
   *   (thumbPath data.thumbSlug)
   *     Replaces the base value entirely with the resolved data path for the
   *     thumbnail stem. Use when the thumbnail has an independent identifier
   *     stored in a separate data column.
   *
   *   (full "_2400")
   *     Appends "_2400" to the base value to form the full-size stem.
   *     Use for suffix-based naming conventions: agastarche → agastarche_2400.
   *
   *   (fullPath data.fullSlug)
   *     Replaces the base value entirely with the resolved data path for the
   *     full-size stem. Use when the full-size image has an independent
   *     identifier stored in a separate data column.
   *
   *   All four are optional and may appear in any order relative to each other
   *   and to the base value argument inside {{img}}.
   *
   * ─── BASE VALUE ──────────────────────────────────────────────────────────────
   *
   *   The base value is the stem shared by both variants before any suffix is
   *   applied. It is always an unquoted data path resolved by Handlebars before
   *   being passed to the helper (e.g. `value`, `data.otherCol`). It is
   *   optional — when absent, the column's own value is used implicitly.
   *
   *   The file extension is always written outside the helper in the template
   *   string itself:
   *
   *     specimens/{{img (thumb "_320")}}.jpg   ← extension outside, correct
   *     specimens/{{img (thumb "_320.jpg")}}   ← extension inside, do not do this
   *
   * ─── SIGNATURES ──────────────────────────────────────────────────────────────
   *
   *   {{img}}
   *     Implicit base, no variants. Full and thumbnail are identical.
   *
   *   {{img value}}
   *     Explicit base from a data path, no variants. Full and thumbnail
   *     are identical.
   *
   *   {{img (thumb "_320")}}
   *     Implicit base, thumbnail suffix only.
   *     Full = base, thumb = base + "_320".
   *
   *   {{img (full "_2400")}}
   *     Implicit base, full-size suffix only.
   *     Full = base + "_2400", thumb = base.
   *
   *   {{img (thumb "_320") (full "_2400")}}
   *     Implicit base, both variants as suffixes. Order is free.
   *     Full = base + "_2400", thumb = base + "_320".
   *
   *   {{img value (thumb "_320")}}
   *     Explicit base, thumbnail suffix only.
   *
   *   {{img value (thumb "_320") (full "_2400")}}
   *     Explicit base, both variants as suffixes. All arguments may appear
   *     in any order.
   *
   *   {{img (thumbPath data.thumbSlug)}}
   *     Implicit base, thumbnail stem fully replaced by a data column value.
   *     Full = base, thumb = data.thumbSlug (the resolved value, not a suffix).
   *
   *   {{img (fullPath data.fullSlug)}}
   *     Implicit base, full-size stem fully replaced by a data column value.
   *     Full = data.fullSlug, thumb = base.
   *
   *   {{img value (thumbPath data.thumbSlug) (full "_2400")}}
   *     Explicit base, thumbnail replaced by data column, full uses suffix.
   *     Arguments may appear in any order.
   *
   * ─── FALLBACK BEHAVIOUR ──────────────────────────────────────────────────────
   *
   *   When (thumb) / (thumbPath) is absent but (full) / (fullPath) is present
   *   and the template is being evaluated for the thumbnail, the helper falls
   *   back to the full variant rather than the bare base value. This ensures
   *   the template is always safe to call twice even when only one variant is
   *   declared.
   *
   *   When no variant subexpressions are present at all, both evaluations return
   *   the same string — identical to using a plain {{value}} template. Existing
   *   templates require no migration.
   *
   * ─── QUICK REFERENCE ─────────────────────────────────────────────────────────
   *
   *   Template                                              Full               Thumb
   *   ────────────────────────────────────────────────────  ─────────────────  ─────────────────
   *   specimens/{{img}}.jpg                                 agastarche         agastarche
   *   specimens/{{img value}}.jpg                           agastarche         agastarche
   *   specimens/{{img (thumb "_320")}}.jpg                  agastarche         agastarche_320
   *   specimens/{{img (full "_2400")}}.jpg                  agastarche_2400    agastarche
   *   specimens/{{img (thumb "_320") (full "_2400")}}.jpg   agastarche_2400    agastarche_320
   *   specimens/{{img value (thumb "_320")}}.jpg            agastarche         agastarche_320
   *   specimens/{{img value (full "_2400")}}.jpg            agastarche_2400    agastarche
   *   specimens/{{img value (thumb "_320") (full "_2400")}}.jpg
   *                                                         agastarche_2400    agastarche_320
   *   specimens/{{img (thumbPath data.thumbSlug)}}.jpg      agastarche         <data.thumbSlug>
   *   specimens/{{img (fullPath data.fullSlug)}}.jpg        <data.fullSlug>    agastarche
   *   specimens/{{img value (thumbPath data.s) (full "_2400")}}.jpg
   *                                                         agastarche_2400    <data.s>
   *   specimens/{{img data.otherCol (thumb "_320")}}.jpg    <data.otherCol>    <data.otherCol>_320
   */

  /**
   * (thumb suffix) subexpression helper.
   * Declares a thumbnail variant that appends `suffix` to the base value.
   * Only meaningful as a subexpression argument to {{img}}.
   *
   * @param {string} suffix - The string to append to the base stem (e.g. "_320").
   * @returns {{ __isThumb: true, isSuffix: true, value: string }}
   */
  Handlebars.registerHelper("thumb", function (suffix) {
    return { __isThumb: true, isSuffix: true, value: String(suffix ?? "") };
  });

  /**
   * (thumbPath path) subexpression helper.
   * Declares a thumbnail variant that replaces the base value entirely with
   * the resolved data path. Use when the thumbnail has an independent identifier
   * in a separate data column rather than a suffix derived from the base.
   * Only meaningful as a subexpression argument to {{img}}.
   *
   * @param {string} path - The resolved data value to use as the thumbnail stem.
   * @returns {{ __isThumb: true, isSuffix: false, value: string }}
   */
  Handlebars.registerHelper("thumbPath", function (path) {
    return { __isThumb: true, isSuffix: false, value: String(path ?? "") };
  });

  /**
   * (full suffix) subexpression helper.
   * Declares a full-size variant that appends `suffix` to the base value.
   * Only meaningful as a subexpression argument to {{img}}.
   *
   * @param {string} suffix - The string to append to the base stem (e.g. "_2400").
   * @returns {{ __isFull: true, isSuffix: true, value: string }}
   */
  Handlebars.registerHelper("full", function (suffix) {
    return { __isFull: true, isSuffix: true, value: String(suffix ?? "") };
  });

  /**
   * (fullPath path) subexpression helper.
   * Declares a full-size variant that replaces the base value entirely with
   * the resolved data path. Use when the full-size image has an independent
   * identifier in a separate data column rather than a suffix derived from
   * the base.
   * Only meaningful as a subexpression argument to {{img}}.
   *
   * @param {string} path - The resolved data value to use as the full-size stem.
   * @returns {{ __isFull: true, isSuffix: false, value: string }}
   */
  Handlebars.registerHelper("fullPath", function (path) {
    return { __isFull: true, isSuffix: false, value: String(path ?? "") };
  });

  /**
   * {{img}} main helper.
   * See the full documentation block above for signatures, rules, and examples.
   */
  Handlebars.registerHelper("img", function (...args) {
    const options = args.pop(); // Handlebars always appends the options object as the last arg
    const isThumb = !!this._isThumb;

    // Locate each typed subexpression result and the plain base value arg.
    // Identification is by tag, not position — all arguments may appear in
    // any order.
    const thumbArg = args.find(a => a?.__isThumb);
    const fullArg = args.find(a => a?.__isFull);
    const baseArg = args.find(a => a !== null && a !== undefined && !a?.__isThumb && !a?.__isFull);
    const baseValue = baseArg !== undefined ? String(baseArg) : String(this.value ?? "");

    if (isThumb) {
      if (thumbArg !== undefined) {
        // (thumbPath) replaces base entirely; (thumb) appends suffix.
        return new Handlebars.SafeString(
          thumbArg.isSuffix ? baseValue + thumbArg.value : thumbArg.value
        );
      }
      // No thumb variant declared — fall back to full variant if present,
      // otherwise return bare base so the template is always safe to call twice.
      if (fullArg !== undefined) {
        return new Handlebars.SafeString(
          fullArg.isSuffix ? baseValue + fullArg.value : fullArg.value
        );
      }
      return new Handlebars.SafeString(baseValue);
    } else {
      if (fullArg !== undefined) {
        // (fullPath) replaces base entirely; (full) appends suffix.
        return new Handlebars.SafeString(
          fullArg.isSuffix ? baseValue + fullArg.value : fullArg.value
        );
      }
      return new Handlebars.SafeString(baseValue);
    }
  });

  Handlebars.registerHelper("unit", function (...args) {
    // Last arg is always Handlebars options hash - strip it
    const params = args.slice(0, -1);
    let value, unitStr, exact = false;
    if (params.length === 1) {
      // Implicit: {{ unit "kg" }}
      value = this.value;
      unitStr = params[0];
    } else if (params.length === 2 && params[1] === "exact") {
      // Implicit with exact: {{ unit "kg" "exact" }}
      value = this.value;
      unitStr = params[0];
      exact = true;
    } else if (params.length === 2) {
      // Explicit: {{ unit value "kg" }}
      value = params[0];
      unitStr = params[1];
    } else if (params.length >= 3) {
      // Explicit with optional exact: {{ unit value "kg" "exact" }}
      value = params[0];
      unitStr = params[1];
      exact = params[2] === "exact";
    }

    // ── Unit dictionary ────────────────────────────────────────────────────────
    const UNITS = {
      // Length  (base: m)
      um: { category: "length", factor: 0.000001 },
      mm: { category: "length", factor: 0.001 },
      cm: { category: "length", factor: 0.01 },
      m: { category: "length", factor: 1 },
      km: { category: "length", factor: 1000 },
      // Time  (base: s)
      ms: { category: "time", factor: 0.001 },
      s: { category: "time", factor: 1 },
      min: { category: "time", factor: 60 },
      h: { category: "time", factor: 3600 },
      d: { category: "time", factor: 86400 },
      y: { category: "time", factor: 31556736 },
      // Weight  (base: g)
      mg: { category: "weight", factor: 0.001 },
      g: { category: "weight", factor: 1 },
      kg: { category: "weight", factor: 1000 },
      t: { category: "weight", factor: 1000000 },
      // Area  (base: m2)
      um2: { category: "area", factor: 1e-12 },
      mm2: { category: "area", factor: 1e-6 },
      cm2: { category: "area", factor: 0.0001 },
      m2: { category: "area", factor: 1 },
      km2: { category: "area", factor: 1000000 },
      // Volume  (base: m3)
      um3: { category: "volume", factor: 1e-18 },
      mm3: { category: "volume", factor: 1e-9 },
      cm3: { category: "volume", factor: 1e-6 },
      ml: { category: "volume", factor: 1e-6 },
      l: { category: "volume", factor: 0.001 },
      m3: { category: "volume", factor: 1 },
      km3: { category: "volume", factor: 1e9 },
    };

    const CATEGORY_UNITS = {
      length: ["um", "mm", "cm", "m", "km"],
      time: ["ms", "s", "min", "h", "d", "y"],
      weight: ["mg", "g", "kg", "t"],
      area: ["um2", "mm2", "cm2", "m2", "km2"],
    };

    // ── Helpers ────────────────────────────────────────────────────────────────

    // Accepts actual numbers or strings like "1.5", "1,5" (comma decimal separator)
    function parseNum(v) {
      if (typeof v === "number") return isFinite(v) ? v : NaN;
      if (typeof v === "string") {
        const cleaned = v.trim().replace(",", ".");
        const n = parseFloat(cleaned);
        return (isNaN(n) || !isFinite(n)) ? NaN : n;
      }
      return NaN;
    }

    function isValid(v) { return !isNaN(v); }

    // Intelligent number formatting: rounds to a reasonable number of decimal places,
    // but keeps all significant leading zeros for small numbers (e.g. 0.0000123 → "0.0000123", not "0.00001")
    function formatNumber(n, defaultPlaces = 3) {
      // Return immediately if it's already a clean integer
      if (Number.isInteger(n)) return n.toString();

      // Convert to a high-precision string to prevent scientific notation ('e'),
      // split at the decimal, and remove any trailing zeros from the engine's formatting.
      const decimalPart = n.toFixed(100).split('.')[1].replace(/0+$/, '');

      // If after stripping trailing zeros there is no decimal part, return safely
      if (!decimalPart) return n.toString();

      // Count continuous leading zeros right after the decimal point
      const match = decimalPart.match(/^0+/);
      const leadingZeros = Math.min(match ? match[0].length : 0, defaultPlaces);

      // Detect a repeating (periodic) decimal in the significant digits.
      // Checks periods 1–6; requires 4 consecutive repetitions to confirm.
      // Stays within the first 16 chars to avoid float-precision artifacts.
      function detectPeriod(s) {
        const check = s.substring(0, 16);
        for (let p = 1; p <= 6; p++) {
          if (check.length < p * 4) continue;
          const pattern = check.substring(0, p);
          let ok = true;
          for (let i = p, limit = p * 4; i < limit; i++) {
            if (check[i] !== pattern[i % p]) { ok = false; break; }
          }
          if (ok) return p;
        }
        return 0;
      }

      const significantPart = decimalPart.slice(leadingZeros);
      const period = detectPeriod(significantPart);

      // Decide precision:
      // - Periodic decimal: show 2 full cycles of the repeating pattern
      //   (e.g. period=1 → 2 decimal places, period=3 → 6), capped at 6.
      // - Otherwise: default places, but always enough to expose at least
      //   one significant digit after any leading zeros.
      const places = period > 0
        ? leadingZeros + Math.min(period * 2, 6)
        : Math.max(defaultPlaces, leadingZeros + 1);

      // Round accurately and return decimal string without exponential
      // notation. Use toFixed to get a decimal representation, then strip
      // trailing zeros while keeping at least one digit after the decimal
      // point when appropriate.
      let fixed = n.toFixed(places);
      // Remove trailing zeros and optional trailing decimal point
      if (fixed.indexOf('.') >= 0) {
        fixed = fixed.replace(/0+$/, '');
        fixed = fixed.replace(/\.$/, '');
      }
      return fixed;
    }

    // Single formatted token, e.g. "<span class='unit-value'>1.5</span>&nbsp;<span class='unit-name'>km</span>"
    function formatPair(n, key) {
      return '<span class="unit-value">' + formatNumber(n) + '</span>&nbsp;<span class="unit-name">' + unitToHtml(key) + '</span>';
    }

    // Volume has two flavours: cubic (cm3) and liquid (ml/l).
    // Preserve whichever flavour the template author chose.
    function getCategoryUnits(category, inputKey) {
      if (category === "volume") {
        return (inputKey === "ml" || inputKey === "l")
          ? ["um3", "mm3", "ml", "l", "m3", "km3"]
          : ["um3", "mm3", "cm3", "m3", "km3"];
      }
      return CATEGORY_UNITS[category];
    }

    function findBestUnit(baseValue, category, unitList) {
      const absVal = Math.abs(baseValue);

      // Time uses threshold cascades, not base-10 scaling
      if (category === "time") {
        if (absVal < 1) return "ms";
        if (absVal < 60) return "s";
        if (absVal < 3600) return "min";
        if (absVal < 86400) return "h";
        if (absVal < 31556736) return "d";
        return "y";
      }

      // Base-10 categories: find unit where 1 ≤ converted < 1000.
      // Iterate largest-to-smallest so we pick the biggest unit that still keeps
      // the value ≥ 1 (e.g. "2 cm" stays "2 cm", not "20 mm").
      if (absVal / UNITS[unitList[0]].factor < 1) return unitList[0]; // too small: clamp to smallest
      for (const key of [...unitList].reverse()) {
        const converted = absVal / UNITS[key].factor;
        if (converted >= 1 && converted < 1000) return key;
      }

      // No perfect fit (gap between adjacent units is > 1000×, e.g. cm³→m³ is 10⁶×).
      // Pick the unit whose converted value is closest to [1, 1000) in log space,
      // so we never return an astronomically small/large number when a more
      // readable nearby unit exists (e.g. 2000 cm³ beats 2e-12 km³).
      let bestKey = unitList[unitList.length - 1];
      let bestScore = Infinity;
      for (const key of unitList) {
        const converted = absVal / UNITS[key].factor;
        const score = converted >= 1000
          ? Math.log10(converted / 1000)   // overshoot above range
          : Math.log10(1 / converted);      // undershoot below range
        if (score < bestScore) {
          bestScore = score;
          bestKey = key;
        }
      }
      return bestKey;
    }

    // Core pipeline: input number + input unit → { value, unitKey }
    function processValue(numVal, inputKey) {
      const unitInfo = UNITS[inputKey];
      if (!unitInfo) return null;

      if (numVal === 0) return { value: 0, unitKey: inputKey };

      const baseValue = numVal * unitInfo.factor;
      const unitList = getCategoryUnits(unitInfo.category, inputKey);
      const bestKey = findBestUnit(baseValue, unitInfo.category, unitList);
      const converted = baseValue / UNITS[bestKey].factor;

      return { value: converted, unitKey: bestKey };
    }

    // ── Guard: unknown unit (exact mode allows any unit string) ────────────────
    if (!exact && !UNITS[unitStr]) return value;

    const parsed = parseNum(value);
    if (!isValid(parsed)) return value;

    if (exact) {
      return new Handlebars.SafeString(formatPair(parsed, unitStr));
    }

    if (parsed === 0) {
      return new Handlebars.SafeString(formatPair(0, unitStr));
    }

    const result = processValue(parsed, unitStr);
    if (!result) return value;

    return new Handlebars.SafeString(formatPair(result.value, result.unitKey));
  });

  Handlebars.registerHelper("ifeq", function (arg1, arg2, options) {
    return arg1 == arg2 ? options.fn(this) : options.inverse(this);
  });
}
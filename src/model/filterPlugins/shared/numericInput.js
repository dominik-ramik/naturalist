/**
 * Factory that returns a `numericInput(thresholdNumber, min, max)` builder.
 *
 * Both DropdownNumber and DropdownInterval render the same kind of text-type
 * numeric inputs; the only difference is the extra error conditions and
 * placeholder text applied to each threshold.  This factory eliminates that
 * near-identical duplication.
 *
 * ── Why type=text and not type=number ────────────────────────────────────────
 * This is a deliberate design decision, not legacy code:
 *
 *   1. Locale decimal separators.  The oninput handler accepts both "." and ","
 *      as decimal separators.  type=number inputs only accept the locale-
 *      independent "." which breaks for users whose keyboards produce "," (most
 *      of continental Europe).
 *
 *   2. Intermediate input states.  While the user is typing "1.5" the field
 *      briefly contains "1." - a valid intermediate state.  type=number inputs
 *      fire a change event with an empty value for such states, making it
 *      impossible to distinguish "user cleared the field" from "user is mid-
 *      typing".  type=text lets us inspect the raw string and defer parsing.
 *
 *   3. Spinner arrows.  type=number always shows browser spinner arrows.  These
 *      are removed via CSS for type=text without any side-effects.
 *
 * @param {object} opts
 * @param {object}   opts.state                       – mutable component state object
 * @param {number[]} opts.state.initialThresholds     – [null, t1, t2] - pre-filled from saved filter
 * @param {number[]} opts.state.actualThresholds      – [null, t1, t2] - live values from inputs
 * @param {string}   opts.dropdownId                  – used to build stable element ids
 * @param {function} [opts.getPlaceholder]            – (thresholdNumber) → string
 *                                                      returns the ghost/hint text shown when the
 *                                                      input is empty.  Called every render so the
 *                                                      text reacts to operation changes.
 * @param {function} [opts.getExtraError]             – (thresholdNumber, actualThresholds, operation) → boolean
 *                                                      optional additional error condition beyond isNaN
 * @param {function} [opts.getOperation]              – () → string  current operation key (needed by getExtraError)
 *
 * @returns {function} numericInput(thresholdNumber, min, max) → Mithril vnode
 */
import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';

export function makeNumericInputFn({ state, dropdownId, getPlaceholder, getExtraError, getOperation }) {
  return function numericInput(thresholdNumber, min, max) {
    // Track how many threshold inputs have been rendered in this view pass.
    state.thresholdsShown = (state.thresholdsShown || 0) + 1;

    const initialVal   = state.initialThresholds[thresholdNumber];
    const actualVal    = state.actualThresholds[thresholdNumber];
    const currentValue = initialVal !== null ? initialVal : actualVal;

    // getPlaceholder is called on every render so the hint text stays in sync
    // when the user switches between operations.
    const placeholder  = getPlaceholder ? (getPlaceholder(thresholdNumber) || "") : "";

    let isInputError = typeof actualVal !== "number" || isNaN(actualVal);
    if (!isInputError && getExtraError) {
      isInputError = getExtraError(thresholdNumber, state.actualThresholds, getOperation?.());
    }

    // ── Important: min, max, and placeholder are passed via the attrs object,
    // NOT via the Mithril selector string.
    //
    // Selector-string attribute values must be single tokens with no spaces or
    // special characters.  Placeholder text produced by getPlaceholder can
    // contain spaces, locale-formatted numbers, and em-dashes (e.g. "100 – 200").
    // Passing such values through the selector would break Mithril's parser.
    // Null min/max passed through the selector would produce the literal string
    // "null" as the HTML attribute value, which browsers can misinterpret.
    // The attrs object handles all of these cases correctly.
    const attrs = {
      id:   "threshold" + thresholdNumber + "_" + dropdownId,
      type: "text",
      name: "threshold" + thresholdNumber,
      oninput() {
        state.initialThresholds[thresholdNumber] = null;
        let v = this.value;
        if (
          !v.endsWith(".") && !v.endsWith(",") &&
          isFinite(v.replace(",", ".")) && v.trim() !== ""
        ) {
          v = parseFloat(v.replace(",", "."));
        }
        state.actualThresholds[thresholdNumber] = v;
      },
    };

    // Only set min/max when they are actual numbers, to avoid the HTML attribute
    // being set to the string "null" when no data is available yet.
    if (min != null) attrs.min = min;
    if (max != null) attrs.max = max;

    // Only set value when the input has a pre-filled or live value, so the
    // placeholder text shows on empty inputs.
    if (currentValue !== null) attrs.value = currentValue;

    // Only set placeholder when there is meaningful text; undefined removes
    // the attribute entirely rather than setting it to an empty string.
    if (placeholder) attrs.placeholder = placeholder;

    return m(
      "input" + (actualVal !== null && isInputError ? ".error" : ""),
      attrs
    );
  };
}
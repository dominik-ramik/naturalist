/**
 * Factory that returns a `numericInput(thresholdNumber, min, max)` builder.
 *
 * Both DropdownNumber and DropdownInterval render the same kind of text-type
 * numeric inputs; the only difference is the extra error conditions and
 * placeholder text applied to each threshold.  This factory eliminates that
 * near-identical duplication.
 *
 * @param {object} opts
 * @param {object}   opts.state                       – mutable component state object
 * @param {number[]} opts.state.initialThresholds     – [null, t1, t2] — pre-filled from saved filter
 * @param {number[]} opts.state.actualThresholds      – [null, t1, t2] — live values from inputs
 * @param {string}   opts.dropdownId                  – used to build stable element ids
 * @param {function} [opts.getPlaceholder]            – (thresholdNumber) → string
 *                                                      returns the ghost/hint text shown when the
 *                                                      input is empty.  Called every render so the
 *                                                      text can react to operation changes.
 * @param {function} [opts.getExtraError]             – (thresholdNumber, actualThresholds, operation) → boolean
 *                                                      optional additional error condition beyond isNaN
 * @param {function} [opts.getOperation]              – () → string  current operation key (needed by getExtraError)
 *
 * @returns {function} numericInput(thresholdNumber, min, max) → Mithril vnode
 */
import m from "mithril";

export function makeNumericInputFn({ state, dropdownId, getPlaceholder, getExtraError, getOperation }) {
  return function numericInput(thresholdNumber, min, max) {
    // Track how many threshold inputs have been rendered in this view pass
    state.thresholdsShown = (state.thresholdsShown || 0) + 1;

    const initialVal   = state.initialThresholds[thresholdNumber];
    const actualVal    = state.actualThresholds[thresholdNumber];
    const currentValue = initialVal !== null ? initialVal : actualVal;
    const placeholder  = getPlaceholder ? getPlaceholder(thresholdNumber) : "";

    let isInputError = typeof actualVal !== "number" || isNaN(actualVal);
    if (!isInputError && getExtraError) {
      isInputError = getExtraError(thresholdNumber, state.actualThresholds, getOperation?.());
    }

    return m(
      "input" +
        (actualVal !== null && isInputError ? ".error" : "") +
        "[id=threshold" + thresholdNumber + "_" + dropdownId + "]" +
        "[type=text][name=threshold" + thresholdNumber + "]" +
        "[min=" + min + "][max=" + max + "]" +
        (currentValue !== null ? "[value=" + currentValue + "]" : "") +
        (placeholder ? "[placeholder=" + placeholder + "]" : ""),
      {
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
      }
    );
  };
}
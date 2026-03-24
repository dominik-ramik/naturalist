/**
 * defaultConfig.js
 *
 * Merged with the user-supplied object from:
 *   app.provide('spreadsheet-config', { ... })
 *
 * All values here reference CSS custom properties so they
 * respect the light / dark theme automatically.
 * User config is applied as-is (immune to dark/light switching).
 */
export const defaultConfig = {
  /**
   * Named style bundles resolved by the `variant` prop on
   * <SRow> and <SCell>.  Users add their own here via provide().
   *
   * Example:
   *   classes: {
   *     header:  { background: '#d0e4f7', fontWeight: 'bold' },
   *     warning: { background: '#fff3cd' },
   *   }
   */
  classes: {},

  /** Styles applied when `highlight` prop is true */
  highlight: {
    background: 'var(--ss-highlight-bg)',
    outline:    '2px solid var(--ss-highlight-outline)',
    outlineOffset: '-2px',
  },

  /** Alternating-row colours when `striped` is true on <Sheet> */
  striped: {
    odd:  'var(--ss-stripe-odd)',
    even: 'var(--ss-stripe-even)',
  },

  /** Styles for cells with `type="formula"` */
  formula: {
    fontFamily: 'var(--ss-formula-font)',
    fontSize:   '12px',
    background: 'var(--ss-formula-bg)',
  },

  /** Styles for cells with `type="number"` */
  number: {
    textAlign: 'right',
  },
}

/** Deep-merge helper used by Spreadsheet.vue */
export function mergeConfig(base, override) {
  if (!override) return { ...base }
  const result = { ...base }
  for (const key of Object.keys(override)) {
    const ov = override[key]
    const bv = base[key]
    if (ov !== null && typeof ov === 'object' && !Array.isArray(ov)
                    && typeof bv === 'object' && bv !== null) {
      result[key] = mergeConfig(bv, ov)
    } else {
      result[key] = ov
    }
  }
  return result
}

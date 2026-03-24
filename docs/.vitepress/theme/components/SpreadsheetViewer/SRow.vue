<script setup>
/**
 * SRow.vue — one data row.
 *
 * Renders as a <tr>.  Automatically prepends a sticky row-number cell.
 * Provides `getCellIndex` and `rowIndex` to child <SCell> components.
 *
 * Props
 * ─────
 * empty      Visual break row (dashed lines, no row number).
 * bold       Bold all cells in this row.
 * italic     Italic all cells in this row.
 * bg         Background colour for all cells (CSS colour string).
 * color      Text colour for all cells.
 * align      Text alignment: 'left' | 'center' | 'right'.
 * highlight  Apply the highlight style (config.highlight).
 * variant    String or string[] — maps to config.classes entries.
 * style      Extra inline styles (object or string).
 */
import { ref, computed, inject, provide, onMounted } from 'vue'

const props = defineProps({
  empty:     { type: Boolean, default: false },
  bold:      { type: Boolean, default: false },
  italic:    { type: Boolean, default: false },
  bg:        { type: String,  default: '' },
  color:     { type: String,  default: '' },
  align:     { type: String,  default: '' },
  highlight: { type: Boolean, default: false },
  variant:   { type: [String, Array], default: null },
  style:     { type: [String, Object], default: null },
})

/* ── Inject from <Sheet> ───────────────────────────────────── */
const getNextRowIndex = inject('ss:getNextRowIndex')
const updateColCount  = inject('ss:updateColCount')
const colCount        = inject('ss:colCount')
const freezeRows      = inject('ss:freezeRows')
const striped         = inject('ss:striped')
const config          = inject('ss:config')
const CELL_H          = inject('ss:CELL_H')
const HEADER_H        = inject('ss:HEADER_H')

/* ── Row index (skip for empty break rows) ───────────────────── */
const rowIndex = props.empty ? -1 : getNextRowIndex()

/* ── Cell-index counter (provided to SCell children) ────────── */
const cellCounter = ref(0)
function getCellIndex(colspan = 1) {
  const idx = cellCounter.value
  cellCounter.value += colspan
  return idx
}
onMounted(() => updateColCount(cellCounter.value))

provide('ss:getCellIndex', getCellIndex)
provide('ss:rowIndex',     rowIndex)

/* ── Computed state ─────────────────────────────────────────── */
const isFrozen = computed(() => !props.empty && rowIndex < freezeRows.value)
const isEven   = computed(() => !props.empty && rowIndex % 2 === 1)

/* ── CSS classes for <tr> ────────────────────────────────────── */
const trClasses = computed(() => {
  if (props.empty) return ['ss-row-empty']
  return [
    'ss-row',
    isFrozen.value && 'ss-row-frozen',
    striped.value && isEven.value && 'ss-row-stripe-even',
  ].filter(Boolean)
})

/* ── Sticky top for frozen rows ─────────────────────────────── */
const trStyle = computed(() => {
  const styles = {}
  if (isFrozen.value) {
    styles.top = HEADER_H + rowIndex * CELL_H + 'px'
  }
  return styles
})

/* ── Inline styles for all data cells from row-level props ──── */
const cellStyleFromRow = computed(() => {
  const variantStyles = resolveVariant(props.variant, config.value)
  return {
    ...variantStyles,
    ...(props.bg    ? { background:  props.bg    } : {}),
    ...(props.color ? { color:       props.color } : {}),
    ...(props.align ? { textAlign:   props.align } : {}),
    ...(props.highlight
          ? {
              background:    config.value.highlight.background,
              outline:       config.value.highlight.outline,
              outlineOffset: config.value.highlight.outlineOffset,
            }
          : {}),
    ...(typeof props.style === 'object' ? props.style : {}),
  }
})

const cellClassFromRow = computed(() => [
  props.bold      && 'ss-bold',
  props.italic    && 'ss-italic',
  props.align     && `ss-align-${props.align}`,
  props.highlight && 'ss-cell-highlight',
].filter(Boolean))

provide('ss:rowCellStyle',  cellStyleFromRow)
provide('ss:rowCellClasses', cellClassFromRow)

/* ── Variant resolver helper ────────────────────────────────── */
function resolveVariant(variant, cfg) {
  if (!variant) return {}
  const names = Array.isArray(variant) ? variant : [variant]
  return names.reduce((acc, name) => {
    const entry = cfg.classes?.[name]
    if (entry) Object.assign(acc, entry)
    return acc
  }, {})
}
</script>

<template>
  <!-- ── Empty break row ── -->
  <tr v-if="empty" class="ss-row-empty">
    <td :colspan="colCount + 1" />
  </tr>

  <!-- ── Data row ── -->
  <tr v-else :class="trClasses" :style="trStyle">
    <!-- Sticky row-number cell -->
    <td class="ss-row-num">{{ rowIndex + 1 }}</td>
    <!-- User cells -->
    <slot />
  </tr>
</template>

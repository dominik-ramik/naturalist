<script setup>
/**
 * SRow.vue — one data row.
 *
 * Renders as a <tr>.  Automatically prepends a sticky row-number cell.
 * Provides `getCellIndex` and `rowIndex` to child <SCell> components.
 * Intercepts slot children to automatically weave empty columns defined in <SCol>.
 *
 * Props
 * ─────
 * empty     Visual break row (dashed lines, no row number). Also accepts string/number to skip rows.
 * bold      Bold all cells in this row.
 * italic    Italic all cells in this row.
 * bg        Background colour for all cells (CSS colour string).
 * color     Text colour for all cells.
 * align     Text alignment: 'left' | 'center' | 'right'.
 * highlight Apply the highlight style (config.highlight).
 * variant   String or string[] — maps to config.classes entries.
 * style     Extra inline styles (object or string).
 */
import { ref, computed, inject, provide, onMounted, useSlots, h, Fragment, Comment } from 'vue'
import SCell from './SCell.vue'

const props = defineProps({
  empty:     { type: [Boolean, Number, String], default: false },
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
const colDefs         = inject('ss:colDefs')

/* ── Empty Row Calculation ─────────────────────────────────── */
const emptyCount = computed(() => {
  if (props.empty === '' || props.empty === true) return 1
  if (!props.empty) return 0
  return parseInt(props.empty, 10) || 1
})
const isBreak = computed(() => emptyCount.value > 0)

/* ── Row index (skip for empty break rows) ───────────────────── */
const rowIndex = (() => {
  if (isBreak.value) {
    getNextRowIndex(emptyCount.value) // Advance the counter by the skip amount
    return -1
  }
  return getNextRowIndex(1)
})()

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
const isFrozen = computed(() => !isBreak.value && rowIndex < freezeRows.value)
const isEven   = computed(() => !isBreak.value && rowIndex % 2 === 1)

/* ── CSS classes for <tr> ────────────────────────────────────── */
const trClasses = computed(() => {
  if (isBreak.value) return ['ss-row-empty']
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

/* ── Cell Weaving & Render Logic ────────────────────────────── */
const slots = useSlots()

function flattenVNodes(nodes) {
  let result = []
  for (const node of nodes) {
    if (node.type === Fragment) {
      result.push(...flattenVNodes(node.children))
    } else if (node.type === Comment) {
      continue
    } else {
      result.push(node)
    }
  }
  return result
}

// Functional component to weave user-defined slots and empty columns
const RenderCells = () => {
  const defaultSlot = slots.default ? slots.default() : []
  const flatCells = flattenVNodes(defaultSlot)

  const renderedCells = []
  let userCellIdx = 0
  let colIdx = 0

  if (!colDefs || !colDefs.value || colDefs.value.length === 0) {
    renderedCells.push(...flatCells)
  } else {
    while (colIdx < colDefs.value.length || userCellIdx < flatCells.length) {
      const def = colDefs.value[colIdx]

      if (def && def.empty) {
        const cellVNode = flatCells[userCellIdx]
        const hasEmptyProp = cellVNode?.props && ('empty' in cellVNode.props) && cellVNode.props.empty !== false

        if (hasEmptyProp) {
          renderedCells.push(cellVNode)
          userCellIdx++
        } else {
          // Auto-insert missing gap cell
          renderedCells.push(h(SCell, { empty: true }))
        }
        colIdx++
      } else {
        const cellVNode = flatCells[userCellIdx]
        if (cellVNode) {
          renderedCells.push(cellVNode)
          const colspan = cellVNode.props?.colspan || 1
          colIdx += parseInt(colspan, 10) || 1
          userCellIdx++
        } else if (colIdx < colDefs.value.length) {
          // Fallback: Fill missing normal columns to preserve grid
          renderedCells.push(h(SCell))
          colIdx++
        } else {
          colIdx++
        }
      }
    }
  }

  return renderedCells
}
</script>

<template>
  <tr v-if="isBreak" class="ss-row-empty">
    <td :colspan="colCount + 1" />
  </tr>

  <tr v-else :class="trClasses" :style="trStyle">
    <td class="ss-row-num">{{ rowIndex + 1 }}</td>
    <RenderCells />
  </tr>
</template>
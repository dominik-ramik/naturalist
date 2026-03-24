<script setup>
/**
 * SRow.vue — one data row.
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
    getNextRowIndex(emptyCount.value) 
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
const isEven   = computed(() => !isBreak.value && rowIndex % 2 === 1)

/* ── CSS classes for <tr> ────────────────────────────────────── */
const trClasses = computed(() => {
  if (isBreak.value) return ['ss-row-empty']
  return [
    'ss-row',
    striped.value && isEven.value && 'ss-row-stripe-even',
    props.highlight && 'ss-row-highlight',
  ].filter(Boolean)
})

const trStyle = computed(() => ({ }))

/* ── Inline styles for all data cells from row-level props ──── */
const cellStyleFromRow = computed(() => {
  const variantStyles = resolveVariant(props.variant, config.value)
  return {
    ...variantStyles,
    ...(props.bg    ? { background:  props.bg    } : {}),
    ...(props.color ? { color:       props.color } : {}),
    ...(props.align ? { textAlign:   props.align } : {}),
    ...(typeof props.style === 'object' ? props.style : {}),
  }
})

const cellClassFromRow = computed(() => [
  props.bold      && 'ss-bold',
  props.italic    && 'ss-italic',
  props.align     && `ss-align-${props.align}`,
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
  <tr 
    v-if="isBreak" 
    class="ss-row-empty" 
    :style="{ 'counter-increment': `ss-row-num-counter ${emptyCount}` }"
  >
    <td :colspan="colCount + 1" />
  </tr>

  <tr v-else :class="trClasses" :style="trStyle">
    <td class="ss-row-num"></td>
    <RenderCells />
  </tr>
</template>

<style>
/* CSS Counters guarantee numbering strictly follows DOM order */
.ss-table {
  counter-reset: ss-row-num-counter;
}

/* Increment counter for every rendered normal row */
.ss-row {
  counter-increment: ss-row-num-counter;
}

/* Display the calculated physical number */
.ss-row-num::after {
  content: counter(ss-row-num-counter);
}
</style>
<script setup>
/**
 * SCol.vue — individual column definition.
 *
 * Renders no DOM.  On mount it registers its width/empty flag
 * with the parent <Sheet>'s colDefs list, which drives:
 *   - the <colgroup> widths
 *   - the A/B/C column-letter header row
 *   - sticky-left offset calculations for frozen columns
 *
 * Props
 * ─────
 * width   CSS width string, e.g. "120px" or "8rem".
 *         Omit to use the default column width (100px).
 * empty   If true this column is a visual break (dashed lines).
 *         Supply a matching <SCell empty /> in every data row.
 */
import { inject, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps({
  width: { type: String,  default: null },
  empty: { type: [Boolean, Number, String], default: false },
})

const registerColDef   = inject('ss:registerColDef')
const unregisterColDef = inject('ss:unregisterColDef')

const emptyCount = computed(() => {
  if (props.empty === '' || props.empty === true) return 1
  if (!props.empty) return 0
  return parseInt(props.empty, 10) || 1
})

let colId = null
onMounted(()   => { 
  colId = registerColDef({ 
    width: props.width, 
    empty: emptyCount.value > 0, 
    skipCount: emptyCount.value 
  }) 
})
onUnmounted(() => { if (colId !== null) unregisterColDef(colId) })
</script>

<template><!-- renderless --></template>

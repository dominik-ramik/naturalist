<script setup>
/**
 * SCell.vue — individual table cell.
 *
 * Props
 * ─────
 * empty      Visual empty-column break (no content, dashed borders).
 * colspan    HTML colspan (default 1).
 * rowspan    HTML rowspan (default 1).
 * bold       Bold text.
 * italic     Italic text.
 * bg         Background colour (CSS string).
 * color      Text colour (CSS string).
 * align      'left' | 'center' | 'right'.
 * highlight  Apply config.highlight styles.
 * variant    String or string[] → config.classes lookup.
 * type       'formula' | 'number' — built-in visual presets.
 * note       Markdown string → red-triangle tooltip.
 * style      Extra inline style (object or string).
 */
import { ref, computed, inject, onMounted, nextTick } from 'vue'

const props = defineProps({
  empty:     { type: Boolean, default: false },
  colspan:   { type: Number,  default: 1 },
  rowspan:   { type: Number,  default: 1 },
  bold:      { type: Boolean, default: false },
  italic:    { type: Boolean, default: false },
  bg:        { type: String,  default: '' },
  color:     { type: String,  default: '' },
  align:     { type: String,  default: '' },
  highlight: { type: Boolean, default: false },
  variant:   { type: [String, Array], default: null },
  type:      { type: String,  default: '' },
  note:      { type: String,  default: '' },
  style:     { type: [String, Object], default: null },
})

/* ── Inject from parent components ─────────────────────────── */
const getCellIndex   = inject('ss:getCellIndex')
const rowIndex       = inject('ss:rowIndex')
const rowCellStyle   = inject('ss:rowCellStyle',   computed(() => ({})))
const rowCellClasses = inject('ss:rowCellClasses', computed(() => []))
const colDefs        = inject('ss:colDefs')
const freezeCols     = inject('ss:freezeCols')
const getStickyLeft  = inject('ss:getStickyLeft')
const config         = inject('ss:config')

/* ── Column index (called synchronously — Vue setup order == DOM order) */
const colIndex = props.empty ? -1 : getCellIndex(props.colspan)

/* ── Frozen column ──────────────────────────────────────────── */
const isFrozenCol = computed(() =>
  !props.empty && colIndex < freezeCols.value
)
const stickyLeft = computed(() =>
  isFrozenCol.value ? getStickyLeft(colIndex) : null
)

/* ── Variant resolver ───────────────────────────────────────── */
function resolveVariant(variant, cfg) {
  if (!variant) return {}
  const names = Array.isArray(variant) ? variant : [variant]
  return names.reduce((acc, name) => {
    const entry = cfg.classes?.[name]
    if (entry) Object.assign(acc, entry)
    return acc
  }, {})
}

/* ── CSS classes ────────────────────────────────────────────── */
const tdClasses = computed(() => {
  if (props.empty) return ['ss-cell-empty-col']
  return [
    ...rowCellClasses.value,
    isFrozenCol.value  && 'ss-cell-frozen-col',
    props.bold         && 'ss-bold',
    props.italic       && 'ss-italic',
    props.align        && `ss-align-${props.align}`,
    props.highlight    && 'ss-cell-highlight',
    props.type === 'formula' && 'ss-cell-formula',
    props.type === 'number'  && 'ss-cell-number',
    props.note         && 'ss-cell-has-note',
  ].filter(Boolean)
})

/* ── Inline styles ──────────────────────────────────────────── */
const tdStyle = computed(() => {
  if (props.empty) return {}
  const variantStyles = resolveVariant(props.variant, config.value)
  const typeStyles =
    props.type === 'formula' ? config.value.formula :
    props.type === 'number'  ? config.value.number  : {}
  const hlStyles = props.highlight ? config.value.highlight : {}
  const extraStyle = typeof props.style === 'object' ? props.style : {}

  return {
    ...rowCellStyle.value,
    ...typeStyles,
    ...variantStyles,
    ...hlStyles,
    ...(props.bg    ? { background: props.bg    } : {}),
    ...(props.color ? { color:      props.color } : {}),
    ...(props.align ? { textAlign:  props.align } : {}),
    ...extraStyle,
    ...(stickyLeft.value ? { left: stickyLeft.value } : {}),
  }
})

/* ── Note tooltip ───────────────────────────────────────────── */
const cellEl     = ref(null)
const tooltipEl  = ref(null)
const showNote   = ref(false)
const tooltipPos = ref({ top: '0px', left: '0px' })

function onNoteEnter() {
  if (!props.note) return
  showNote.value = true
  nextTick(() => {
    positionTooltip()
  })
}
function onNoteLeave() { showNote.value = false }

function positionTooltip() {
  if (!cellEl.value || !tooltipEl.value) return
  const cRect = cellEl.value.getBoundingClientRect()
  const tRect = tooltipEl.value.getBoundingClientRect()
  const vp    = { w: window.innerWidth, h: window.innerHeight }
  const gap   = 5

  // Vertical: prefer below, flip to above if needed
  let top = cRect.bottom + gap
  if (top + tRect.height > vp.h - 8) {
    top = cRect.top - tRect.height - gap
  }

  // Horizontal: align to cell left, shift left if overflows right
  let left = cRect.left
  if (left + tRect.width > vp.w - 8) {
    left = cRect.right - tRect.width
  }
  if (left < 8) left = 8

  tooltipPos.value = { top: Math.round(top) + 'px', left: Math.round(left) + 'px' }
}

/* ── Tiny markdown → HTML renderer ─────────────────────────── */
function renderMd(src) {
  if (!src) return ''
  return src
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>')
}

const noteHtml = computed(() => renderMd(props.note))
</script>

<template>
  <!-- ── Empty-column break cell ── -->
  <td v-if="empty" class="ss-cell-empty-col" />

  <!-- ── Data cell ── -->
  <td
    v-else
    ref="cellEl"
    :class="tdClasses"
    :style="tdStyle"
    :colspan="colspan > 1 ? colspan : undefined"
    :rowspan="rowspan > 1 ? rowspan : undefined"
  >
    <!-- Cell content -->
    <slot />

    <!-- Note indicator (triangle + ℹ) -->
    <template v-if="note">
      <span class="ss-note-indicator" aria-hidden="true" />
      <span class="ss-note-i" aria-hidden="true">i</span>
      <span
        class="ss-note-trigger"
        @mouseenter="onNoteEnter"
        @mouseleave="onNoteLeave"
        aria-label="Note"
      />
    </template>

    <!-- Tooltip — teleported to body so it escapes table overflow clipping -->
    <Teleport v-if="note" to="body">
      <div
        v-show="showNote"
        ref="tooltipEl"
        class="ss-note-tooltip"
        :style="tooltipPos"
        role="tooltip"
        v-html="noteHtml"
      />
    </Teleport>
  </td>
</template>

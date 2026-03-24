<script setup>
/**
 * Sheet.vue — one worksheet tab
 *
 * Responsibilities:
 *  - Register itself with <Spreadsheet> on mount
 *  - Render the scroll container → table → colgroup → col-header row
 *  - Provide context for child <SCols>/<SRow>/<SCell> components:
 *      getNextRowIndex, registerColDef, colDefs, colCount,
 *      updateColCount, freezeRows, freezeCols, striped, config,
 *      getStickyLeft, CELL_H, HEADER_H, ROW_NUM_W
 *  - Expose a TSV-serialiser to <Spreadsheet>
 */
import {
  ref,
  computed,
  provide,
  inject,
  onMounted,
  onUnmounted,
  watch,
} from "vue";

/* ── Props ─────────────────────────────────────────────────── */
const props = defineProps({
  /** Tab label */
  name: { type: String, required: true },
  /** Accent colour for this tab's dot and active top-border */
  color: { type: String, default: "" },
  /** How many data rows to freeze (sticky top) */
  freezeRows: { type: Number, default: 0 },
  /** How many data columns to freeze (sticky left) */
  freezeCols: { type: Number, default: 0 },
  /**
   * Max visible rows before vertical scroll kicks in.
   * Includes the column-header row in the count.
   */
  maxRows: { type: Number, default: 0 },
  /**
   * Max visible data columns before horizontal scroll kicks in.
   * Does NOT include the row-number column.
   */
  maxCols: { type: Number, default: 0 },
  /** Alternating row background colours */
  striped: { type: Boolean, default: false },
});

/* ── Geometry constants (kept in sync with CSS vars) ────────── */
const CELL_H = 24; // --ss-cell-height
const HEADER_H = 24; // --ss-header-height
const ROW_NUM_W = 48; // --ss-row-num-width
const DEF_COL_W = 100; // --ss-default-col-width
const EMPTY_COL_W = 18; // --ss-empty-col-width

/* ── Inject from <Spreadsheet> ─────────────────────────────── */
const registerSheet = inject("ss:registerSheet");
const unregisterSheet = inject("ss:unregisterSheet");
const activeSheet = inject("ss:activeSheet");
const registerCopyFn = inject("ss:registerCopyFn");
const config = inject("ss:config");

const isActive = computed(() => activeSheet.value === props.name);

/* ── Column definitions (populated by <SCol>) ──────────────── */
const colDefs = ref([]); // [{ width: string|null, empty: bool }]

let colDefIdCounter = 0;
const colDefIds = ref([]); // parallel id array for ordered removal

function registerColDef(def) {
  const id = ++colDefIdCounter;
  colDefs.value.push({ ...def, _id: id });
  colDefIds.value.push(id);
  return id;
}
function unregisterColDef(id) {
  const idx = colDefs.value.findIndex((d) => d._id === id);
  if (idx >= 0) colDefs.value.splice(idx, 1);
}

/* ── Row counter (monotone, reset each full remount) ─────────── */
const rowCounter = ref(0);
function getNextRowIndex(skip = 1) {
  const idx = rowCounter.value;
  rowCounter.value += skip;
  return idx;
}
// Reset when Sheet unmounts/remounts (v-if case)
onMounted(() => {
  rowCounter.value = 0;
});

/* ── Column count (inferred from widest row) ─────────────────── */
const colCount = ref(0);
function updateColCount(n) {
  if (n > colCount.value) colCount.value = n;
}

/* ── Sticky-left offset calculator for frozen columns ────────── */
function getStickyLeft(colIndex) {
  let px = ROW_NUM_W;
  for (let i = 0; i < colIndex; i++) {
    const def = colDefs.value[i];
    if (!def) {
      px += DEF_COL_W;
      continue;
    }
    if (def.empty) {
      px += EMPTY_COL_W;
      continue;
    }
    const w = def.width;
    if (w && w.endsWith("px")) {
      px += parseFloat(w);
      continue;
    }
    if (w && w.endsWith("rem")) {
      px += parseFloat(w) * 16;
      continue;
    }
    px += DEF_COL_W;
  }
  return px + "px";
}

/* ── Provide context to descendants ─────────────────────────── */
provide("ss:getNextRowIndex", getNextRowIndex);
provide("ss:registerColDef", registerColDef);
provide("ss:unregisterColDef", unregisterColDef);
provide("ss:colDefs", colDefs);
provide("ss:colCount", colCount);
provide("ss:updateColCount", updateColCount);
provide(
  "ss:freezeRows",
  computed(() => props.freezeRows),
);
provide(
  "ss:freezeCols",
  computed(() => props.freezeCols),
);
provide(
  "ss:striped",
  computed(() => props.striped),
);
provide("ss:config", config);
provide("ss:getStickyLeft", getStickyLeft);
provide("ss:CELL_H", CELL_H);
provide("ss:HEADER_H", HEADER_H);
provide("ss:ROW_NUM_W", ROW_NUM_W);
provide("ss:EMPTY_COL_W", EMPTY_COL_W);

/* ── Register with parent <Spreadsheet> ─────────────────────── */
const tableEl = ref(null);

onMounted(() => {
  registerSheet({ name: props.name, color: props.color });
  registerCopyFn(props.name, getCellsAsTSV);
});
onUnmounted(() => {
  unregisterSheet(props.name);
});

/* ── TSV serialiser ─────────────────────────────────────────── */
function getCellsAsTSV() {
  if (!tableEl.value) return "";
  const tbody = tableEl.value.querySelector("tbody");
  if (!tbody) return "";

  const rows = [];
  for (const tr of tbody.querySelectorAll("tr")) {
    if (tr.classList.contains("ss-row-empty")) continue;
    const cells = [];
    for (const td of tr.querySelectorAll("td")) {
      // Skip the row-number cell and empty-column break cells
      if (td.classList.contains("ss-row-num")) continue;
      if (td.classList.contains("ss-cell-empty-col")) continue;
      cells.push((td.textContent ?? "").trim());
    }
    if (cells.length) rows.push(cells.join("\t"));
  }
  return rows.join("\n");
}

/* ── Column-letter helper  (0→A, 25→Z, 26→AA …) ────────────── */
function colLetter(n) {
  let s = "";
  let i = n + 1;
  while (i > 0) {
    i--;
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26);
  }
  return s;
}

/* ── Computed header columns ─────────────────────────────────── */
const headerCols = computed(() => {
  if (colDefs.value.length > 0) {
    let letterIdx = 0
    return colDefs.value.map(def => {
      const isEmpty = !!def.empty
      const skip = def.skipCount || 1

      let label = ''
      if (!isEmpty) {
        label = colLetter(letterIdx)
        letterIdx++
      } else {
        // Skip the omitted columns in the header lettering
        letterIdx += skip
      }

      return {
        empty: isEmpty,
        label,
        width: isEmpty ? EMPTY_COL_W + 'px' : (def.width ?? DEF_COL_W + 'px'),
      }
    })
  }
  // Fallback: infer from widest row
  return Array.from({ length: colCount.value }, (_, i) => ({
    empty: false,
    label: colLetter(i),
    width: DEF_COL_W + 'px',
  }))
})

/* ── Scroll container max-size ──────────────────────────────── */
const scrollStyle = computed(() => {
  const s = {};
  if (props.maxRows > 0) {
    s.maxHeight = HEADER_H + props.maxRows * CELL_H + 2 + "px";
    s.overflowY = "auto";
  }
  if (props.maxCols > 0) {
    // sum widths of requested cols + row-num col
    let totalW = ROW_NUM_W + 2;
    for (let i = 0; i < props.maxCols; i++) {
      const def = colDefs.value[i];
      if (!def) totalW += DEF_COL_W;
      else if (def.empty) totalW += EMPTY_COL_W;
      else {
        const w = def.width;
        if (w && w.endsWith("px")) totalW += parseFloat(w);
        else if (w && w.endsWith("rem")) totalW += parseFloat(w) * 16;
        else totalW += DEF_COL_W;
      }
    }
    s.maxWidth = totalW + "px";
    s.overflowX = "auto";
  }
  return s;
});
</script>

<template>
  <div class="ss-sheet" v-show="isActive">
    <div class="ss-scroll-container" :style="scrollStyle">
      <table class="ss-table" ref="tableEl" style="margin: 0px">
        <!-- Column widths for table-layout:fixed -->
        <colgroup>
          <col
            :style="{ width: ROW_NUM_W + 'px', minWidth: ROW_NUM_W + 'px' }"
          />
          <col
            v-for="(col, i) in headerCols"
            :key="i"
            :style="{ width: col.width, minWidth: col.width }"
          />
        </colgroup>

        <!-- Column-letter header row (always sticky top) -->
        <thead>
          <tr class="ss-col-headers">
            <th class="ss-corner-cell" />
            <th
              v-for="(col, i) in headerCols"
              :key="i"
              :class="[
                'ss-col-header-cell',
                col.empty && 'ss-col-header-empty',
              ]"
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>

        <!-- User rows via slot -->
        <tbody>
          <slot />
        </tbody>
      </table>
    </div>
  </div>
</template>

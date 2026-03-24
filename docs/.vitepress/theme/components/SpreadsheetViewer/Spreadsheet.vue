<script setup>
/**
 * Spreadsheet.vue — root wrapper component
 *
 * Responsibilities:
 *  - Render the optional title caption
 *  - Manage which Sheet tab is active
 *  - Render the tab bar (arrows · tabs · ⊕ · Copy button)
 *  - Provide registration hooks for child <Sheet> components
 *  - Provide the merged config to the whole tree
 */
import { ref, provide, inject, computed } from 'vue'
import { defaultConfig, mergeConfig } from './defaultConfig.js'

const props = defineProps({
  /** Optional caption shown above the spreadsheet chrome */
  title: { type: String, default: '' },
})

/* ── Config ────────────────────────────────────────────────── */
const userConfig = inject('spreadsheet-config', {})
const config = computed(() => mergeConfig(defaultConfig, userConfig))

/* ── Sheet registry ────────────────────────────────────────── */
const sheets     = ref([])   // [{ name, color }]
const activeSheet = ref(null)
const copyFns     = ref({})  // name → () => string  (TSV getter)

function registerSheet(info) {
  if (!sheets.value.find(s => s.name === info.name)) {
    sheets.value.push(info)
    if (!activeSheet.value) activeSheet.value = info.name
  }
}
function unregisterSheet(name) {
  const idx = sheets.value.findIndex(s => s.name === name)
  if (idx >= 0) sheets.value.splice(idx, 1)
  if (activeSheet.value === name) {
    activeSheet.value = sheets.value[0]?.name ?? null
  }
}
function setActiveSheet(name) { activeSheet.value = name }
function registerCopyFn(name, fn) { copyFns.value[name] = fn }

provide('ss:registerSheet',   registerSheet)
provide('ss:unregisterSheet', unregisterSheet)
provide('ss:activeSheet',     activeSheet)
provide('ss:setActiveSheet',  setActiveSheet)
provide('ss:registerCopyFn',  registerCopyFn)
provide('ss:config',          config)

/* ── Tab-strip scrolling ───────────────────────────────────── */
const tabsWrapEl = ref(null)
function scrollTabs(dir) {
  tabsWrapEl.value?.scrollBy({ left: dir * 120, behavior: 'smooth' })
}

/* ── Copy to clipboard ─────────────────────────────────────── */
const copied = ref(false)
async function copyTSV() {
  const fn = copyFns.value[activeSheet.value]
  if (!fn) return
  try {
    await navigator.clipboard.writeText(fn())
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    /* clipboard permission denied — silent fail */
  }
}
</script>

<template>
  <div class="ss-root">

    <!-- Optional caption -->
    <div v-if="title" class="ss-title">{{ title }}</div>

    <!-- Sheet content (one Sheet renders per tab, v-show keeps them mounted) -->
    <div class="ss-body">
      <slot />
    </div>

    <!-- Tab bar ─────────────────────────────────────────────── -->
    <div class="ss-tabbar">

      <!-- ◀ scroll left -->
      <button class="ss-nav-btn" @click="scrollTabs(-1)" aria-label="Scroll tabs left">
        <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
          <path d="M6 1L1 5.5L6 10" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- Tab strip -->
      <div class="ss-tabs-wrap" ref="tabsWrapEl">
        <button
          v-for="sheet in sheets"
          :key="sheet.name"
          class="ss-tab"
          :class="{ 'ss-tab-active': activeSheet === sheet.name }"
          :style="sheet.color && activeSheet === sheet.name
                    ? { '--ss-tab-active-accent': sheet.color }
                    : {}"
          @click="setActiveSheet(sheet.name)"
        >
          <span
            v-if="sheet.color"
            class="ss-tab-dot"
            :style="{ background: sheet.color }"
          />
          {{ sheet.name }}
        </button>
      </div>

      <!-- ▶ scroll right -->
      <button class="ss-nav-btn" @click="scrollTabs(1)" aria-label="Scroll tabs right">
        <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
          <path d="M1 1l5 4.5L1 10" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- ⊕ decorative add-sheet button -->
      <button class="ss-add-btn" disabled aria-label="Add sheet (decorative)">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" stroke-width="1.4"/>
          <line x1="6.5" y1="3.5" x2="6.5" y2="9.5"
                stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <line x1="3.5" y1="6.5" x2="9.5" y2="6.5"
                stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </button>

      <div class="ss-tabbar-spacer" />

      <!-- Copy-to-TSV button -->
      <button
        class="ss-copy-btn"
        :class="{ 'ss-copied': copied }"
        @click="copyTSV"
        :aria-label="copied ? 'Copied to clipboard' : 'Copy sheet as TSV'"
        :title="copied ? 'Copied!' : 'Copy active sheet as tab-separated values'"
      >
        <!-- Clipboard icon -->
        <svg v-if="!copied" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="3.5" y="3.5" width="7" height="7" rx="1"
                stroke="currentColor" stroke-width="1.2"/>
          <rect x="1.5" y="1.5" width="7" height="7" rx="1"
                fill="var(--ss-bg)" stroke="currentColor" stroke-width="1.2"/>
        </svg>
        <!-- Tick icon -->
        <svg v-else width="12" height="12" viewBox="0 0 12 12" fill="none">
          <polyline points="1.5,6 4.5,9.5 10.5,2.5"
                    stroke="#22c55e" stroke-width="1.7"
                    stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>{{ copied ? 'Copied!' : 'Copy sheet' }}</span>
      </button>

    </div><!-- /tabbar -->
  </div><!-- /ss-root -->
</template>

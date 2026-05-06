import m from "mithril";
import { t, tf } from 'virtual:i18n-self';
import { loadLocales, setLocale, te } from "../i18n/index.js";
import { deriveRequiredUiLocales, resolveUiLocaleForDataLang } from "../i18n/localeLoader.js";
import "./ManageView.css";
import { marked } from "marked";

import { checkForChecklistUpdate, DOCS_URL } from "../app.js";
import { ExcelBridge } from "../components/ExcelBridge.js";
import { routeTo, isInDemoMode } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { DataManager } from "../model/DataManager.js";
import { Settings } from "../model/Settings.js";
import { Logger } from "../components/Logger.js";
import { exportTemplateSpreadsheetEmpty, exportTemplateSpreadsheetFilled } from "../model/DataManagerData.js";
import { compressor } from "../components/LZString.js";
import { DEFAULT_TOOL } from "./analysisTools/index.js";
import { DWC_ARCHIVE_TYPES } from "../model/nlDataStructureSheets.js";
import { Toast } from "./AppLayoutView.js";

const MAIN_EXAMPLE_URL = "../examples/pmp";

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

export const DEEP_LINK_STORAGE_KEY = "xlsxDeepLinkUrl";
export const DEMO_CHECKLIST_KEY = "demoChecklistData";
export let deepLinkProcessing = false;

// ─── FEATURE DETECTION ────────────────────────────────────────────────────────

/** True when the File System Access API (showOpenFilePicker) is available. */
const hasFSA = typeof window !== "undefined" &&
  typeof window.showOpenFilePicker === "function";

// ─── FILE WATCHING (internal helpers declared before ManageStore) ──────────────

function stopFileWatch() {
  if (ManageStore._watchInterval) {
    clearInterval(ManageStore._watchInterval);
    ManageStore._watchInterval = null;
  }
  if (ManageStore._watchDebounce) {
    clearTimeout(ManageStore._watchDebounce);
    ManageStore._watchDebounce = null;
  }
}

function startFileWatch() {
  if (!hasFSA || !ManageStore.fileHandle) return;
  stopFileWatch();

  ManageStore._watchInterval = setInterval(async () => {
    // Never interrupt an active compilation pass.
    if (ManageStore.phase === "loading" || ManageStore.phase === "dwc_loading") return;
    try {
      const perm = await ManageStore.fileHandle.queryPermission({ mode: "read" });
      if (perm !== "granted") { stopFileWatch(); return; }
      const file = await ManageStore.fileHandle.getFile();
      if (
        ManageStore._watchLastModified !== null &&
        file.lastModified > ManageStore._watchLastModified
      ) {
        ManageStore._watchLastModified = file.lastModified;
        clearTimeout(ManageStore._watchDebounce);
        ManageStore._watchDebounce = setTimeout(autoRebuildFromHandle, 1000);
      }
    } catch (_e) {
      // Handle lost or revoked by stopping silently.
      stopFileWatch();
    }
  }, 2000);
}

async function autoRebuildFromHandle() {
  if (!ManageStore.fileHandle) return;
  try {
    const file = await ManageStore.fileHandle.getFile();
    Toast.show(t("auto_rebuild_triggered"), { timeout: 3000 });
    m.redraw();
    await processFileObject(file, ManageStore.checkAssetsSize);
  } catch (_e) {
    stopFileWatch();
    m.redraw();
  }
}

// ─── STATE STORE ──────────────────────────────────────────────────────────────

/**
 * Single source of truth for the entire ManageView workflow.
 *
 * Phases:
 *   source      – picking a file or URL (initial state)
 *   loading     – compiling the spreadsheet
 *   dwc_loading – compiling the DwC archive
 *   dirty       – compilation finished with errors
 *   ready       – compilation succeeded; publish options shown
 *   done        – update published successfully
 */
const ManageStore = {
  phase: "source",

  // ── Source
  sourceMode: Settings.manageUploadMode() || "file",  // "file" | "url"

  // ── File source (FSA path)
  fileHandle: null,   // FileSystemFileHandle
  fileHandleName: null,   // String
  _watchInterval: null,
  _watchDebounce: null,
  _watchLastModified: null,

  // ── Options
  checkAssetsSize: true,

  // ── URL source
  urlInputValue: Settings.spreadsheetUrl() || "",
  corsWarningAcknowledged: false,

  // ── Compiled artefacts
  dataman: null,
  dwcAutoRecompile: false,
  isDwcProcessing: false,

  // ── Publishing
  isCompilingDownload: false,
  isPublishing: false,
  pubError: null,   // { message, code } | null

  // ── Server
  shouldShowUploadForm: Settings.lastKnownUploadFormAvailability(),

  // ── Templates section (collapsed for returning users, expanded for first-timers)
  templatesExpanded: false,

  // ── Logger observer handle
  loggerObserver: null,

  // ────────────────────────────────────────────────────────────────────────────

  reset() {
    stopFileWatch();
    this.dataman = null;
    this.isDwcProcessing = false;
    this.dwcAutoRecompile = false;
    this.pubError = null;
    this.isPublishing = false;
    try { LogsPanel.expandedGroups.clear(); } catch (_e) { /* noop */ }
  },

  setSourceMode(mode) {
    this.sourceMode = mode;
    this.corsWarningAcknowledged = false;
    Settings.manageUploadMode(mode);
  },

  async checkPHPPresent() {
    try {
      const res = await fetch("../update.php?ping");
      const json = await res.json();
      const online = json.state === "online";
      this.shouldShowUploadForm = online;
      Settings.lastKnownUploadFormAvailability(online);
    } catch (_e) {
      this.shouldShowUploadForm = false;
    }
    m.redraw();
  },
};

// ─── PIPELINE ─────────────────────────────────────────────────────────────────

/** Read a File object and feed it into the build pipeline. */
async function processFileObject(file, checkAssetsSize) {
  if (!file || !file.name) {
    Logger.error(t("chose_a_file"));
    return;
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    Logger.error(t("wrong_filetype"));
    return;
  }

  // Capture DwC flag before resetting dataman.
  const shouldAutoRedwc =
    ManageStore.dataman &&
    typeof ManageStore.dataman.isDwcCompiled === "function" &&
    ManageStore.dataman.isDwcCompiled();

  ManageStore.reset();
  ManageStore.dwcAutoRecompile = shouldAutoRedwc;
  ManageStore.phase = "loading";
  m.redraw();

  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

  setTimeout(() => _runPipeline(buffer, checkAssetsSize), 50);
}

/**
 * Core build pipeline: parse → compile → optionally route to DwC.
 * onSuccess is used only by the deep-link flow to redirect to /checklist.
 */
async function _runPipeline(buffer, checkAssetsSize, onSuccess, isDemo = false) {
  ManageStore.dataman = new DataManager();
  ManageStore.dataman.loadData(new ExcelBridge(buffer), checkAssetsSize);
  const compiled = ManageStore.dataman.getCompiledChecklist();

  if (Logger.hasErrors()) {
    ManageStore.dwcAutoRecompile = false;
    deepLinkProcessing = false;
    ManageStore.phase = "dirty";
    startFileWatch();
    m.redraw();
    return;
  }

  if (isDemo) {
    try {
      sessionStorage.setItem(
        DEMO_CHECKLIST_KEY,
        compressor.compress(JSON.stringify(compiled))
      );
    } catch (_e) { /* noop */ }
  }
  Checklist.loadData(compiled, isDemo ? false : true);
  const requiredLocales = deriveRequiredUiLocales(Checklist);
  await loadLocales(requiredLocales);
  setLocale(resolveUiLocaleForDataLang(Settings.language(), Checklist));
  Checklist.getTaxaForCurrentQuery();

  if (ManageStore.dwcAutoRecompile) {
    ManageStore.dwcAutoRecompile = false;
    setTimeout(_runDwcPipeline, 0);
  } else {
    const next = onSuccess ?? (() => {
      ManageStore.phase = "ready";
      startFileWatch();
      m.redraw();
    });
    setTimeout(next, 0);
  }
}

/** Compile only the DwC archive on the already-loaded DataManager. */
async function _runDwcPipeline() {
  if (!ManageStore.dataman) return;
  ManageStore.isDwcProcessing = true;
  ManageStore.phase = "dwc_loading";
  Logger.clearGroup(/$DwC Archive/);
  m.redraw();

  await new Promise((r) => setTimeout(r, 50));

  try {
    await ManageStore.dataman.compileDwcArchiveAsync();
  } catch (ex) {
    Logger.error("DwC compilation threw an unexpected error: " + ex.message, "DwC Archive");
  }

  ManageStore.isDwcProcessing = false;
  ManageStore.phase = "ready";
  startFileWatch();
  m.redraw();
}

/** Fetch a spreadsheet by URL and run the build pipeline. */
async function fetchAndProcessUrl(url, checkAssetsSize, onSuccess, isDemo = false) {
  url = url && url.trim();
  if (!url) { Logger.error(t("url_required")); return; }
  try { new URL(url); } catch (_e) { Logger.error(t("url_invalid")); return; }

  const shouldAutoRedwc =
    ManageStore.dataman &&
    typeof ManageStore.dataman.isDwcCompiled === "function" &&
    ManageStore.dataman.isDwcCompiled();

  ManageStore.reset();
  ManageStore.dwcAutoRecompile = shouldAutoRedwc;
  ManageStore.phase = "loading";
  m.redraw();

  let buffer;
  try {
    let res;
    if (ManageStore.shouldShowUploadForm) {
      Logger.info(t("url_fetching_via_proxy"));
      const body = new FormData();
      body.append("url", url);
      res = await fetch("../update.php?proxy", { method: "POST", body, cache: "no-store" });
    } else {
      Logger.warning(t("url_fetching_direct"));
      const bust = url + (url.includes("?") ? "&" : "?") + "_cb=" + Date.now();
      res = await fetch(bust, { mode: "cors", cache: "reload" });
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    buffer = await res.arrayBuffer();
  } catch (ex) {
    Logger.error(t("url_fetch_failed") + (ex.message ? " (" + ex.message + ")" : ""));
    ManageStore.phase = "dirty";
    m.redraw();
    return;
  }

  const sig = new Uint8Array(buffer, 0, 4);
  if (sig[0] !== 0x50 || sig[1] !== 0x4B) {
    Logger.error(t("wrong_filetype"));
    ManageStore.phase = "dirty";
    m.redraw();
    return;
  }

  setTimeout(() => _runPipeline(buffer, checkAssetsSize, onSuccess, isDemo), 50);
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function downloadCompiledData(blob, fileName) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Detect Google Drive / Sheets / Dropbox sharing links that need rewriting
 * into direct download URLs before they can be fetched as .xlsx files.
 */
function detectCloudShareLink(raw) {
  const url = raw && raw.trim();
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const host = parsed.hostname.toLowerCase();

  if (host === "docs.google.com" && parsed.pathname.includes("/spreadsheets/d/")) {
    if (parsed.pathname.endsWith("/export") || parsed.pathname.includes("/export?")) return null;
    const m2 = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!m2) return null;
    return {
      messageKey: "url_convert_gdrive_sheets",
      convert: () => `https://docs.google.com/spreadsheets/d/${m2[1]}/export?format=xlsx`,
    };
  }
  if (host === "drive.google.com") {
    if (parsed.pathname === "/uc" && parsed.searchParams.get("export") === "download") return null;
    const m2 = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    const fid = (m2 && m2[1]) || parsed.searchParams.get("id");
    if (!fid) return null;
    return {
      messageKey: "url_convert_gdrive_file",
      convert: () => `https://drive.google.com/uc?export=download&id=${fid}`,
    };
  }
  if (
    (host === "www.dropbox.com" || host === "dropbox.com") &&
    !host.includes("dropboxusercontent")
  ) {
    if (parsed.searchParams.get("dl") === "1") return null;
    return {
      messageKey: "url_convert_dropbox",
      convert: (orig) => {
        const u = new URL(orig.trim());
        u.searchParams.set("dl", "1");
        return u.toString();
      },
    };
  }
  return null;
}

// ─── ACTION BUTTON ────────────────────────────────────────────────────────────

const ActionButton = {
  view({ attrs }) {
    const { label, onclick, primary, secondary, small, icon, background, loading, block } = attrs;
    const cls = [
      "manage-btn",
      primary ? "manage-btn-primary" : "",
      secondary ? "manage-btn-secondary" : "",
      small ? "manage-btn-small" : "",
      block ? "manage-btn-block" : "",
    ].filter(Boolean).join(".");
    const style = background ? "[style=background-color: " + background + ";]" : "";
    return m(
      "button." + cls + style,
      { onclick, disabled: !!loading },
      [
        loading ? m("span.manage-btn-spinner") : (icon ? m("img.manage-btn-icon", { src: icon }) : null),
        label,
      ]
    );
  },
};

// ─── LOGS PANEL ───────────────────────────────────────────────────────────────

const LogsPanel = {
  expandedGroups: new Set(),

  toggleGroup(id) {
    this.expandedGroups.has(id) ? this.expandedGroups.delete(id) : this.expandedGroups.add(id);
  },

  view() {
    const messages = Logger.getMessagesForDisplay();
    const counts = Logger.getCounts();
    const hasMessages = messages.length > 0;
    const errCount = counts.critical + counts.error;
    const warnCount = counts.warning;

    // Group messages by groupTitle+level.
    const groupMap = new Map();
    const ungrouped = [];
    let gid = 0;

    messages.forEach((msg) => {
      if (!msg.groupTitle) { ungrouped.push(msg); return; }
      const key = msg.groupTitle + "|" + msg.level;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          id: gid++, title: msg.groupTitle, messages: [],
          counts: { critical: 0, error: 0, warning: 0, info: 0 },
        });
      }
      const g = groupMap.get(key);
      g.messages.push(msg);
      g.counts[msg.level]++;
    });

    function worstLevel(c) {
      if (c.critical > 0) return "critical";
      if (c.error > 0) return "error";
      if (c.warning > 0) return "warning";
      return "info";
    }

    function renderItem(item) {
      return m(".manage-log-item." + item.level, { key: item.message }, [
        m(".manage-log-content", [
          m("span.manage-log-level", t("log_" + item.level)),
          m("span.manage-log-message", m.trust(item.message)),
        ]),
      ]);
    }

    function renderGroup(group) {
      const expanded = LogsPanel.expandedGroups.has(group.id);
      const worst = worstLevel(group.counts);
      const ec = group.counts.critical + group.counts.error;
      const wc = group.counts.warning;

      return m(".manage-log-group." + worst, { key: group.id }, [
        m(".manage-log-group-header", {
          onclick: () => { LogsPanel.toggleGroup(group.id); },
          title: group.title,
        }, [
          m("span.manage-log-group-toggle", expanded ? "▾" : "▸"),
          m("span.manage-log-group-title", t("log_" + group.messages[0].level) + " - " + group.title),
          m(".manage-log-group-categories", [
            ec > 0 ? m("span.manage-logs-count.manage-logs-count--error", ec) : null,
            wc > 0 ? m("span.manage-logs-count.manage-logs-count--warning", wc) : null,
            ec === 0 && wc === 0
              ? m("span.manage-logs-count.manage-logs-count--total", group.messages.length)
              : null,
          ]),
        ]),
        expanded ? m(".manage-log-group-body", group.messages.map(renderItem)) : null,
      ]);
    }

    return m(".manage-log-zone-inner", [
      m(".manage-log-header", [
        m("span.manage-log-title", t("log_messages")),
        hasMessages ? m(".manage-logs-counts", [
          errCount > 0 ? m("span.manage-logs-count.manage-logs-count--error", errCount + " " + t("log_error", errCount)) : null,
          warnCount > 0 ? m("span.manage-logs-count.manage-logs-count--warning", warnCount + " " + t("log_warning", warnCount)) : null,
        ]) : null,
      ]),
      hasMessages
        ? m(".manage-log-list", [
          ...Array.from(groupMap.values()).map(renderGroup),
          ...ungrouped.map(renderItem),
        ])
        : m(".manage-log-empty", t("log_no_messages")),
    ]);
  },
};

// ─── SOURCE CHIP ──────────────────────────────────────────────────────────────

/**
 * Compact header shown once a source has been chosen.
 * Displayed at the top of all phases except "source".
 */
function renderSourceChip() {
  const isFile = ManageStore.sourceMode === "file";
  const hasHandle = hasFSA && !!ManageStore.fileHandle;
  const rawName = isFile ? (ManageStore.fileHandleName || "") : ManageStore.urlInputValue;
  // No manual truncation - CSS handles overflow from the start via direction:rtl trick.

  const statusText = isFile
    ? (hasHandle ? t("file_tracking_active") : t("file_tracking_inactive"))
    : t("url_will_need_reload");

  function handleRebuildClick() {
    if (isFile) {
      if (hasHandle) {
        autoRebuildFromHandle();
      } else {
        document.getElementById("manage-fallback-rebuild")?.click();
      }
    } else {
      const url = ManageStore.urlInputValue;
      Settings.spreadsheetUrl(url);
      fetchAndProcessUrl(url, ManageStore.checkAssetsSize);
    }
  }

  function handleChangeClick() {
    ManageStore.reset();
    ManageStore.fileHandle = null;
    ManageStore.fileHandleName = null;
    ManageStore._watchLastModified = null;
    ManageStore.phase = "source";
    m.redraw();
  }

  return m(".manage-source-chip", [
    m("span.manage-source-chip-name", { title: rawName }, rawName),
    m("span.manage-source-chip-status", statusText),
    m(".manage-source-chip-actions", [
      m(ActionButton, {
        label: isFile ? t("rebuild_now") : t("reload_from_url"),
        small: true,
        block: true,
        onclick: handleRebuildClick,
      }),
      m("button.manage-btn.manage-btn-small.manage-btn-block.manage-btn-secondary", {
        onclick: handleChangeClick,
      }, t("back_to_source")),
    ]),
    // Hidden file input for fallback rebuilds (no FSA).
    (!hasHandle && isFile)
      ? m("input[type=file][id=manage-fallback-rebuild][accept=.xlsx][style=display:none]", {
        onchange: async function (e) {
          const file = e.target.files[0];
          this.value = "";
          if (!file) return;
          ManageStore.fileHandleName = file.name;
          await processFileObject(file, ManageStore.checkAssetsSize);
        },
      })
      : null,
  ]);
}

// ─── TEMPLATES SECTION ────────────────────────────────────────────────────────

function renderTemplates() {
  const isDataReady = Checklist._isDataReady;

  const bodyContent = [
    !isDataReady
      ? m("p.manage-templates-intro", t("starting_from_scratch_links"))
      : null,
    m(ActionButton, { label: t("download_blank_sheet_button"), onclick: exportTemplateSpreadsheetEmpty, block: true }),
    m(".manage-btn-gap"),
    m(ActionButton, { label: t("download_filled_sheet_button"), onclick: exportTemplateSpreadsheetFilled, block: true }),
    m(".manage-btn-gap"),
    m(ActionButton, {
      label: m.trust(t("open_documentation")),
      onclick: () => window.open(DOCS_URL, "_blank"),
      block: true,
      primary: true
    }),
  ];

  if (!isDataReady) {
    // First-time user: show always expanded, no toggle header.
    return m(".manage-templates.manage-templates--open", bodyContent);
  }

  // Returning user: full-width collapsible strip.
  const isExpanded = ManageStore.templatesExpanded;
  return m(".manage-templates.manage-templates--collapsible", [
    m("button.manage-templates-toggle", {
      onclick: () => { ManageStore.templatesExpanded = !isExpanded; },
    }, [
      m("span", t("templates_section_title")),
      m("span.manage-templates-arrow", isExpanded ? "▾" : "▸"),
    ]),
    isExpanded ? m(".manage-templates-body", bodyContent) : null,
  ]);
}

// ─── PHASE RENDERERS ──────────────────────────────────────────────────────────

function renderSourcePicker() {
  const mode = ManageStore.sourceMode;
  const isDataReady = Checklist._isDataReady;

  const demoCard = isInDemoMode && !isDataReady
    ? m(".manage-demo-card", [
      m("p", t("demo_card_description")),
      m(ActionButton, {
        label: t("demo_card_btn_main"),
        primary: true,
        block: true,
        onclick: () => { window.location.href = MAIN_EXAMPLE_URL; },
      }),
      m(".manage-btn-gap"),
      m(ActionButton, {
        label: t("demo_card_btn"),
        block: true,
        onclick: () => { window.location.href = "../examples"; },
      }),
    ])
    : null;

  return [
    demoCard,
    renderTemplates(),
    m(".manage-source-panel", [
      m(".manage-source-tabs", [
        m("button.manage-tab" + (mode === "file" ? ".active" : ""), {
          onclick: () => ManageStore.setSourceMode("file"),
        }, t("upload_file_tab")),
        m("button.manage-tab" + (mode === "url" ? ".active" : ""), {
          onclick: () => ManageStore.setSourceMode("url"),
        }, t("load_from_url_tab")),
      ]),
      mode === "file" ? renderFilePicker() : renderUrlPicker(),
    ]),
  ];
}

// ── File picker ───────────────────────────────────────────────────────────────

function renderFilePicker() {
  function pd(e) { e.preventDefault(); e.stopPropagation(); }

  async function handleFSAPick() {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: "Excel Spreadsheet",
          accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
        }],
        multiple: false,
      });
      const file = await handle.getFile();
      ManageStore.fileHandle = handle;
      ManageStore.fileHandleName = file.name;
      ManageStore._watchLastModified = file.lastModified;
      ManageStore.checkAssetsSize = document.getElementById("manage-check-assets")?.checked ?? true;
      await processFileObject(file, ManageStore.checkAssetsSize);
    } catch (e) {
      if (e.name !== "AbortError") Logger.error(t("network_error"));
    }
  }

  async function handleDrop(e) {
    pd(e);
    document.getElementById("manage-dropzone")?.classList.remove("entered");

    // Try to get a FileSystemFileHandle from the drag event (where supported).
    if (hasFSA && e.dataTransfer.items?.[0]?.getAsFileSystemHandle) {
      try {
        const handle = await e.dataTransfer.items[0].getAsFileSystemHandle();
        if (handle?.kind === "file") {
          const file = await handle.getFile();
          ManageStore.fileHandle = handle;
          ManageStore.fileHandleName = file.name;
          ManageStore._watchLastModified = file.lastModified;
          ManageStore.checkAssetsSize = document.getElementById("manage-check-assets")?.checked ?? true;
          await processFileObject(file, ManageStore.checkAssetsSize);
          return;
        }
      } catch (_e) { /* Fall through to plain File path */ }
    }

    const file = e.dataTransfer.files[0];
    if (!file) return;
    ManageStore.fileHandle = null;
    ManageStore.fileHandleName = file.name;
    ManageStore._watchLastModified = null;
    ManageStore.checkAssetsSize = document.getElementById("manage-check-assets")?.checked ?? true;
    await processFileObject(file, ManageStore.checkAssetsSize);
  }

  return [
    m(".manage-dropzone#manage-dropzone", {
      ondrag: pd,
      ondragstart: pd,
      ondragend: (e) => { pd(e); document.getElementById("manage-dropzone")?.classList.remove("entered"); },
      ondragover: (e) => { pd(e); document.getElementById("manage-dropzone")?.classList.add("entered"); },
      ondragenter: (e) => { pd(e); document.getElementById("manage-dropzone")?.classList.add("entered"); },
      ondragleave: (e) => { pd(e); document.getElementById("manage-dropzone")?.classList.remove("entered"); },
      ondrop: handleDrop,
    }, [
      m(".manage-dropzone-content", [
        m("img.manage-dropzone-icon", { src: "img/ui/manage/upload.svg" }),
        m(".manage-dropzone-text", [
          hasFSA
            ? m("button.manage-btn.manage-btn-primary", { onclick: handleFSAPick }, t("click_to_upload"))
            : m("label.manage-btn.manage-btn-primary[for=manage-file-input]", t("click_to_upload")),
          m("span.manage-dropzone-or", t("or_drag_it")),
        ]),
        !hasFSA
          ? m("input[type=file][id=manage-file-input][accept=.xlsx][style=display:none]", {
            onchange: async function (e) {
              const file = e.target.files[0];
              this.value = "";
              if (!file) return;
              ManageStore.fileHandle = null;
              ManageStore.fileHandleName = file.name;
              ManageStore._watchLastModified = null;
              ManageStore.checkAssetsSize = document.getElementById("manage-check-assets")?.checked ?? true;
              await processFileObject(file, ManageStore.checkAssetsSize);
            },
          })
          : null,
      ]),
    ]),
    m(".manage-assets-check", [
      m("label.manage-checkbox", [
        m("input[type=checkbox][id=manage-check-assets]", {
          checked: ManageStore.checkAssetsSize,
          onchange: (e) => { ManageStore.checkAssetsSize = e.target.checked; },
        }),
        m("span", t("check_assets_size1")),
      ]),
      m("p.manage-hint-muted", t("check_assets_size2")),
    ]),
  ];
}

// ── URL picker ────────────────────────────────────────────────────────────────

function renderUrlPicker() {
  const isStatic = !ManageStore.shouldShowUploadForm;

  if (isStatic && !ManageStore.corsWarningAcknowledged) {
    return m(".manage-cors-notice", [
      m("p.manage-cors-notice-text", m.trust(t("static_hosting_cors_notice"))),
      m(ActionButton, {
        label: t("static_hosting_cors_acknowledge"),
        primary: true,
        block: true,
        onclick: () => { ManageStore.corsWarningAcknowledged = true; },
      }),
    ]);
  }

  const conversion = detectCloudShareLink(ManageStore.urlInputValue);

  return m(".manage-url-picker", [
    isStatic ? m("p.manage-hint-warning", t("static_hosting_cors_reminder")) : null,
    m(".manage-form-group", [
      m("label[for=manage-url-input]", t("spreadsheet_url_label")),
      m("input[type=url][id=manage-url-input][autocomplete=url]", {
        value: ManageStore.urlInputValue,
        placeholder: "https://example.com/my-checklist.xlsx",
        oninput: (e) => { ManageStore.urlInputValue = e.target.value; },
      }),
    ]),
    conversion
      ? m(".manage-url-convert-notice", [
        m("span.manage-url-convert-notice-text", t(conversion.messageKey)),
        m(ActionButton, {
          label: t("url_convert_button"),
          small: true,
          onclick: () => {
            ManageStore.urlInputValue = conversion.convert(ManageStore.urlInputValue);
            Settings.spreadsheetUrl(ManageStore.urlInputValue);
          },
        }),
      ])
      : null,
    m("p.manage-hint-muted", t("url_public_hint")),
    m(".manage-assets-check", [
      m("label.manage-checkbox", [
        m("input[type=checkbox][id=manage-check-assets-url]", {
          checked: ManageStore.checkAssetsSize,
          onchange: (e) => { ManageStore.checkAssetsSize = e.target.checked; },
        }),
        m("span", t("check_assets_size1")),
      ]),
    ]),
    m(ActionButton, {
      label: t("load_from_url_button"),
      primary: true,
      block: true,
      onclick: () => {
        const url = ManageStore.urlInputValue.trim();
        Settings.spreadsheetUrl(url);
        fetchAndProcessUrl(url, ManageStore.checkAssetsSize);
      },
    }),
  ]);
}

// ── Processing ────────────────────────────────────────────────────────────────

function renderProcessing() {
  const isDwc = ManageStore.isDwcProcessing || ManageStore.phase === "dwc_loading";
  return [
    renderSourceChip(),
    m(".manage-processing", [
      m(".manage-spinner"),
      m("p.manage-processing-title", isDwc ? t("dwc_compiling") : t("data_upload_processing")),
      m("p.manage-hint-muted", isDwc ? t("dwc_compiling_hint") : t("this_may_take_time")),
    ]),
  ];
}

// ── Dirty (errors) ────────────────────────────────────────────────────────────

function renderDirtyResult() {
  const isFile = ManageStore.sourceMode === "file";
  const hasHandle = hasFSA && !!ManageStore.fileHandle;

  const guidance = isFile && hasHandle ? t("result_dirty_file_tracking")
    : isFile ? t("result_dirty_file_fallback")
      : t("result_dirty_url");

  return [
    renderSourceChip(),
    m(".manage-result-block.manage-result-block--dirty", [
      m("p.manage-result-title", t("result_dirty_title")),
      m("p", guidance),
    ]),
  ];
}

// ── Ready ─────────────────────────────────────────────────────────────────────

function renderReadyResult() {
  const hasDwc = ManageStore.dataman && typeof ManageStore.dataman.hasDwcTable === "function" ? ManageStore.dataman.hasDwcTable() : false;
  const compiled = ManageStore.dataman && typeof ManageStore.dataman.isDwcCompiled === "function" ? ManageStore.dataman.isDwcCompiled() : false;
  const dwcResult = compiled ? ManageStore.dataman.getDwcArchive() : null;

  const dwcHasErrors = compiled && Logger.getMessagesForDisplay().some(
    (msg) => (msg.level === "error" || msg.level === "critical") &&
      msg.groupTitle && msg.groupTitle.startsWith("DwC Archive")
  );
  const dwcSucceeded = compiled && !dwcHasErrors;

  return [
    renderSourceChip(),

    m(".manage-result-block.manage-result-block--ok", [
      m("p.manage-result-title", t("result_ok_title")),
      m("p", t("result_ok_intro")),
    ]),

    renderPublishSection(),
    
    hasDwc ? renderDwcSection(compiled, dwcHasErrors, dwcSucceeded, dwcResult) : null,
  ];
}

// ── DwC section ───────────────────────────────────────────────────────────────

function renderDwcSection(dwcCompiled, dwcHasErrors, dwcSucceeded, dwcResult) {
  return m(".manage-dwc-section", [
    m("h4.manage-section-title", t("dwc_section_title")),

    !dwcCompiled ? m(".manage-dwc-panel", [
      m("p", t("dwc_export_configured")),
      m("p.manage-hint-muted", t("dwc_compile_invitation")),
      m(ActionButton, {
        label: t("compile_dwc_export"),
        block: true,
        onclick: _runDwcPipeline,
      }),
    ]) : null,

    dwcHasErrors ? m(".manage-dwc-panel", [
      m("p.manage-hint-error", t("dwc_export_has_errors")),
      m("p.manage-hint-muted", t("dwc_rebuild_after_errors")),
      m(ActionButton, {
        label: t("dwc_retry"),
        block: true,        
        onclick: _runDwcPipeline,
      }),
    ]) : null,

    dwcSucceeded ? m(".manage-dwc-panel", [
      m("p.manage-hint-success", t("dwc_export_ready")),
      m(".manage-actions",
        Object.entries(DWC_ARCHIVE_TYPES)
          .filter(([archiveType]) => dwcResult && dwcResult[archiveType])
          .map(([archiveType, typeConfig]) =>
            m(ActionButton, {
              key: archiveType,
              label: t("download_dwc_" + archiveType),
              icon: "img/ui/manage/download.svg",
              block: true,
              onclick: () => downloadCompiledData(dwcResult[archiveType], typeConfig.zipFileName),
            })
          )
      ),
    ]) : null,
  ]);
}

// ── Publish section ───────────────────────────────────────────────────────────

function renderPublishSection() {
  if (ManageStore.pubError) {
    return m(".manage-publish-section", [
      m("h4.manage-section-title", t("error_publishing")),
      m("p.manage-hint-error",
        ManageStore.pubError.code && te(ManageStore.pubError.code)
          ? t(ManageStore.pubError.code)
          : ManageStore.pubError.message
      ),
      m(ActionButton, {
        label: t("back_to_upload_after_error"),
        secondary: true,
        block: true,
        onclick: () => { ManageStore.pubError = null; },
      }),
    ]);
  }

  return m(".manage-publish-section", [
    ManageStore.shouldShowUploadForm ||true
      ? m(".manage-publish-option", [
        m("h4.manage-section-title", t("data_upload_integrate_data")),
        m("p", t("enter_creds_to_publish")),
        renderServerUploadForm(),
      ])
      : null,

    m(".manage-publish-option", [
      m("h4.manage-section-title", t("download_data")),
      m(".manage-publish-description", m.trust(marked.parse(t("download_for_manual_update")))),
      m(ActionButton, {
        label: t("download_checklist"),
        primary: true,
        block: true,
        loading: ManageStore.isCompilingDownload,
        onclick: function () {
          ManageStore.isCompilingDownload = true;
          setTimeout(() => {
            const json = ManageStore.dataman.getCompiledChecklist();
            const blob = new Blob(
              [compressor.compress(JSON.stringify(json))],
              { type: "application/json;charset=utf-8" }
            );
            downloadCompiledData(blob, "checklist.json");
            ManageStore.isCompilingDownload = false;
            m.redraw();
          }, 50);
        },
      }),
    ]),
  ]);
}

// ── Server upload form ────────────────────────────────────────────────────────

function renderServerUploadForm() {
  return m("form#updateform.manage-form", {
    onsubmit(e) {
      e.preventDefault();
      e.stopPropagation();
      ManageStore.isPublishing = true;
      m.redraw();

      const formData = new FormData(this);
      const compressed = compressor.compress(JSON.stringify(ManageStore.dataman.getCompiledChecklist()));
      formData.append("checklist_data", compressed);

      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        ManageStore.isPublishing = false;

        if (xhr.status === 200) {
          let result;
          try {
            if (
              xhr.responseText.includes("POST Content-Length") &&
              xhr.responseText.includes("exceeds")
            ) throw "the POST Content-Length exceeds the limit";
            try { result = JSON.parse(xhr.responseText); }
            catch { throw "incorrect server response. If you are using static web hosting, you need to upload the checklist.json manually."; }
          } catch (ex) {
            result = {
              state: "error",
              details: t("server_returned_odd_message") + " " + t("server_returned_odd_message_details") + ex,
            };
          }
          if (result.state === "success") {
            ManageStore.phase = "done";
          } else {
            ManageStore.pubError = { message: result.details, code: result.messageCode || "" };
          }
        } else {
          let parsed;
          try { parsed = JSON.parse(xhr.responseText); } catch { /* noop */ }
          const msg = (parsed?.details) ? parsed.details
            : (xhr.statusText.toLowerCase() === "not found" ? t("upload_disabled") : t("network_error") + " " + xhr.statusText);
          ManageStore.pubError = { message: msg, code: (parsed?.messageCode) || "" };
        }
        m.redraw();
      };
      xhr.open("POST", "./update.php");
      xhr.send(formData);
    },
  }, [
    m(".manage-form-group", [
      m("label[for=username]", t("user_name")),
      m("input[type=text][name=username][id=username]"),
    ]),
    m(".manage-form-group", [
      m("label[for=password]", t("password")),
      m("input[type=password][name=password][id=password]"),
    ]),
    m(ActionButton, {
      label: t("publish_checklist"),
      primary: true,
      block: true,
      loading: ManageStore.isPublishing,
      onclick: (e) => { e.preventDefault(); document.getElementById("updateform").requestSubmit(); },
    }),
  ]);
}

// ── Done ──────────────────────────────────────────────────────────────────────

function renderDone() {
  return m(".manage-done", [
    m("p.manage-done-title", t("done")),
    m("p", t("update_published")),
    m(ActionButton, {
      label: t("manage_back_to_search"),
      primary: true,
      block: true,
      onclick: function () {
        Checklist._isDraft = false;
        if (navigator.serviceWorker?.controller) {
          checkForChecklistUpdate(navigator.serviceWorker.controller);
        }
        ManageStore.reset();
        ManageStore.phase = "source";
        routeTo("/checklist");
      },
    }),
  ]);
}

// ── Workflow dispatcher ───────────────────────────────────────────────────────

function renderWorkflow() {
  switch (ManageStore.phase) {
    case "source":
      return renderSourcePicker();
    case "loading":
    case "dwc_loading":
      return renderProcessing();
    case "dirty":
      return renderDirtyResult();
    case "ready":
      return renderReadyResult();
    case "done":
      return renderDone();
    default:
      return renderSourcePicker();
  }
}

// ─── DEEP-LINK CAPTURE ────────────────────────────────────────────────────────

/**
 * Called once at module load.
 * Extracts xlsxUrl from the raw hash and stores it in sessionStorage before
 * Mithril can rewrite the URL.  Reloads if the SW is already controlling the
 * page; otherwise lets the controllerchange handler in app.js take care of it.
 */
function captureDeepLinkAndReloadIfNeeded() {
  if (sessionStorage.getItem(DEEP_LINK_STORAGE_KEY)) return false;
  const hash = window.location.hash;
  const match = hash.match(/[?&]xlsxUrl=([^&]*)/);
  if (!match) return false;

  const rawUrl = decodeURIComponent(match[1]);
  const redirectMatch = hash.match(/[?&]redirectHash=([^&]*)/);
  const redirectHash = redirectMatch ? decodeURIComponent(redirectMatch[1]) : null;

  sessionStorage.setItem(DEEP_LINK_STORAGE_KEY, rawUrl);
  sessionStorage.setItem(DEEP_LINK_STORAGE_KEY + "_href", window.location.href);
  if (redirectHash) sessionStorage.setItem(DEEP_LINK_STORAGE_KEY + "_redirectHash", redirectHash);

  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    window.location.href = window.location.href;
    return true;
  }
  return false;
}
captureDeepLinkAndReloadIfNeeded();

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export let ManageView = {

  /**
   * Deep-link handler: if a xlsxUrl was captured in sessionStorage, start the
   * pipeline immediately and redirect to /checklist on success.
   */
  oninit(vnode) {
    const storedUrl = sessionStorage.getItem(DEEP_LINK_STORAGE_KEY);
    const routeParam = m.route.param("xlsxUrl");
    const xlsxUrl = storedUrl || routeParam;
    if (!xlsxUrl) return;

    const redirectHash = storedUrl
      ? sessionStorage.getItem(DEEP_LINK_STORAGE_KEY + "_redirectHash")
      : m.route.param("redirectHash") || null;

    if (storedUrl) {
      sessionStorage.removeItem(DEEP_LINK_STORAGE_KEY);
      sessionStorage.removeItem(DEEP_LINK_STORAGE_KEY + "_href");
      sessionStorage.removeItem(DEEP_LINK_STORAGE_KEY + "_redirectHash");
    }

    deepLinkProcessing = true;
    ManageStore.urlInputValue = xlsxUrl;
    ManageStore.setSourceMode("url");
    Settings.spreadsheetUrl(xlsxUrl);

    fetchAndProcessUrl(xlsxUrl, true, () => {
      deepLinkProcessing = false;
      if (redirectHash) {
        const params = Object.fromEntries(
          redirectHash.split("&").map((pair) => {
            const [k, v = ""] = pair.split("=");
            return [decodeURIComponent(k), decodeURIComponent(v)];
          })
        );
        if (params.v) Settings.viewType(params.v);
        if (params.s) Settings.analyticalIntent(params.s);
        ManageStore.setSourceMode("file");
        m.route.set("/checklist", params, { replace: true });
      } else {
        Settings.viewType(DEFAULT_TOOL);
        ManageStore.setSourceMode("file");
        m.route.set("/checklist", { v: DEFAULT_TOOL }, { replace: true });
      }
    }, true);
  },

  oncreate() {
    ManageStore.checkPHPPresent();

    if (!ManageStore.loggerObserver) {
      ManageStore.loggerObserver = () => m.redraw();
    }
    Logger.addObserver(ManageStore.loggerObserver);

    // Make the wrapper a proper flex container so the two-zone layout works.
    document.querySelector(".interaction-area")?.classList.add("manage-layout-active");

    // Restart file watcher if the user navigated away and came back mid-session.
    if (
      (ManageStore.phase === "dirty" || ManageStore.phase === "ready") &&
      ManageStore.fileHandle
    ) {
      startFileWatch();
    }
  },

  onremove() {
    if (ManageStore.loggerObserver) {
      Logger.removeObserver(ManageStore.loggerObserver);
    }
    // Do NOT stop the file watcher here - the user may navigate to /checklist
    // to review the draft and come back. We keep watching so auto-rebuild still
    // fires in the background. The watcher is stopped only on an explicit reset.
    document.querySelector(".interaction-area")?.classList.remove("manage-layout-active");
  },

  view() {
    return m(".manage-view", [
      m(".manage-workflow", renderWorkflow()),
      m(".manage-log-zone", m(LogsPanel)),
    ]);
  },
};
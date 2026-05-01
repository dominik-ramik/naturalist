import m from "mithril";
import { registerMessages, selfKey, t, tf } from 'virtual:i18n-self';
import { te } from "../i18n/index.js";
import "./ManageView.css";
import { marked } from "marked";

import { checkForChecklistUpdate, DOCS_URL } from "../app.js";
import { ExcelBridge } from "../components/ExcelBridge.js";
import { routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { DataManager } from "../model/DataManager.js";
import { Settings } from "../model/Settings.js";
import { Logger } from "../components/Logger.js";
import { exportTemplateSpreadsheetEmpty, exportTemplateSpreadsheetFilled } from "../model/DataManagerData.js";
import { compressor } from "../components/LZString.js";
import { DEFAULT_TOOL } from "./analysisTools/index.js";
import { manageViewI18n } from "./ManageView.i18n.js";
import { DWC_ARCHIVE_TYPES } from "../model/nlDataStructureSheets.js";

// Some message keys may be coming from update.php in jsonState
registerMessages(selfKey, manageViewI18n);

// --- INTERNAL STATE STORE ---
const ManageStore = {
  dataman: null,
  isProcessing: false,
  isDwcProcessing: false,
  isCompilingDownload: false,
  isPublishing: false,
  errorDetails: "",
  messageCode: "",
  shouldShowUploadForm: Settings.lastKnownUploadFormAvailability(),
  corsWarningAcknowledged: false,
  loggerObserver: null,

  // Upload source: 'file' | 'url'
  uploadMode: Settings.manageUploadMode(),
  urlInputValue: Settings.spreadsheetUrl(),

  // DwC auto-recompile: true when the last pipeline run should trigger DwC
  // compilation automatically (set when user uploads while dwcCompiled is true)
  dwcAutoRecompile: false,


  reset: function () {
    this.dataman = null;
    this.isProcessing = false;
    this.isDwcProcessing = false;
    this.dwcAutoRecompile = false;
    this.errorDetails = "";
    this.messageCode = "";
    // Ensure all UI log groups are collapsed when resetting/recompiling
    try {
      if (LogsPanel && LogsPanel.expandedGroups && typeof LogsPanel.expandedGroups.clear === 'function') {
        LogsPanel.expandedGroups.clear();
      }
    } catch (e) {
      // noop
    }
  },

  setUploadMode: function (mode) {
    this.uploadMode = mode;
    this.corsWarningAcknowledged = false;
    Settings.manageUploadMode(mode);
  },

  checkPHPPresent: async function () {
    try {
      let result = await fetch("../update.php?ping");
      let json = await result.json();
      let isOnline = json.state == "online";
      this.shouldShowUploadForm = isOnline;
      Settings.lastKnownUploadFormAvailability(isOnline);
    } catch (ex) {
      this.shouldShowUploadForm = false;
    }
    m.redraw();
  },
};

// --- STEP DEFINITIONS ---
const STEPS = [
  { id: "upload", label: "Upload", icon: "img/ui/manage/upload.svg" },
  { id: "processing", label: "Processing", icon: "img/ui/manage/processing.svg" },
  { id: "review", label: "Review", icon: "img/ui/manage/review.svg" },
  { id: "publish", label: "Publish", icon: "img/ui/manage/publish.svg" },
];

// --- UI COMPONENTS ---

// Deep-link guard flag. Set to true as soon as oninit detects a deep-link and
// the pipeline starts. MUST be cleared to false before m.route.set("/checklist")
// is called at the end of onSuccess so the guard does not stay suppressed forever.
export let deepLinkProcessing = false;

const ManageCard = {
  view: function (vnode) {
    const { title, icon, description, children, headerAction } = vnode.attrs;

    return m(".manage-card", [
      m(".manage-card-header", [
        icon ? m("img.manage-card-icon", { src: icon }) : null,
        m("h3.manage-card-title", title),
        headerAction ? headerAction : null,
      ]),
      description ? m(".manage-card-description", m.trust(description)) : null,
      m(".manage-card-content", children),
    ]);
  },
};

const ActionButton = {
  view: function (vnode) {
    const { label, onclick, primary, secondary, small, icon, background, loading, block } = vnode.attrs;
    const classes = [
      "manage-btn",
      primary ? "manage-btn-primary" : "",
      secondary ? "manage-btn-secondary" : "",
      small ? "manage-btn-small" : "",
      block ? "manage-btn-block" : "",
    ]
      .filter(Boolean)
      .join(".");

    return m(
      "button." + classes + "[style=" + (background ? `background-color: ${background};` : "") + "]",
      { onclick, disabled: !!loading },
      [loading ? m("span.manage-btn-spinner") : (icon ? m("img.manage-btn-icon", { src: icon }) : null), label]
    );
  },
};

// --- LOGS PANEL COMPONENT ---

const LogsPanel = {
  expandedGroups: new Set(),

  toggleGroup: function (id) {
    if (LogsPanel.expandedGroups.has(id)) {
      LogsPanel.expandedGroups.delete(id);
    } else {
      LogsPanel.expandedGroups.add(id);
    }
  },

  view: function () {
    const messages = Logger.getMessagesForDisplay();
    if (messages.length === 0) return null;

    const counts = Logger.getCounts();
    const groupMap = new Map();
    const ungrouped = [];
    let groupIdCounter = 0;

    messages.forEach((msg) => {
      if (!msg.groupTitle) {
        ungrouped.push(msg);
        return;
      }
      const groupKey = `${msg.groupTitle}-${msg.level}`;
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          id: groupIdCounter++,
          title: msg.groupTitle,
          messages: [],
          counts: { critical: 0, error: 0, warning: 0, info: 0 },
        });
      }
      const group = groupMap.get(groupKey);
      group.messages.push(msg);
      group.counts[msg.level]++;
    });

    function worstLevel(groupCounts) {
      if (groupCounts.critical > 0) return "critical";
      if (groupCounts.error > 0) return "error";
      if (groupCounts.warning > 0) return "warning";
      return "info";
    }

    function renderLogItem(logItem) {
      return m(".manage-log-item." + logItem.level, { key: logItem.message }, [
        m(".manage-log-content", [
          m("span.manage-log-level", t("log_" + logItem.level)),
          m("span.manage-log-message", m.trust(logItem.message)),
        ]),
      ]);
    }

    function renderGroup(group) {
      const isExpanded = LogsPanel.expandedGroups.has(group.id);
      const worst = worstLevel(group.counts);
      const errorCount = group.counts.critical + group.counts.error;
      const warnCount = group.counts.warning;
      const totalCount = group.messages.length;

      return m(".manage-log-group." + worst, { key: group.id }, [
        m(
          ".manage-log-group-header",
          {
            onclick: () => {
              LogsPanel.toggleGroup(group.id);
            },
            title: group.title,
          },
          [
            m("span.manage-log-group-toggle", isExpanded ? "▾" : "▸"),
            m(
              "span.manage-log-group-title",
              t("log_" + group.messages[0].level) + " - " + group.title
            ),
            m(".manage-log-group-categories", [
              errorCount > 0
                ? m("span.manage-logs-count.manage-logs-count--error", errorCount)
                : null,
              warnCount > 0
                ? m("span.manage-logs-count.manage-logs-count--warning", warnCount)
                : null,
              errorCount === 0 && warnCount === 0
                ? m("span.manage-logs-count.manage-logs-count--total", totalCount)
                : null,
            ]),
          ]
        ),
        isExpanded ? m(".manage-log-group-body", group.messages.map(renderLogItem)) : null,
      ]);
    }

    return m(".manage-logs", [
      m(".manage-logs-header", [
        m("span", t("log_messages") || "Messages"),
        m(".manage-logs-counts", [
          counts.critical + counts.error > 0
            ? m(
              "span.manage-logs-count.manage-logs-count--error",
              counts.critical + counts.error + " " + t("log_error", counts.critical + counts.error)
            )
            : null,
          counts.warning > 0
            ? m(
              "span.manage-logs-count.manage-logs-count--warning",
              counts.warning + " " + t("log_warning", counts.warning)
            )
            : null,
        ]),
      ]),
      m(".manage-logs-list", [
        ...Array.from(groupMap.values()).map(renderGroup),
        ...ungrouped.map(renderLogItem),
      ]),
    ]);
  },
};

// --- SHARED PROCESSING PIPELINE ---

/**
 * Core pipeline: ExcelBridge → DataManager → compile → DwC → route.
 * Extracted to avoid duplication between file-upload and URL-fetch flows.
 *
 * DwC archive compilation runs in-band: any DwC validation errors (missing
 * required terms, bad license, type mismatches, etc.) are emitted through
 * Logger and therefore participate in the same error gate that prevents
 * checklist publication.  The UI remains on the processing spinner while the
 * async DwC build runs, then routes normally once it resolves.
 *
 * @param {ArrayBuffer} buffer
 * @param {boolean} checkAssetsSize
 * @param {Function} onSuccess - Called instead of default "/manage/review" redirect on success
 */
async function _runPipeline(buffer, checkAssetsSize, onSuccess, isDemo = false) {
  ManageStore.dataman = new DataManager();
  ManageStore.dataman.loadData(new ExcelBridge(buffer), checkAssetsSize);
  const compiled = ManageStore.dataman.getCompiledChecklist();

  // DwC compilation is NOT run here. It is decoupled and triggered on-demand
  // from the Review screen so that DwC configuration errors never block a
  // normal checklist update.

  if (Logger.hasErrors()) {
    ManageStore.dwcAutoRecompile = false;
    // If the deep-link pipeline fails, clear the flag so the guard works normally.
    deepLinkProcessing = false;
    scheduleManageNavigation(() =>
      m.route.set("/manage/upload", null, { replace: true })
    );
  } else {
    // In demo mode, store the compiled data in sessionStorage so it survives
    // page reloads, and skip the draftNotice (the demo banner replaces it).
    if (isDemo) {
      try {
        sessionStorage.setItem(DEMO_CHECKLIST_KEY, compressor.compress(JSON.stringify(compiled)));
      } catch (e) {
        console.warn("Could not store demo checklist in sessionStorage:", e);
      }
    }
    Checklist.loadData(compiled, isDemo ? false : true);
    Checklist.getTaxaForCurrentQuery();

    if (ManageStore.dwcAutoRecompile) {
      ManageStore.dwcAutoRecompile = false;
      // Run DwC immediately instead of routing to /review first
      scheduleManageNavigation(() => _runDwcPipeline());
    } else {
      const navFn = onSuccess ?? (() => {
        m.route.set("/manage/review", null, { replace: true });
      });
      scheduleManageNavigation(navFn);
    }
  }
}

/**
 * Run only the DwC compilation pass on the already-loaded DataManager.
 * Routes to /manage/processing while running, then back to /manage/review.
 * Logger is NOT cleared - DwC messages are appended to existing checklist
 * messages so the user sees the full picture in one place.
 */
async function _runDwcPipeline() {
  if (!ManageStore.dataman) return;
  ManageStore.isDwcProcessing = true;
  // Clear only DwC-tagged messages so prior checklist messages are preserved
  Logger.clearGroup(/$DwC Archive/);
  m.route.set("/manage/processing");

  // Small delay so the processing screen renders before the async work begins
  await new Promise(resolve => setTimeout(resolve, 50));

  try {
    await ManageStore.dataman.compileDwcArchiveAsync();
  } catch (ex) {
    Logger.error("DwC compilation threw an unexpected error: " + ex.message, "DwC Archive");
  }

  ManageStore.isDwcProcessing = false;
  scheduleManageNavigation(() =>
    m.route.set("/manage/review", null, { replace: true })
  );
}

function scheduleManageNavigation(navigate) {
  window.setTimeout(() => {
    navigate();
  }, 0);
}

// --- PRIVATE HELPER FUNCTIONS ---

function downloadCompiledData(blob, fileName) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Process a local File object through the pipeline.
 */
function processUpload(filepicker, file, checkAssetsSize) {
  if (!(file && file.name)) {
    Logger.error(t("chose_a_file"));
    return;
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    Logger.error(t("wrong_filetype"));
    return;
  }

  ManageStore.reset();
  ManageStore.isProcessing = true;
  // If DwC was previously compiled, auto-recompile after the new upload so the
  // user doesn't need an extra manual click in their fix→upload→verify loop.
  if (ManageStore.dataman && typeof ManageStore.dataman.isDwcCompiled === 'function' && ManageStore.dataman.isDwcCompiled()) {
    ManageStore.dwcAutoRecompile = true;
  }
  m.route.set("/manage/processing");

  const reader = new FileReader();
  reader.addEventListener("loadend", (evt) => {
    setTimeout(() => {
      _runPipeline(evt.target.result, checkAssetsSize);
      filepicker.value = "";
    }, 50);
  });
  reader.readAsArrayBuffer(file);
}

/**
 * Fetch an xlsx from a URL and run it through the pipeline.
 * @param {string} url - Publicly accessible direct download URL
 * @param {boolean} checkAssetsSize
 * @param {Function} [onSuccess] - Override route after successful processing
 */
async function fetchAndProcessUrl(url, checkAssetsSize, onSuccess, isDemo = false) {
  url = url && url.trim();

  if (!url) {
    Logger.error(t("url_required"));
    return;
  }
  try {
    new URL(url);
  } catch {
    Logger.error(t("url_invalid"));
    return;
  }

  ManageStore.reset();
  ManageStore.isProcessing = true;
  // If DwC was previously compiled, auto-recompile after the new upload.
  if (ManageStore.dataman && typeof ManageStore.dataman.isDwcCompiled === 'function' && ManageStore.dataman.isDwcCompiled()) {
    ManageStore.dwcAutoRecompile = true;
  }
  m.route.set("/manage/processing");

  let buffer;
  try {
    let res;
    if (ManageStore.shouldShowUploadForm) {
      // PHP available: server-side proxy sidesteps CORS entirely
      Logger.info(t("url_fetching_via_proxy"));
      const body = new FormData();
      body.append("url", url);
      res = await fetch("../update.php?proxy", { method: "POST", body, cache: "no-store" });
    } else {
      // Static hosting: direct fetch - CORS restrictions may apply
      Logger.warning(t("url_fetching_direct"));
      const bustUrl = url + (url.includes("?") ? "&" : "?") + "_cb=" + Date.now();
      res = await fetch(bustUrl, { mode: "cors", cache: "reload" });
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    buffer = await res.arrayBuffer();
  } catch (ex) {
    Logger.error(t("url_fetch_failed") + (ex.message ? ` (${ex.message})` : ""));
    ManageStore.isProcessing = false;
    scheduleManageNavigation(() =>
      m.route.set("/manage/upload", null, { replace: true })
    );
    return;
  }

  // Validate xlsx magic bytes (PK zip: 50 4B 03 04)
  const sig = new Uint8Array(buffer, 0, 4);
  if (sig[0] !== 0x50 || sig[1] !== 0x4B) {
    Logger.error(t("wrong_filetype"));
    ManageStore.isProcessing = false;
    scheduleManageNavigation(() =>
      m.route.set("/manage/upload", null, { replace: true })
    );
    return;
  }

  setTimeout(() => _runPipeline(buffer, checkAssetsSize, onSuccess, isDemo), 50);
}

// --- UPLOAD SOURCE RENDERER ---

function renderDropzone() {
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  return m(
    ".manage-dropzone#dropzone",
    {
      ondrag: preventDefaults,
      ondragstart: (e) => {
        preventDefaults(e);
        document.getElementById("dropzone").classList.add("entered");
      },
      ondragend: (e) => {
        preventDefaults(e);
        document.getElementById("dropzone").classList.remove("entered");
      },
      ondragover: (e) => {
        preventDefaults(e);
        document.getElementById("dropzone").classList.add("entered");
      },
      ondragenter: (e) => {
        preventDefaults(e);
        document.getElementById("dropzone").classList.add("entered");
      },
      ondragleave: (e) => {
        preventDefaults(e);
        document.getElementById("dropzone").classList.remove("entered");
      },
      ondrop: function (e) {
        preventDefaults(e);
        document.getElementById("dropzone").classList.remove("entered");
        processUpload(
          document.getElementById("excelupload"),
          e.dataTransfer.files[0],
          document.getElementById("checkassetssize").checked
        );
      },
    },
    [
      m(".manage-dropzone-content", [
        m("img.manage-dropzone-icon", { src: "img/ui/manage/upload.svg" }),
        m(".manage-dropzone-text", [
          m("label.manage-btn.manage-btn-primary[for=excelupload]", t("click_to_upload")),
          m("span.manage-dropzone-or", t("or_drag_it")),
        ]),
        m("input[type=file][id=excelupload][accept=.xlsx]", {
          style: "display: none",
          onchange: function (e) {
            processUpload(this, e.target.files[0], document.getElementById("checkassetssize").checked);
          },
        }),
      ]),
      m(".manage-dropzone-options", [
        m("label.manage-checkbox", [
          m("input[type=checkbox][id=checkassetssize][checked]"),
          m("span", t("check_assets_size1")),
        ]),
        m("p.manage-dropzone-hint", t("check_assets_size2")),
      ]),
    ]
  );
}

function renderUrlInput() {
  const isStatic = !ManageStore.shouldShowUploadForm;

  if (isStatic && !ManageStore.corsWarningAcknowledged) {
    return m(".manage-cors-notice", [
      m(".manage-cors-notice-text", t("static_hosting_cors_notice")),
      m(ActionButton, {
        label: t("static_hosting_cors_acknowledge"),
        onclick: () => {
          ManageStore.corsWarningAcknowledged = true;
        },
      }),
    ]);
  }

  return m(".manage-url-input", [
    isStatic
      ? m("p.manage-hint-warning", t("static_hosting_cors_reminder"))
      : null,
    m(".manage-form-group", [
      m("label[for=spreadsheet-url]", t("spreadsheet_url_label")),
      m("input[type=url][id=spreadsheet-url][autocomplete=url]", {
        value: ManageStore.urlInputValue,
        placeholder: "https://example.com/my-checklist.xlsx",
        oninput: (e) => {
          ManageStore.urlInputValue = e.target.value;
        },
      }),
    ]),
    m("p.manage-dropzone-hint", t("url_public_hint")),
    m(".manage-dropzone-options", [
      m("label.manage-checkbox", [
        m("input[type=checkbox][id=checkassetssize-url][checked]"),
        m("span", t("check_assets_size1")),
      ]),
      m("p.manage-dropzone-hint", t("check_assets_size2")),
    ]),
    m(ActionButton, {
      label: t("load_from_url_button"),
      primary: true,
      block: true,
      onclick: () => {
        const url = ManageStore.urlInputValue.trim();
        Settings.spreadsheetUrl(url);
        fetchAndProcessUrl(url, document.getElementById("checkassetssize-url").checked);
      },
    }),
  ]);
}

/**
 * Tab switcher + active upload source panel.
 */
function renderUploadSource() {
  const mode = ManageStore.uploadMode;
  return [
    m(".manage-source-tabs", [
      m(
        "button.manage-tab" + (mode === "file" ? ".active" : ""),
        { onclick: () => ManageStore.setUploadMode("file") },
        [m("img.manage-btn-icon", { src: "img/ui/manage/upload.svg" }), t("upload_file_tab")]
      ),
      m(
        "button.manage-tab" + (mode === "url" ? ".active" : ""),
        { onclick: () => ManageStore.setUploadMode("url") },
        [m("img.manage-btn-icon", { src: "img/ui/manage/file-cloud-outline.svg" }), t("load_from_url_tab")]
      ),
    ]),
    mode === "file" ? renderDropzone() : renderUrlInput(),
  ];
}

// --- VIEW HELPERS ---
const SubViews = {
  upload: function () {
    if (ManageStore.dataman && !ManageStore.isProcessing) {
      // Defer the reset so state is never mutated while Mithril is building the
      // vnode tree.  The next scheduled redraw (triggered automatically by the
      // setTimeout) will then see the cleared state.
      setTimeout(() => { ManageStore.reset(); m.redraw(); }, 0);
    }

    const isDataReady = Checklist._isDataReady;

    const scratchCard = m(ManageCard, {
      title: t("start_scratch_title"),
      icon: "img/ui/manage/docs.svg",
      description: marked.parse(t("starting_from_scratch_links")),
      children: [
        m(ActionButton, {
          label: t("download_blank_sheet_button"),
          onclick: () => exportTemplateSpreadsheetEmpty(),
          primary: true,
          block: true,
          style: "margin-bottom: 12px;",
        }),
        m("div[style=margin-bottom:12px]"),
        m(ActionButton, {
          label: t("download_filled_sheet_button"),
          onclick: () => exportTemplateSpreadsheetFilled(),
          primary: true,
          block: true,
        }),
        m("div[style=margin-bottom:12px]"),
        m(ActionButton, {
          label: m.trust(t("open_documentation")),
          onclick: () => window.open(DOCS_URL, "_blank"),
          block: true,
        }),
      ],
    });

    return [
      !isDataReady ? scratchCard : null,

      m(ManageCard, {
        title: isDataReady ? t("update_checklist_title") : t("upload_spreadsheet_title"),
        icon: "img/ui/manage/upload.svg",

        children: [
          renderUploadSource(),
          Logger.hasErrors()
            ? m("p.manage-hint-error", t("data_upload_import_dirty"))
            : null,
        ],
      }),

      m(LogsPanel),

      isDataReady ? scratchCard : null,
    ];
  },

  processing: function () {
    if (!ManageStore.isProcessing && !ManageStore.isDwcProcessing) {
      setTimeout(() => m.route.set("/manage/upload"), 0);
      return null;
    }

    const title = ManageStore.isDwcProcessing
      ? t("dwc_compiling") || "Compiling DwC archive…"
      : t("processing");

    return m(ManageCard, {
      title,
      icon: "img/ui/manage/processing.svg",
      children: [
        m(".manage-processing", [
          m(".manage-spinner"),
          m("p", ManageStore.isDwcProcessing
            ? t("dwc_compiling_hint") || "Validating configuration and building the archive…"
            : t("data_upload_processing")),
          m("p.manage-processing-hint", t("this_may_take_time")),
        ]),
      ],
    });
  },

  review: function () {
    if (!ManageStore.dataman) {
      setTimeout(() => m.route.set("/manage/upload"), 0);
      return null;
    }

    const hasDwc = ManageStore.dataman && typeof ManageStore.dataman.hasDwcTable === 'function' ? ManageStore.dataman.hasDwcTable() : false;
    const dwcCompiled = ManageStore.dataman && typeof ManageStore.dataman.isDwcCompiled === 'function' ? ManageStore.dataman.isDwcCompiled() : false;
    const dwcResult = dwcCompiled ? ManageStore.dataman.getDwcArchive() : null;
    const dwcHasErrors = dwcCompiled && Logger.getMessagesForDisplay().some(
      m => (m.level === "error" || m.level === "critical") &&
        (m.groupTitle.startsWith("DwC Archive"))
    );
    const dwcSucceeded = dwcCompiled && !dwcHasErrors;

    // When DwC has errors, the fix card becomes the user's primary focus.
    // We show it first and make the upload prominent.
    const dwcNeedsFixing = hasDwc && dwcCompiled && dwcHasErrors;

    // ── Fix / Upload card ────────────────────────────────────────────────────
    // Shown at the top when DwC needs fixing; otherwise as a secondary option
    // within the main checklist card.
    const fixCard = m(ManageCard, {
      title: dwcNeedsFixing
        ? (t("fix_and_reupload_title") || "Fix & re-upload spreadsheet")
        : (t("back_to_upload") || "Upload updated spreadsheet"),
      icon: "img/ui/manage/upload.svg",
      description: dwcNeedsFixing
        ? (t("fix_and_reupload_description") ||
          "Correct the issues flagged below, save your spreadsheet, then re-upload. " +
          "The DwC archive will be re-compiled automatically.")
        : null,
      children: [
        m(".manage-actions", [
          m(ActionButton, {
            label: t("back_to_upload") || "Upload fixed spreadsheet",
            secondary: !dwcNeedsFixing,
            primary: dwcNeedsFixing,
            block: true,
            icon: "img/ui/manage/upload.svg",
            onclick: () => m.route.set("/manage/upload"),
          }),
        ]),
      ],
    });

    // ── Proceed / Publish card ───────────────────────────────────────────────
    const proceedCard = m(ManageCard, {
      title: t("review_draft_heading"),
      icon: "img/ui/manage/review.svg",
      description: t("review_draft"),
      children: [
        m(".manage-actions", [
          m(ActionButton, {
            label: t("proceed_to_update"),
            primary: true,
            block: true,
            onclick: () => m.route.set("/manage/publish"),
            icon: "img/ui/manage/clean.svg",
            background: "#7cb342",
          }),
          // Upload shortcut - only shown here when DwC is NOT the focus
          !dwcNeedsFixing
            ? m(ActionButton, {
              label: t("back_to_upload") || "Upload updated spreadsheet",
              secondary: true,
              block: true,
              onclick: () => m.route.set("/manage/upload"),
              icon: "img/ui/manage/upload.svg",
            })
            : null,
        ]),
      ],
    });

    // ── DwC Export card ──────────────────────────────────────────────────────
    const dwcCard = hasDwc
      ? m(ManageCard, {
        title: t("dwc_section_title") || "DwC / GBIF Export",
        icon: "img/ui/manage/download.svg",
        children: [
          // State A: not yet compiled
          !dwcCompiled
            ? m(".manage-dwc-panel", [
              m("p", t("dwc_export_configured") || "DwC export is configured in your spreadsheet."),
              m("p.manage-processing-hint",
                t("dwc_compile_invitation") ||
                "Click below to validate your DwC mapping and generate the archive. " +
                "This step is optional - you can publish the checklist without it."
              ),
              m(ActionButton, {
                label: t("compile_dwc_export") || "Compile DwC Export",
                primary: true,
                block: true,
                icon: "img/ui/manage/processing_light.svg",
                onclick: () => {
                  _runDwcPipeline();
                },
              }),
            ])
            : null,

          // State B: compiled with errors
          dwcHasErrors
            ? m(".manage-dwc-panel", [
              m("p.manage-hint-error",
                t("dwc_export_has_errors") ||
                "DwC compilation completed with errors. Fix your spreadsheet and re-upload - the archive will recompile automatically."
              ),
            ])
            : null,

          // State C: compiled successfully
          dwcSucceeded
            ? m(".manage-dwc-panel", [
              m(".manage-dwc-success-header", [
                m("p.manage-hint-success", t("dwc_export_ready") || "DwC archive compiled successfully."),
              ]),
              m(".manage-actions", [
                Object.entries(DWC_ARCHIVE_TYPES)
                  .filter(([archiveType]) => dwcResult && dwcResult[archiveType])
                  .map(([archiveType, typeConfig]) =>
                    m(ActionButton, {
                      key: archiveType,
                      label: t("download_dwc_" + archiveType) || "Download DwC … Archive",
                      icon: "img/ui/manage/download.svg",
                      block: true,
                      onclick: () => downloadCompiledData(dwcResult[archiveType], typeConfig.zipFileName),
                    })
                  )
              ]),
            ])
            : null,
        ],
      })
      : null;

    // Layout: when DwC errors are present, lead with the fix card so the
    // corrective action is unmissable. Otherwise the proceed card leads.
    return dwcNeedsFixing
      ? [fixCard, dwcCard, proceedCard]
      : [proceedCard, dwcCard];
  },

  publish: function () {
    if (!ManageStore.dataman) {
      // Defer the route change so it never fires synchronously while Mithril
      // is rendering (consistent with the deferred pattern used by the
      // sibling SubViews.processing and SubViews.review helpers).
      setTimeout(() => m.route.set("/manage/upload"), 0);
      return null;
    }

    return [
      ManageStore.shouldShowUploadForm === true
        ? m(ManageCard, {
          title: t("data_upload_integrate_data"),
          icon: "img/ui/manage/publish.svg",
          description: t("enter_creds_to_publish"),
          children: [renderServerUploadForm()],
        })
        : null,

      m(ManageCard, {
        title: t("download_data"),
        icon: "img/ui/manage/download.svg",
        description: marked.parse(t("download_for_manual_update")),
        children: [
          m(".manage-actions", [
            m(ActionButton, {
              label: t("download_checklist"),
              primary: true,
              block: true,
              loading: ManageStore.isCompilingDownload,
              onclick: function () {
                ManageStore.isCompilingDownload = true;
                setTimeout(() => {
                  let json = ManageStore.dataman.getCompiledChecklist();
                  var blob = new Blob([compressor.compress(JSON.stringify(json))], {
                    type: "application/json;charset=utf-8",
                  });
                  downloadCompiledData(blob, "checklist.json");
                  ManageStore.isCompilingDownload = false;
                  m.redraw();
                }, 50);
              },
            }),
            m(ActionButton, {
              label: t("back_to_upload_small"),
              secondary: true,
              block: true,
              onclick: () => m.route.set("/manage/upload"),
            }),
          ]),
        ],
      }),
    ];
  },

  error: function () {
    return m(ManageCard, {
      title: t("error_publishing"),
      icon: "img/ui/manage/error.svg",
      children: [
        m(".manage-error-content", [
          ManageStore.messageCode && te(ManageStore.messageCode)
            ? m("p", t(ManageStore.messageCode))
            : m("p", ManageStore.errorDetails),
          m(ActionButton, {
            label: t("back_to_upload_after_error"),
            secondary: true,
            block: true,
            onclick: () => m.route.set("/manage/publish"),
          }),
        ]),
      ],
    });
  },

  done: function () {
    return m(ManageCard, {
      title: t("done"),
      icon: "img/ui/manage/update_done.svg",
      children: [
        m(".manage-success-content", [
          m("p", t("update_published")),
          m(ActionButton, {
            label: t("manage_back_to_search"),
            primary: true,
            block: true,
            onclick: function () {
              Checklist._isDraft = false;
              if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                checkForChecklistUpdate(navigator.serviceWorker.controller);
              }
              ManageStore.reset();
              routeTo("/checklist");
            },
          }),
        ]),
      ],
    });
  },
};

// --- MAIN COMPONENT ---

// Key used to preserve the xlsxUrl across the SW-activation reload.
// Exported so app.js can reference the same key in the controllerchange handler.
export const DEEP_LINK_STORAGE_KEY = "xlsxDeepLinkUrl";

// Key used to store the compiled demo checklist in sessionStorage so it
// survives page reloads while demo mode is active.
export const DEMO_CHECKLIST_KEY = "demoChecklistData";

/**
 * Called once at module load time (before m.route is set up).
 *
 * Strategy:
 *   - Always capture xlsxUrl from the raw hash into sessionStorage immediately,
 *     before Mithril or the browser can rewrite the hash.
 *   - Only trigger our OWN reload if the SW is already controlling the page
 *     (i.e. navigator.serviceWorker.controller is non-null). In that case there
 *     will be no automatic controllerchange reload, so we must do it ourselves.
 *   - If the SW is NOT yet controlling (first-ever install), we do NOT reload:
 *     the SW's own controllerchange event will trigger a reload in app.js, and
 *     that handler (now deep-link-aware) will reload to the full original href
 *     so the hash is preserved.
 *   - If sessionStorage already has the key, we are on the post-reload pass -
 *     do nothing, let oninit pick up the stored URL.
 */
function captureDeepLinkAndReloadIfNeeded() {

  // Post-reload pass: URL already stored, nothing to do here.
  if (sessionStorage.getItem(DEEP_LINK_STORAGE_KEY)) {
    return false;
  }

  // Parse xlsxUrl from the raw hash before anything else can touch it.
  const hash = window.location.hash; // e.g. #!/manage/upload?xlsxUrl=https://...
  const match = hash.match(/[?&]xlsxUrl=([^&]*)/);
  if (!match) {
    return false;
  }

  // AFTER
  const rawUrl = decodeURIComponent(match[1]);

  // Capture optional redirectHash param (value is already a hash query-string,
  // e.g. "l=en&q=%7B%7D&v=tool_taxonomic_tree&s=S").
  const redirectMatch = hash.match(/[?&]redirectHash=([^&]*)/);
  const redirectHash = redirectMatch ? decodeURIComponent(redirectMatch[1]) : null;

  // Store the full original href so the controllerchange handler can reload
  // to it exactly, preserving the hash.
  sessionStorage.setItem(DEEP_LINK_STORAGE_KEY, rawUrl);
  sessionStorage.setItem(DEEP_LINK_STORAGE_KEY + "_href", window.location.href);
  if (redirectHash) {
    sessionStorage.setItem(DEEP_LINK_STORAGE_KEY + "_redirectHash", redirectHash);
  }

  const swAlreadyControlling = "serviceWorker" in navigator && !!navigator.serviceWorker.controller;

  if (swAlreadyControlling) {
    // SW is active - no controllerchange will fire. We reload ourselves.
    // Use location.href (not reload()) to guarantee the full URL including hash
    // is re-requested, bypassing any SW cache normalisation.
    window.location.href = window.location.href;
    return true;
  }

  // SW not yet controlling - controllerchange will fire and app.js will reload
  // to the stored href. Do not reload here; just let it happen.
  return false;
}

// Run immediately at module load, before anything else.
captureDeepLinkAndReloadIfNeeded();

export let ManageView = {
  /**
   * Deep-link handler: if a xlsxUrl was stored in sessionStorage by
   * captureDeepLinkAndReloadIfNeeded(), pick it up here, run the pipeline,
   * and route directly to /checklist on success.
   *
   * URL format: #!/manage/upload?xlsxUrl=https://example.com/file.xlsx
   * (URL-encode the value if it contains & or ? characters)
   */
  oninit: function (vnode) {

    // Only act on the upload step.
    if (vnode.attrs.step !== "upload") {
      return;
    }

    // Try to get the URL from sessionStorage (post-reload pass) first,
    // then fall back to the live route param (manual URL entry / direct nav).
    const storedUrl = sessionStorage.getItem(DEEP_LINK_STORAGE_KEY);
    const routeParamUrl = m.route.param("xlsxUrl");

    const xlsxUrl = storedUrl || routeParamUrl;

    if (!xlsxUrl) {
      return;
    }

    // If we got here via the stored URL, clear all stored keys now so they don't fire again.
    const redirectHash = storedUrl
      ? sessionStorage.getItem(DEEP_LINK_STORAGE_KEY + "_redirectHash")
      : m.route.param("redirectHash") || null;

    if (storedUrl) {
      sessionStorage.removeItem(DEEP_LINK_STORAGE_KEY);
      sessionStorage.removeItem(DEEP_LINK_STORAGE_KEY + "_href");
      sessionStorage.removeItem(DEEP_LINK_STORAGE_KEY + "_redirectHash");
    }

    // CRITICAL: set the flag BEFORE any async work so onMatchGuard never
    // sees _isDataReady=false and redirects back to /manage during the pipeline.
    deepLinkProcessing = true;

    ManageStore.urlInputValue = xlsxUrl;
    ManageStore.setUploadMode("url");
    Settings.spreadsheetUrl(xlsxUrl);

    // AFTER: isDemo=true so the compiled data is stored in sessionStorage
    fetchAndProcessUrl(xlsxUrl, true, () => {
      deepLinkProcessing = false;
      if (redirectHash) {
        // Parse the redirectHash query string into a proper params object so
        // Mithril registers them as real route params (m.route.param("s") etc.).
        // Passing them baked into the path string does NOT work with Mithril's
        // hash router — it treats the whole "?..." as part of the literal path.
        const params = Object.fromEntries(
          redirectHash.split("&").map(pair => {
            const [k, v = ""] = pair.split("=");
            return [decodeURIComponent(k), decodeURIComponent(v)];
          })
        );
        // Keep Settings in sync eagerly so validateActiveToolState() sees the
        // right values when onmatch fires, before updateToolAndScope() runs.
        if (params.v) Settings.viewType(params.v);
        if (params.s) Settings.analyticalIntent(params.s);
        ManageStore.setUploadMode("file");
        m.route.set("/checklist", params, { replace: true });
      } else {
        Settings.viewType(DEFAULT_TOOL);
        ManageStore.setUploadMode("file");
        m.route.set("/checklist", { v: DEFAULT_TOOL }, { replace: true });
      }
    }, true);
  },

  oncreate: function () {
    ManageStore.checkPHPPresent();
    if (!ManageStore.loggerObserver) {
      ManageStore.loggerObserver = () => m.redraw();
    }
    Logger.addObserver(ManageStore.loggerObserver);
  },

  onremove: function () {
    if (ManageStore.loggerObserver) {
      Logger.removeObserver(ManageStore.loggerObserver);
    }
  },

  view: function (vnode) {
    const step = vnode.attrs.step || "upload";
    const content = SubViews[step] ? SubViews[step]() : SubViews.upload();
    const showLogs = !["processing", "done"].includes(step);

    return m(".manage-view", [
      m(".manage-content", content),
      showLogs && step !== "upload" ? m(LogsPanel) : null,
    ]);
  },
};

// --- SERVER UPLOAD FORM ---

function renderServerUploadForm() {
  return m(
    "form#updateform.manage-form",
    {
      onsubmit: function (e) {
        e.preventDefault();
        e.stopPropagation();
        ManageStore.isPublishing = true;

        const formData = new FormData(this);
        let compressed = compressor.compress(
          JSON.stringify(ManageStore.dataman.getCompiledChecklist())
        );
        formData.append("checklist_data", compressed);
        const request = new XMLHttpRequest();

        request.onreadystatechange = function (event) {
          if (request.readyState === 4) {
            ManageStore.isPublishing = false;
            if (request.status === 200) {
              let result = "";
              try {
                if (
                  request.responseText.indexOf("POST Content-Length") >= 0 &&
                  request.responseText.indexOf("exceeds") >= 0
                ) {
                  throw "the POST Content-Length exceeds the limit";
                }
                try {
                  result = JSON.parse(request.responseText);
                } catch {
                  throw "incorrect server response. If you are using static webhosting, you need to upload the checklist.json manually.";
                }
              } catch (ex) {
                console.log("Error parsing this original server response:", request.responseText);

                result = {
                  state: "error",
                  details: [
                    m("div", t("server_returned_odd_message")),
                    m(
                      "div[style=margin-top: 1em;]",
                      t("server_returned_odd_message_details") + ex
                    ),
                  ],
                };
              }

              if (result.state == "success") {
                m.route.set("/manage/done");
              } else {
                ManageStore.errorDetails = result.details;
                ManageStore.messageCode = result.messageCode;
                m.route.set("/manage/error");
              }
            } else {
              let parsed;
              try { parsed = JSON.parse(request.responseText); } catch { }
              ManageStore.errorDetails = (parsed && parsed.details) ? parsed.details : (request.statusText.toLowerCase() == "not found" ? t("upload_disabled") : t("network_error") + " " + request.statusText);
              ManageStore.messageCode = (parsed && parsed.messageCode) ? parsed.messageCode : "";
              m.redraw();
              m.route.set("/manage/error");
            }
          }
        };
        request.open("POST", "./update.php");
        request.send(formData);
      },
    },
    [
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
        onclick: function (e) {
          e.preventDefault();
          document.getElementById("updateform").requestSubmit();
        },
      }),
    ]
  );
}
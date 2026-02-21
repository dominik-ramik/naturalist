import m from "mithril";
import { marked } from "marked";

import { checkForChecklistUpdate } from "../app.js";
import { ExcelBridge } from "../components/ExcelBridge.js";
import { compressor, routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { DataManager } from "../model/DataManager.js";
import { Settings } from "../model/Settings.js";
import { Logger } from "../components/Logger.js";
import { exportTemplateSpreadsheet } from "../model/DataManagerData.js";

// --- INTERNAL STATE STORE ---
const ManageStore = {
  dataman: null,
  isProcessing: false,
  errorDetails: "",
  messageCode: "",
  shouldShowUploadForm: Settings.lastKnownUploadFormAvailability(),

  reset: function () {
    this.dataman = null;
    this.isProcessing = false;
    this.errorDetails = "";
    this.messageCode = "";
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
  }
};

// --- STEP DEFINITIONS ---
const STEPS = [
  { id: "upload", label: "Upload", icon: "img/ui/manage/upload.svg" },
  { id: "processing", label: "Processing", icon: "img/ui/manage/processing.svg" },
  { id: "review", label: "Review", icon: "img/ui/manage/review.svg" },
  { id: "publish", label: "Publish", icon: "img/ui/manage/publish.svg" },
];

// --- UI COMPONENTS ---

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
  }
};

const ActionButton = {
  view: function (vnode) {
    const { label, onclick, primary, small, icon, background, tall } = vnode.attrs;
    const classes = [
      "manage-btn",
      primary ? "manage-btn-primary" : "",
      small ? "manage-btn-small" : "",
      tall ? "manage-btn-tall" : "",
    ].filter(Boolean).join(".");

    return m("button." + classes + "[style=" + (background ? `background-color: ${background};` : "") + "]", { onclick }, [
      icon ? m("img.manage-btn-icon", { src: icon }) : null,
      label,
    ]);
  }
};

// --- VIEW HELPERS ---
const SubViews = {
  // Step: 'upload'
  upload: function () {
    if (ManageStore.dataman && !ManageStore.isProcessing) {
      ManageStore.reset();
    }

    const isDataReady = Checklist._isDataReady;

    return [
      // Welcome section for fresh install
      !isDataReady ? m(ManageCard, {
        title: t("fresh_install_welcome"),
        icon: "img/icon_maskable.svg",
        children: [
          m("p.manage-welcome-text", t("fresh_install_welcome_message")),
        ]
      }) : null,

      // Getting Started card (for fresh install)
      !isDataReady ? m(ManageCard, {
        title: t("start_scratch_title"),
        icon: "img/ui/manage/docs.svg",
        description: marked.parse(t("starting_from_scratch_links")),
        children: [
          m(ActionButton, {
            label: t("download_blank_sheet_button"),
            onclick: () => exportTemplateSpreadsheet(),
            small: true,
          }),
        ]
      }) : null,

      // Upload card
      m(ManageCard, {
        title: isDataReady ? t("update_checklist_title") : t("upload_spreadsheet_title"),
        icon: "img/ui/manage/upload.svg",
        description: isDataReady ? t("data_upload_waiting") : t("starting_from_scratch_continued"),
        children: [
          renderDropzone(),
          Logger.hasErrors()
            ? m(".manage-notice.manage-notice-error", [
              m("img.manage-notice-icon", { src: "img/ui/manage/errors.svg" }),
              m("span", t("data_upload_import_dirty")),
            ])
            : null,
        ]
      }),
      // Place log messages after the upload card but before the "Need a template?" help card
      // so messages appear above the template/help card when present.
      renderLogs(),

      // Help card (when data exists)
      isDataReady ? m(ManageCard, {
        title: t("start_scratch_title"),
        icon: "img/ui/manage/docs.svg",
        description: marked.parse(t("starting_from_scratch_links")),
        children: [
          m(ActionButton, {
            label: t("download_blank_sheet_button"),
            onclick: () => exportTemplateSpreadsheet(),
            small: true,
          }),
        ]
      }) : null,
    ];
  },

  // Step: 'processing'
  processing: function () {
    if (!ManageStore.isProcessing) {
      setTimeout(() => m.route.set("/manage/upload"), 0);
      return null;
    }

    return m(ManageCard, {
      title: t("processing"),
      icon: "img/ui/manage/processing.svg",
      children: [
        m(".manage-processing", [
          m(".manage-spinner"),
          m("p", t("data_upload_processing")),
          m("p.manage-processing-hint", t("this_may_take_time")),
        ]),
      ]
    });
  },

  // Step: 'review'
  review: function () {
    if (!ManageStore.dataman) {
      setTimeout(() => m.route.set("/manage/upload"), 0);
      return null;
    }

    return m(ManageCard, {
      title: t("review_draft_heading"),
      icon: "img/ui/manage/review.svg",
      description: t("review_draft"),
      children: [
        m(".manage-review-options", [
          m(".manage-review-option.manage-review-issues", [
            m("p", t("not_all_good")),
            m(ActionButton, {
              label: t("back_to_upload"),
              onclick: () => m.route.set("/manage/upload"),
              background: "#ffc107",
              icon: "img/ui/manage/errors.svg",
              tall: true,
            }),
          ]),
          m(".manage-review-option.manage-review-success", [
            m("p", t("all_good")),
            m(ActionButton, {
              label: t("proceed_to_update"),
              onclick: () => m.route.set("/manage/publish"),
              background: "#7cb342",
              icon: "img/ui/manage/clean.svg",
              tall: true,
            }),
          ]),
        ]),
      ]
    });
  },

  // Step: 'publish'
  publish: function () {
    if (!ManageStore.dataman) { m.route.set("/manage/upload"); return null; }

    return [
      // Server upload card (if PHP available)
      ManageStore.shouldShowUploadForm === true ? m(ManageCard, {
        title: t("data_upload_integrate_data"),
        icon: "img/ui/manage/publish.svg",
        description: t("enter_creds_to_publish"),
        children: [renderServerUploadForm()]
      }) : null,

      // Manual download card
      m(ManageCard, {
        title: t("download_data"),
        icon: "img/ui/manage/download.svg",
        description: marked.parse(t("download_for_manual_update")),
        children: [
          m(ActionButton, {
            label: t("download_checklist"),
            primary: true,
            onclick: function () {
              let json = ManageStore.dataman.getCompiledChecklist();
              var blob = new Blob(
                [compressor.compress(JSON.stringify(json))],
                { type: "application/json;charset=utf-8" }
              );
              downloadCompiledData(blob, "checklist.json");
            },
          }),
          m("div", { style: "margin-top: 1em;" },
            m(ActionButton, {
              label: t("back_to_upload_small"),
              onclick: () => m.route.set("/manage/upload"),
              small: true,
            })
          ),
        ]
      }),
    ];
  },

  // Step: 'error'
  error: function () {
    return m(ManageCard, {
      title: t("error_publishing"),
      icon: "img/ui/manage/error.svg",
      children: [
        m(".manage-error-content", [
          ManageStore.messageCode?.length > 0 && ManageStore.messageCode != "other_upload_error"
            ? m("p", t(ManageStore.messageCode))
            : m("p", ManageStore.errorDetails),
          m(ActionButton, {
            label: t("back_to_upload_after_error"),
            onclick: () => m.route.set("/manage/publish"),
          }),
        ]),
      ]
    });
  },

  // Step: 'done'
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
      ]
    });
  }
};

// --- MAIN COMPONENT ---
export let ManageView = {
  oncreate: function () {
    ManageStore.checkPHPPresent();
    Logger.addObserver(() => m.redraw());
  },

  onremove: function () {
    Logger.removeObserver(() => m.redraw());
  },

  view: function (vnode) {
    const step = vnode.attrs.step || "upload";
    const content = SubViews[step] ? SubViews[step]() : SubViews.upload();

    const showLogs = !["processing", "done"].includes(step);

    return m(".manage-view", [
      m(".manage-content", content),
      // For the upload step we render logs inside the upload subview so they appear
      // above the "Need a template?" panel. For other steps, keep previous behavior.
      showLogs && step !== "upload" ? renderLogs() : null,
    ]);
  },
};

// --- PRIVATE HELPER FUNCTIONS ---

function downloadCompiledData(blob, fileName) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderLogs() {
  const messages = Logger.getMessagesForDisplay();
  if (messages.length === 0) return null;

  return m(".manage-logs", [
    m(".manage-logs-header", [
      m("span", t("log_messages") || "Messages"),
      m("span.manage-logs-count", messages.length),
    ]),
    m(".manage-logs-list",
      messages.map(function (logItem) {
        return m(".manage-log-item." + logItem.level, [
          m(".manage-log-content", [
            m("span.manage-log-level", t("log_" + logItem.level)),
            m("span.manage-log-message", m.trust(logItem.message)),
          ]),
        ]);
      })
    ),
  ]);
}

function renderDropzone() {
  function processUpload(filepicker, file, checkAssetsSize) {
    if (!file || !file.name) {
      Logger.error(t("chose_a_file"));
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      Logger.error(t("wrong_filetype"));
      return;
    }
    ManageStore.reset();
    ManageStore.isProcessing = true;
    m.route.set("/manage/processing");

    let reader = new FileReader();
    reader.addEventListener("loadend", (evt) => {
      setTimeout(() => {
        ManageStore.dataman = new DataManager();
        let extractor = new ExcelBridge(evt.target.result);
        ManageStore.dataman.loadData(extractor, checkAssetsSize);
        const compiledData = ManageStore.dataman.getCompiledChecklist();

        if (Logger.hasErrors()) {
          m.route.set("/manage/upload", null, { replace: true });
        } else {
          Checklist.loadData(compiledData, true);
          Checklist.getTaxaForCurrentQuery();
          m.route.set("/manage/review", null, { replace: true });
        }
        filepicker.value = "";
      }, 50);
    });

    reader.readAsArrayBuffer(file);
  }

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  return m(".manage-dropzone#dropzone", {
    ondrag: preventDefaults,
    ondragstart: (e) => { preventDefaults(e); document.getElementById("dropzone").classList.add("entered"); },
    ondragend: (e) => { preventDefaults(e); document.getElementById("dropzone").classList.remove("entered"); },
    ondragover: (e) => { preventDefaults(e); document.getElementById("dropzone").classList.add("entered"); },
    ondragenter: (e) => { preventDefaults(e); document.getElementById("dropzone").classList.add("entered"); },
    ondragleave: (e) => { preventDefaults(e); document.getElementById("dropzone").classList.remove("entered"); },
    ondrop: function (e) {
      preventDefaults(e);
      var dt = e.dataTransfer;
      document.getElementById("dropzone").classList.remove("entered");
      processUpload(
        document.getElementById("excelupload"),
        dt.files[0],
        document.getElementById("checkassetssize").checked
      );
    },
  }, [
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
  ]);
}

function renderServerUploadForm() {
  return m("form#updateform.manage-form", {
    onsubmit: function (e) {
      e.preventDefault();
      e.stopPropagation();

      const formData = new FormData(this);
      let compressed = compressor.compress(JSON.stringify(ManageStore.dataman.getCompiledChecklist()));
      formData.append("checklist_data", compressed);
      const request = new XMLHttpRequest();

      request.onreadystatechange = function (event) {
        if (request.readyState === 4) {
          if (request.status === 200) {
            let result = "";
            try {
              if (request.responseText.indexOf("POST Content-Length") >= 0 && request.responseText.indexOf("exceeds") >= 0) {
                throw "the POST Content-Length exceeds the limit";
              }
              try {
                result = JSON.parse(request.responseText);
              } catch {
                throw "incorrect server response. If you are using static webhosting, you need to upload the checklist.json manually.";
              }
            } catch (ex) {
              result = {
                state: "error",
                details: [
                  m("div", t("server_returned_odd_message")),
                  m("div[style=margin-top: 1em;]", t("server_returned_odd_message_details") + ex),
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
            if (request.statusText.toLowerCase() == "not found") {
              ManageStore.errorDetails = t("upload_disabled");
            } else {
              ManageStore.errorDetails = t("network_error") + " " + request.statusText;
            }
            m.route.set("/manage/error");
          }
          m.redraw();
        }
      };
      request.open("POST", "../update.php");
      request.send(formData);
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
      onclick: function (e) {
        e.preventDefault();
        document.getElementById("updateform").requestSubmit();
      },
    }),
  ]);
}
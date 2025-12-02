import m from "mithril";
import { marked } from "marked";

import { checkForChecklistUpdate } from "../app.js";
import { ExcelBridge } from "../components/ExcelBridge.js";
import { compressor, routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { DataManager } from "../model/DataManager.js";
import { _t } from "../model/I18n.js";
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

// --- VIEW HELPERS ---
const SubViews = {
  // Step: 'upload'
  upload: function () {
    if (ManageStore.dataman && !ManageStore.isProcessing) {
      ManageStore.reset();
    }

    return [
      renderUploaderComponent(),
      Logger.hasErrors()
        ? m(".manage-message", _t("data_upload_import_dirty"))
        : null,
    ];
  },

  // Step: 'processing'
  processing: function () {
    if (!ManageStore.isProcessing) {
      setTimeout(() => m.route.set("/manage/upload"), 0);
      return null;
    }

    return m("div", [
      m("h2", _t("processing")),
      m(".processing-wrapper", [m(".spinner"), _t("data_upload_processing")]),
      m(".manage-message", _t("this_may_take_time")),
    ]);
  },

  // Step: 'review'
  review: function () {
    if (!ManageStore.dataman) {
      setTimeout(() => m.route.set("/manage/upload"), 0);
      return null;
    }

    return [
      m("h2", _t("review_draft_heading")),
      m(".manage-message", _t("review_draft")),
      m(".draft-options", [
        m("div", [
          m("img[src=img/ui/manage/errors.svg]"),
          m("div", _t("not_all_good")),
          m("button.uploadbutton", {
            onclick: () => m.route.set("/manage/upload")
          }, _t("back_to_upload")),
        ]),
        m("div", [
          m("img[src=img/ui/manage/clean.svg]"),
          m("div", _t("all_good")),
          m("button.uploadbutton", {
            onclick: () => m.route.set("/manage/publish")
          }, _t("proceed_to_update")),
        ]),
      ]),
    ];
  },

  // Step: 'publish'
  publish: function () {
    if (!ManageStore.dataman) { m.route.set("/manage/upload"); return null; }

    return [
      ManageStore.shouldShowUploadForm === true ? renderServerUploadForm() : null,
      m(".static-download", [
        m("h2", _t("download_data")),
        m(".manage-message", m.trust(marked.parse(_t("download_for_manual_update")))),
        m("button.uploadbutton", {
          onclick: function () {
            let json = ManageStore.dataman.getCompiledChecklist();
            var blob = new Blob(
              [compressor.compress(JSON.stringify(json))],
              { type: "application/json;charset=utf-8" }
            );
            downloadCompiledData(blob, "checklist.json");
          },
        }, _t("download_checklist")),

        m("div[style=margin-top:1.5em;]",
          m("button.uploadbutton.uploadbutton-small", {
            style: "margin-top:1em;",
            onclick: () => m.route.set("/manage/upload"),
          }, _t("back_to_upload_small"))
        )
      ]),
    ];
  },

  // Step: 'error'
  error: function () {
    return [
      m("div", [
        m("img[src=img/ui/manage/error.svg]"),
        m("h2", _t("error_publishing")),
        ManageStore.messageCode?.length > 0 && ManageStore.messageCode != "other_upload_error"
          ? m(".manage-message", _t(ManageStore.messageCode))
          : m(".manage-message", ManageStore.errorDetails),
        m("button.uploadbutton", {
          onclick: () => m.route.set("/manage/publish"),
        }, _t("back_to_upload_after_error")),
      ]),
    ];
  },

  // Step: 'done'
  done: function () {
    return m("div", [
      m("img[src=img/ui/manage/update_done.svg]"),
      m("h2", _t("done")),
      m(".manage-message", _t("update_published")),
      m("button.uploadbutton", {
        onclick: function () {
          Checklist._isDraft = false;
          checkForChecklistUpdate(navigator.serviceWorker);
          ManageStore.reset();
          routeTo("/checklist");
        },
      }, _t("manage_back_to_search")),
    ]);
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

    return m(".manage-ui", [
      content,
      (step !== "processing" && step !== "done") ? renderLogs() : null
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
  return m(".log",
    Logger.getMessagesForDisplay().map(function (logItem) {
      return m(".log-item." + logItem.level, [
        m(".message", m.trust("<strong>" + _t("log_" + logItem.level) + ": </strong>" + logItem.message)),
      ]);
    })
  );
}

function renderUploaderComponent() {
  const isDataReady = Checklist._isDataReady;

  function processUpload(filepicker, file, checkAssetsSize) {
    if (!file || !file.name) {
      Logger.error(_t("chose_a_file"));
      return;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      Logger.error(_t("wrong_filetype"));
      return;
    }
    ManageStore.reset();
    ManageStore.isProcessing = true;
    m.route.set("/manage/processing");

    let reader = new FileReader();
    reader.addEventListener("loadend", (evt) => {
      // Defer heavy processing to next frame so spinner can render
      setTimeout(() => {
        ManageStore.dataman = new DataManager();
        let extractor = new ExcelBridge(evt.target.result);
        ManageStore.dataman.loadData(extractor, checkAssetsSize);

        // Pre-calculate the compiled checklist to trigger F-directive/asset errors immediately
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

  return m("div", [
    // 1. Intro or Waiting Message
    isDataReady
      ? m(".manage-message", _t("data_upload_waiting"))
      : renderEmptyStateIntro(),

    // 2. Help/Templates (Only if NO data - appears above dropzone)
    !isDataReady ? renderTemplateHelpers(true) : null,

    // 3. Dropzone
    m(".dropzone#dropzone", {
      ondrag: preventDefaults,
      ondragstart: (e) => { preventDefaults(e); document.getElementById("dropzone").classList.add("entered"); },
      ondragend: (e) => { preventDefaults(e); document.getElementById("dropzone").classList.add("entered"); },
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
    },
      m("div", [
        m("div", [
          m("label.uploadbutton[for=excelupload]", _t("click_to_upload")),
          m("br"),
          m("label", _t("or_drag_it")),
          m("input[type=file][id=excelupload][accept=.xlsx][style=display: none]", {
            onchange: function (e) {
              processUpload(this, e.target.files[0], document.getElementById("checkassetssize").checked);
            },
          }
          ),
          m(".wrap", [
            m("img.upload-icon[src=img/ui/manage/upload.svg]"),
            m("div", [
              m(".check-assets-size", [
                m("input[checked][type=checkbox][id=checkassetssize][style=margin-right: 0.5em; width: 1.5em; height: 1.5em;]"),
                m("label[for=checkassetssize]", _t("check_assets_size1")),
              ]),
              m("div[style=font-size: 85%; margin-top: 0.5em; text-align: left]", _t("check_assets_size2")),
            ])
          ]),
        ]),
      ])
    ),

    // 4. Help/Templates (Only if Data exists - appears below dropzone)
    isDataReady ? renderTemplateHelpers(false) : null
  ]);
}

// --- New helper for just the intro part of the empty state ---
function renderEmptyStateIntro() {
  return m(".no-data", [
    m("div[style=text-align: center;]", [
      m("img.upload-icon[src=img/icon_maskable.svg][style=width: auto; height: 15em; margin: 0px]"),
      m("h1", _t("fresh_install_welcome")),
      m("div", _t("fresh_install_welcome_message")),
    ])
  ]);
}

// --- New helper for the blank spreadsheet/docs/buttons ---
function renderTemplateHelpers(showContinuedText) {
  return m("div", [
    m("h2", _t("start_scratch_title")),
    m(".manage-message", m.trust(marked.parse(_t("starting_from_scratch_links")))),
    m("button.uploadbutton.uploadbutton-small", {
      style: "margin-top: 0.5em; margin-bottom: 1em;",
      onclick: () => {
        exportTemplateSpreadsheet();
      },
    }, _t("download_blank_sheet_button")),

    // Show "Once ready, upload below..." text only if requested (Fresh install)
    showContinuedText
      ? m("h2", _t("starting_from_scratch_continued"))
      : null
  ]);
}

function renderServerUploadForm() {
  return [
    m("h2", _t("data_upload_integrate_data")),
    m(".manage-message", _t("enter_creds_to_publish")),
    m("form#updateform[method=post]", {
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
                    m("div", _t("server_returned_odd_message")),
                    m("div[style=margin-top: 1em;]", _t("server_returned_odd_message_details") + ex),
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
                ManageStore.errorDetails = _t("upload_disabled");
              } else {
                ManageStore.errorDetails = _t("network_error") + " " + request.statusText;
              }
              m.route.set("/manage/error");
            }
            m.redraw();
          }
        };
        request.open("POST", "../update.php");
        request.send(formData);
      },
    },
      [
        m("label", _t("user_name")), m("br"),
        m("input[type=text][name=username][id=username]", ""), m("br"),
        m("label", _t("password")), m("br"),
        m("input[type=password][name=password][id=password]", ""), m("br"),
        m("button.uploadbutton", {
          onclick: function (e) { document.getElementById("updateform").requestSubmit(); },
        }, _t("publish_checklist")
        ),
      ]
    ),
  ];
}
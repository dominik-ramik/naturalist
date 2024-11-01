import { checkForChecklistUpdate } from "../app.js";
import { ExcelBridge } from "../components/ExcelBridge.js";
import { compressor, routeTo } from "../components/Utils.js";
import { Checklist } from "../model/Checklist.js";
import { DataManager } from "../model/DataManager.js";
import { _t } from "../model/I18n.js";

let dataman = new DataManager();

export let ManageView = {
    state: "waiting",
    stateDetails: "",

    view: function(vnode) {
        let ui = [];

        return m(".manage-ui", [
            this.state == "waiting" || this.state == "dirty" ? this.uploader() : null,
            this.state == "processing" ? this.processingWaiter() : null,
            this.state == "dirty" ? m(".manage-message", _t("data_upload_import_dirty")) : null,
            this.state == "clean" ? this.decideDraft() : null,
            this.state == "tested" ? this.uploadOrDownloadData() : null,
            this.state == "uploaderror" ? this.uploadError() : null,
            this.state == "done" ? this.done() : null,
            this.state != "processing" && this.state != "done" ? this.logList() : null,
        ]);
    },

    logList: function() {
        return m(".log", dataman.loggedMessages.slice(0).reverse().map(function(logItem) {
            return m(".log-item." + logItem.level, [
                m(".message", m.trust("<strong>" + _t("log_" + logItem.level) + ": </strong>" + logItem.message)),
            ])
        }));
    },

    done: function() {
        return m("div", [
            m("img[src=img/ui/manage/update_done.svg]"),
            m("h2", _t("done")),
            m(".manage-message", _t("update_published")),
            m("button.uploadbutton", {
                onclick: function() {
                    ManageView.state = "waiting";
                    Checklist._isDraft = false;
                    console.log("Checking for checklist update");
                    checkForChecklistUpdate(navigator.serviceWorker);
                    routeTo("/checklist");
                }
            }, _t("manage_back_to_search")),
        ]);
    },
    uploadError: function() {
        return [
            m("div", [
                m("img[src=img/ui/manage/error.svg]"),
                m("h2", _t("error_publishing")),
                m(".manage-message", ManageView.stateDetails),
                m("button.uploadbutton", {
                    onclick: function(e) {
                        ManageView.state = "waiting";
                    }
                }, _t("back_to_upload_after_error")),
            ]),
        ];
    },

    uploadOrDownloadData: function() {
        return [
            m("h2", _t("data_upload_integrate_data")),
            m(".manage-message", _t("enter_creds_to_publish")),
            m("form#updateform[method=post]", {
                onsubmit: function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    const formData = new FormData(this);
                    let compressed = compressor.compress(JSON.stringify(dataman.getCompiledChecklist()));
                    formData.append("checklist_data", compressed);
                    const request = new XMLHttpRequest();

                    request.onreadystatechange = function(event) {
                        if (request.readyState === 4) {
                            if (request.status === 200) {
                                let result = "";
                                try {
                                    //console.log(request.responseText);

                                    if (request.responseText.indexOf("POST Content-Length") >= 0 && request.responseText.indexOf("exceeds") >= 0) {
                                        throw "the POST Content-Length exceeds the limit";
                                    }

                                    result = JSON.parse(request.responseText);
                                } catch (ex) {
                                    result = { state: "error", details: _t("server_returned_odd_message") + request.responseText };
                                }

                                if (result.state == "success") {
                                    ManageView.state = "done";
                                    m.redraw();
                                    return;
                                } else {
                                    ManageView.state = "uploaderror";
                                    ManageView.stateDetails = result.details;
                                    m.redraw();
                                    return;
                                }
                            } else {
                                ManageView.state = "uploaderror";

                                if (request.statusText.toLowerCase() == "not found") {
                                    ManageView.stateDetails = _t("upload_disabled");
                                } else {
                                    ManageView.stateDetails = _t("network_error") + " " + request.statusText;
                                }

                                m.redraw();
                                return;
                            }
                        }
                    };
                    request.open("POST", "./update.php");
                    request.send(formData);

                }
            }, [
                m("label", _t("user_name")),
                m("br"),
                m("input[type=text][name=username][id=username]", ""),
                m("br"),
                m("label", _t("password")),
                m("br"),
                m("input[type=password][name=password][id=password]", ""),
                m("br"), m("button.uploadbutton", {
                    onclick: function(e) {
                        document.getElementById("updateform").requestSubmit();
                    }
                }, _t("publish_checklist")),
            ]),
            m(".static-download", [
                m("h2", _t("download_data")),
                m(".manage-message", m.trust(marked.parse(_t("download_for_manual_update")))),
                m("button.uploadbutton", {
                    onclick: function(e) {
                        var blob = new Blob([compressor.compress(JSON.stringify(dataman.getCompiledChecklist()))], { type: "application/json;charset=utf-8" });
                        window.saveAs(blob, "checklist.json");
                    }
                }, _t("download_checklist")),
            ])

        ];
    },

    decideDraft: function() {
        return [
            m("h2", _t("review_draft_heading")),
            m(".manage-message", _t("review_draft")),
            m(".draft-options", [
                m("div", [
                    m("img[src=img/ui/manage/errors.svg]"),
                    m("div", _t("not_all_good")),
                    m("button.uploadbutton", {
                        onclick: function(e) {
                            ManageView.state = "waiting";
                        }
                    }, _t("back_to_upload")),
                ]),
                m("div", [
                    m("img[src=img/ui/manage/clean.svg]"),
                    m("div", _t("all_good")),
                    m("button.uploadbutton", {
                        onclick: function(e) {
                            ManageView.state = "tested";
                        }
                    }, _t("proceed_to_update")),
                ])
            ])
        ];
    },

    processingWaiter: function() {
        return m("div", [
            m("h2", _t("processing")),
            m(".processing-wrapper", [
                m(".spinner"),
                _t("data_upload_processing")
            ]),
            m(".manage-message", _t("this_may_take_time")),
        ]);
    },

    uploader: function() {
        function processUpload(filepicker, file) {
            if (!file || !file.name) {
                ManageView.state = "uploaderror";
                ManageView.stateDetails = _t("chose_a_file");
                return;
            }
            if (!file || !file.name || !file.name.toLowerCase().endsWith(".xlsx")) {
                ManageView.state = "uploaderror";
                ManageView.stateDetails = _t("wrong_filetype");
                return;
            }

            ManageView.state = "processing";
            m.redraw();

            let reader = new FileReader();
            reader.addEventListener("loadend", (evt) => {
                dataman.loadData(new ExcelBridge(evt.target.result));
                if (dataman.hasErrors) {
                    ManageView.state = "dirty";
                } else {
                    ManageView.state = "clean";
                    Checklist.loadData(dataman.getCompiledChecklist(), true);
                    Checklist.getTaxaForCurrentQuery();
                }
                filepicker.value = "";
                m.redraw();
            });
            reader.readAsArrayBuffer(file);
        }

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        return m("div", [

            Checklist._isDataReady ? null :
            m(".no-data", [
                _t("no_data")
            ]),
            m(".manage-message", _t("data_upload_waiting")),
            m(".dropzone#dropzone", {
                ondrag: function(e) {
                    preventDefaults(e);
                },
                ondragstart: function(e) {
                    preventDefaults(e);
                    document.getElementById("dropzone").classList.add("entered");
                },
                ondragend: function(e) {
                    preventDefaults(e);
                    document.getElementById("dropzone").classList.add("entered");
                },
                ondragover: function(e) {
                    preventDefaults(e);
                    document.getElementById("dropzone").classList.add("entered");
                },
                ondragenter: function(e) {
                    preventDefaults(e);
                    document.getElementById("dropzone").classList.add("entered");
                },
                ondragleave: function(e) {
                    preventDefaults(e);
                    document.getElementById("dropzone").classList.remove("entered");
                },
                ondrop: function(e) {
                    preventDefaults(e);
                    var dt = e.dataTransfer;
                    document.getElementById("dropzone").classList.remove("entered");
                    processUpload(document.getElementById("excelupload"), dt.files[0]);
                },
            }, m(".wrap", [
                m("img.upload-icon[src=img/ui/manage/upload.svg]"),
                m("div", [
                    m("label.uploadbutton[for=excelupload]", _t("click_to_upload")),
                    m("br"),
                    m("label", _t("or_drag_it")),
                    m("input[type=file][id=excelupload][accept=.xlsx][style=display: none]", {
                        onchange: function(e) {
                            processUpload(this, e.target.files[0]);
                        }
                    })
                ]),
            ])),
            m(".manage-message", m.trust(_t("starting_from_scratch"))),
        ]);
    }
}
import { _t } from "./model/I18n.js";
import { AppLayoutView, Toast } from "./view/AppLayoutView.js"
import { Checklist } from "./model/Checklist.js";
import { SearchView } from "./view/SearchView.js";
import { DetailsView } from "./view/DetailsView.js"
import { AboutView } from "./view/AboutView.js";
import { ManageView } from "./view/ManageView.js";
import { Settings } from "./model/Settings.js";
import { compressor } from "./components/Utils.js";

export let appVersion = ""; //will be loaded from SW

window.addEventListener('load', function () {
    registerSW();
    //console.log("Return to PWA mode uncomment previous line")
    runApp();
});

async function registerSW() {
    makeStoragePersistent()

    if ('serviceWorker' in navigator) {
        try {
            navigator.serviceWorker.register('serviceworker.js');
            navigator.serviceWorker.ready
                .then((registration) => {
                    openComChannel(registration.active);
                    registration.active.postMessage({ type: 'GET_VERSION' });
                    checkForChecklistUpdate(registration.active);
                    runApp();
                });
        } catch (e) {
            console.log('SW registration failed: ' + e.message);
        }
    }
}

function makeStoragePersistent()
{
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then((persistent) => {
          if (persistent) {
            console.log("Storage will not be cleared except by explicit user action");
          } else {
            console.log("Storage may be cleared by the UA under storage pressure.");
          }
        });
      }
}

const messageChannel = new MessageChannel();

function openComChannel(sw) {
    sw.postMessage({ type: 'PORT_INITIALIZATION' }, [
        messageChannel.port2,
    ]);

    //Listen to messages
    messageChannel.port1.onmessage = function (message) {
        // Process message

        switch (message.data.type) {
            case "APP_UPDATED":
                console.log("App updated");
                alert("UPDATE")
                window.setTimeout(() => {
                    location.reload();
                }, 200);

                break;
            case "CHECKLIST_UPDATED":
                console.log("Checklist data updated");
                Settings.lastKnownVersion(message.data.lastModifiedTimestamp);
                Toast.show(_t("checklist_data_updated"), {
                    whenClosed: function () {
                        window.location.href = window.location.origin + window.location.pathname;
                    }
                });

                break;

            case "FETCHING_RESSOURCE_FAILED":
                console.log("FETCHING_RESSOURCE_FAILED");
                Toast.show(_t("offline_fetch_failed"));
            case "VERSION":
                console.log("Version " + message.data.version);
                appVersion = message.data.version;
            default:
                break;
        }
    };
}

export function checkForChecklistUpdate(sw) {
    var checkDataUpdate = new XMLHttpRequest();
    checkDataUpdate.open("HEAD", "./data/checklist.json", true);
    checkDataUpdate.onreadystatechange = function () {
        if (checkDataUpdate.readyState === 2) {
            if (checkDataUpdate.status === 200) {
                let lastModifiedString = checkDataUpdate.getResponseHeader("Last-Modified");
                if (lastModifiedString === undefined || lastModifiedString === null || lastModifiedString === "") {
                    console.log("Last-modified not received: " + lastModifiedString);
                    //something failed, just get the cached vesion                
                    return;
                }

                lastModifiedString = lastModifiedString.substring(lastModifiedString.indexOf(", ") + 2);
                let lastModifiedTimestamp = Date.parse(lastModifiedString);
                let lastKnownTimestamp = Settings.lastKnownVersion();

                if (lastKnownTimestamp < lastModifiedTimestamp) {
                    //Checklist got updated
                    sw.postMessage({ type: 'UPDATE_CHECKLIST_DATA', lastModifiedTimestamp: lastModifiedTimestamp });
                } else {
                    // No update detected
                }
            } else {
                console.log("XHR status error: " + checkDataUpdate.status);
                //something failed, just get the cached vesion
            }
        }
    }
    checkDataUpdate.onerror = function (e) {
        console.log("Error trying to get checklist update: ", e);
    }
    checkDataUpdate.send();
}

function runApp() {
    m.request({
        method: "GET",
        url: "./data/checklist.json",
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Accept": "text/*"
        },
        extract: function (xhr) {
            if (xhr.status != 200) {
                return null;
            }

            let parsed = "";
            try {
                parsed = JSON.parse(compressor.decompress(xhr.responseText));
            } catch (ex) {
                console.log("Error parsing: ", ex);
            }
            return parsed;
        }
    }).then(function (checklistData) {
        window.setTimeout(function () {
            if (checklistData) {
                Checklist.loadData(checklistData, false);
            }

            let w = document.documentElement.clientWidth;
            let h = document.documentElement.clientHeight;
            if (w > 1024 || (w > 800 && w > h)) {
                AppLayoutView.mode = "desktop";
            } else {
                AppLayoutView.mode = "mobile";
            }

            readyPreloadableAssets()

            m.route(document.body, "/checklist", {
                "/search": {
                    render: function () {
                        AppLayoutView.display = "details";
                        return m(AppLayoutView, [
                            m(SearchView)
                        ]);
                    },
                },
                "/checklist": {
                    render: function () {
                        AppLayoutView.display = "checklist";
                        return m(AppLayoutView, [
                            m(SearchView)
                        ]);
                    },
                },
                "/details/:taxon/:tab": {
                    render: function () {
                        AppLayoutView.display = "details";
                        return m(AppLayoutView, [
                            m(DetailsView)
                        ]);
                    },
                },
                "/about/checklist": {
                    render: function () {
                        AppLayoutView.display = "details";
                        return m(AppLayoutView, [
                            m(AboutView, { text: Checklist.getProjectAbout() }),
                        ]);
                    },
                },
                "/about/app": {
                    render: function () {
                        AppLayoutView.display = "details";
                        return m(AppLayoutView, [
                            m(AboutView, { text: _t("about_app", appVersion) }),
                        ]);
                    },
                },
                "/manage": {
                    render: function () {
                        AppLayoutView.display = "details";
                        return m(AppLayoutView, [
                            m(ManageView),
                        ]);
                    },
                },
            });
        }, 50);
    });
}

function readyPreloadableAssets()
{
    Checklist.getPreloadableAssets()?.forEach(async (asset) => {
        await fetch(asset).catch((result) => console.log("ERROR downloading assets", result));
    })
}
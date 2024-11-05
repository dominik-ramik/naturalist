//This duplicates the externalised contsnts of the same name in Utils but Chrome would not allow the SW to register even in module mode so we have to repeat them here
const checklistURL = "./usercontent/data/checklist.json";
const checklistFileName = "checklist.json";

let version = "2.0.0";

let appCacheNameBase = "static";
let appCacheName = appCacheNameBase + "-v" + version;
let userCacheName = "user";

let communicationPort;

self.addEventListener("install", function (e) {
    self.skipWaiting();
    e.waitUntil(
        caches.open(appCacheName).then(function (cache) {
            staticResources.forEach(async (resource) => {
                try {
                    await cache.add(resource).catch((response) => console.log("Caught error fetching", response));
                }
                catch {
                    console.log("Error fetching", resource)
                }
            })
        })
    );
});

self.addEventListener("updatefound", function (e) {
    communicationPort.postMessage({ type: 'APP_UPDATED' });
});

//* Cache first
self.addEventListener('fetch', function (e) {
    let isChecklistHeadReques = e.request.method.toLowerCase() == "head" && e.request.url.toLowerCase().endsWith("/" + checklistFileName);
    let isUpdatePHPRequest = e.request.url.toLowerCase().includes("/update.php");

    if (isChecklistHeadReques || isUpdatePHPRequest) {
        let response = null;
        e.respondWith((async function () {
            response = await fetch(e.request, { cache: "no-cache" });
            return response;
        })());
        return;
    }

    e.respondWith((async function () {

        const r = await caches.match(e.request);

        //console.log(`[SW] Fetching resource: ${e.request.url}`);
        if (r) { return r; }

        //console.log(`[SW] Not found in cache, trying the network: ${e.request.url}`);

        //make sure we always have a fresh reply for checklist data
        let response = null;
        if (e.request.url.toLowerCase().endsWith("/" + checklistFileName)) {
            response = await fetch(e.request, { cache: "no-cache" });
        } else {
            response = await fetch(e.request).then(function (response) {
                if (!response.ok && response.status != 304) {
                    // Got error response and status is not 304 (already cached)
                    console.log("Fetching problems");
                    console.log(response);
                    communicationPort.postMessage({ type: "FETCHING_RESSOURCE_FAILED" });
                    return;
                }
                return response;
            });
        }
        //
        let cache = null;

        function urlForUserCache(url) {
            return url.includes("/usercontent/") && !url.includes("/usercontent/identity")
        }

        if (urlForUserCache(e.request.url.toLowerCase())) {
            cache = await caches.open(userCacheName);
        } else if (e.request.url.toLowerCase().startsWith(self.location.origin.toLowerCase())) {
            cache = await caches.open(appCacheName);
        }

        if (cache !== null && response?.status == 200 && e.request.method.toLowerCase() != "head") {
            //console.log(`[SW] Caching new resource: ${e.request.url}`);
            cache.put(e.request, response.clone());
        }

        return response;
    })());
});
//*/

self.addEventListener('activate', (e) => {

    self.clients.claim();

    e.waitUntil(caches.keys().then(function (keyList) {
        //console.log(keyList);
        return Promise.all(keyList.map(function (key) {
            if (key === appCacheName || key === userCacheName) {
                return;
            }
            if (key.startsWith(appCacheNameBase) + "-") {
                //skip deleting other caches than appCache
                console.log("DELETING cache " + key);
                return caches.delete(key);
            }
        }))
    }));
});

function refreshCachedChecklistData() {
    console.log("Fetching fresh data");
    let dataRequest = new Request(checklistURL, {
        method: 'GET',
        cache: "reload"
    });
    fetch(dataRequest)
        .then(function (response) {
            caches.open(appCacheName).then(function (cache) {
                cache.put(dataRequest.clone(), response.clone());
            });
        })
        .catch(function (err) {
            //failed to fetch
            console.log("Could not update the data. Fetch failed.");
        });
}

//Save reference to port
self.addEventListener('message', function (message) {
    if (message.data && message.data.type === 'PORT_INITIALIZATION') {
        //console.log("SW side received PORT INIT");
        communicationPort = message.ports[0];
    } else if (message.data && message.data.type == "UPDATE_CHECKLIST_DATA") {
        //console.log("[SW] Checklist got updated");
        refreshCachedChecklistData();
        communicationPort.postMessage({ type: 'CHECKLIST_UPDATED', lastModifiedTimestamp: message.data.lastModifiedTimestamp });
    } else if (message.data && message.data.type == "GET_VERSION") {
        communicationPort.postMessage({ type: 'VERSION', version: version });
    }
});

let staticResources = [
    "./",
    "./index.html",
    "./docs/index.html",
    "./docs/docgen.js",
    "./docs/docs.css",
    "./docs/us-birds.xlsx",
    "./docs/blank-naturalist-spreadsheet.xlsx",
    "./usercontent/identity/favicon.png",
    "./usercontent/identity/manifest.json",
    "./img/icon.svg",
    "./img/icon_maskable.svg",
    "./img/icon_transparent_dark.svg",
    "./img/icon_transparent_fine.svg",
    "./img/ui/checklist/copy.svg",
    "./img/ui/checklist/search.svg",
    "./img/ui/checklist/results.svg",
    "./img/ui/checklist/filter.svg",
    "./img/ui/manage/clean.svg",
    "./img/ui/manage/errors.svg",
    "./img/ui/manage/error.svg",
    "./img/ui/manage/update_done.svg",
    "./img/ui/manage/upload.svg",
    "./img/ui/menu/about.svg",
    "./img/ui/menu/arrow_back.svg",
    "./img/ui/menu/expand_less.svg",
    "./img/ui/menu/expand_more.svg",
    "./img/ui/menu/filter_list.svg",
    "./img/ui/menu/filter_list_off.svg",
    "./img/ui/menu/language.svg",
    "./img/ui/menu/manage.svg",
    "./img/ui/menu/menu.svg",
    "./img/ui/menu/docs.svg",
    "./img/ui/menu/push_pin.svg",
    "./img/ui/menu/remove.svg",
    "./img/ui/menu/share.svg",
    "./img/ui/menu/translation.svg",
    "./img/ui/search/checkbox_checked.svg",
    "./img/ui/search/checkbox_unchecked.svg",
    "./img/ui/search/clear_filter.svg",
    "./img/ui/search/copy.svg",
    "./img/ui/search/expand.svg",
    "./img/ui/search/search_data.svg",
    "./img/ui/search/search_taxa.svg",
    "./img/ui/tabs/externalsearch.svg",
    "./img/ui/tabs/map.svg",
    "./img/ui/tabs/media.svg",
    "./img/ui/tabs/text.svg",
]
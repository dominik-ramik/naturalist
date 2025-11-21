import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

const checklistURL = "./usercontent/data/checklist.json";
const checklistFileName = "checklist.json";

let appCacheNameBase = "static";
let appCacheName = appCacheNameBase + "-v" + import.meta.env.VITE_APP_VERSION;
let userCacheName = "user";

let communicationPort;

precacheAndRoute(self.__WB_MANIFEST);

cleanupOutdatedCaches();

//* Cache first
self.addEventListener('fetch', function (e) {
    let isChecklistHeadReques = (e.request.method.toLowerCase() == "head" && e.request.url.toLowerCase().endsWith("/" + checklistFileName));
    let isUpdatePHPRequest = e.request.url.toLowerCase().includes("/update.php");

    if (isChecklistHeadReques || isUpdatePHPRequest) {
        let response = null;
        e.respondWith((async function () {
            try {
                response = await fetch(e.request, { cache: "no-cache" });
            }
            catch (ex) {
                console.error("[SW] Fetching error", e.request.url, ex);
            }

            return response;
        })());

        return;
    }

    e.respondWith((async function () {

        // Do not serve from cache for /usercontent/ ... .md files
        const isUserMdFile = (
            e.request.url.toLowerCase().includes("/usercontent/") &&
            e.request.url.toLowerCase().endsWith(".md")
        );
        if (isUserMdFile) {
            // Always fetch from network, never cache
            try {
                return await fetch(e.request, { cache: "no-cache" });
            } catch (ex) {
                console.error("[SW] Fetching error (md file)", e.request.url, ex);
                return new Response("", { status: 404 });
            }
        }

        const r = await caches.match(e.request);
        if (r) { return r; }

        //make sure we always have a fresh reply for checklist data
        let response = null;
        if (e.request.url.toLowerCase().endsWith("/" + checklistFileName)) {
            response = await fetch(e.request, { cache: "no-cache" });
        } else {
            response = await fetch(e.request).then(function (response) {
                if (!response.ok && response.status != 304) {
                    // Got error response and status is not 304 (already cached)
                    console.log("Fetching problems", response.status, e.request.url);
                    communicationPort.postMessage({ type: "FETCHING_RESSOURCE_FAILED" });
                    return null;
                }
                return response;
            });
        }
        //
        let cache = null;

        function urlForUserCache(url) {
            // Do not cache .md files in /usercontent/
            if (url.includes("/usercontent/") && url.endsWith(".md")) return false;
            return url.includes("/usercontent/") && !url.includes("/usercontent/identity");
        }

        if (urlForUserCache(e.request.url.toLowerCase())) {
            cache = await caches.open(userCacheName);
        } else if (e.request.url.toLowerCase().startsWith(self.location.origin.toLowerCase())) {
            cache = await caches.open(appCacheName);
        }

        if (cache !== null && response?.status == 200 && e.request.method.toLowerCase() != "head") {
            cache.put(e.request, response.clone());
        }

        return response;
    })());
});

function refreshCachedChecklistData() {
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
            console.log("Could not update the data. Fetch failed.", err);
        });
}

//Save reference to port
self.addEventListener('message', function (message) {
    if (message.data && message.data.type === 'PORT_INITIALIZATION') {
        communicationPort = message.ports[0];
        communicationPort.onmessage = function (portEvent) {
            handleAppMessage(portEvent.data);
        };

        communicationPort.postMessage({ type: 'PORT_INITIALIZED' });
    } else {
        handleAppMessage(message.data);
    }
});

async function handleAppMessage(message) {
    if (message.type == "UPDATE_CHECKLIST_DATA") {
        refreshCachedChecklistData();
        if (communicationPort) {
            communicationPort.postMessage({
                type: 'CHECKLIST_UPDATED',
                updateMeta: message.updateMeta
            });
        }
    }
    else if (message.type == "SKIP_WAITING") {
        self.skipWaiting();
    }
    else if (message.type === "CACHE_ASSETS" && Array.isArray(message.assets)) {
        // Utility to check internet connectivity
        const checkInternetConnection = async () => {
            if (!navigator.onLine) return false; // Simple check first
            try {
                const response = await fetch(self.location.origin, { method: 'HEAD', cache: 'no-store' });
                return response.ok;
            } catch (error) {
                return false;
            }
        };

        (async () => {
            const isOnline = await checkInternetConnection();
            if (!isOnline) {
                console.log("[SW] Skipping asset caching: offline or network issue.");
                return;
            }

            try {
                const cache = await caches.open(userCacheName);
                const assets = message.assets || [];

                const assetMap = new Map();
                assets.forEach(asset => {
                    try {
                        const absUrl = new URL(asset, self.location.origin).href;
                        assetMap.set(absUrl, asset);
                    } catch (e) {
                        console.warn("[SW] Skipping invalid URL:", asset);
                    }
                });

                const cachedRequests = await cache.keys();
                for (const request of cachedRequests) {
                    if (!assetMap.has(request.url)) {
                        await cache.delete(request);
                        console.log("[SW] Purged abandoned asset:", request.url);
                    }
                }

                const missingAssets = [];
                for (const [absUrl, relUrl] of assetMap) {
                    const match = await cache.match(absUrl);
                    if (!match) {
                        missingAssets.push(relUrl); // Push the relative path for fetching
                    }
                }

                console.log("All assets to cache:", assets, "Missing assets:", missingAssets);

                if (missingAssets.length > 0) {
                    console.log(`[SW] Attempting to cache ${missingAssets.length} new assets...`);

                    // We allow individual downloads to fail without stopping the others
                    await Promise.all(missingAssets.map(async (url) => {
                        try {
                            const req = new Request(url);
                            const res = await fetch(req);
                            if (res.ok) {
                                await cache.put(req, res);
                            } else {
                                console.warn(`[SW] Failed to fetch ${url}: ${res.status}`);
                            }
                        } catch (error) {
                            console.warn(`[SW] Network error for ${url}`, error);
                        }
                    }));

                    console.log("[SW] Asset sync complete.");
                } else {
                    console.log("[SW] All assets already cached.");
                }

            } catch (error) {
                console.error("[SW] Critical error during asset caching:", error);
            }
        })();
    }
}
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

const checklistURL = "./usercontent/data/checklist.json";
const checklistFileName = "checklist.json";

let appCacheNameBase = "static";
let appCacheName = appCacheNameBase + "-v" + import.meta.env.VITE_APP_VERSION;
let userCacheName = "user";

let communicationPort;

precacheAndRoute(self.__WB_MANIFEST);

// 1. WORKBOX CLEANUP (Cleans precache-v... files)
cleanupOutdatedCaches();

// 2. FORCE IMMEDIATE ACTIVATION (The "Emergency Valve")
// This ensures the new SW installs immediately, even if the app is crashed.
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// 3. MANUAL CACHE CLEANUP (The "Nuclear Option")
// This runs immediately after 'install'. We delete ANY cache that is 
// 1) A 'static-' cache AND 2) NOT the current version.
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Check if it's an old static cache
                    if (cacheName.startsWith(appCacheNameBase) && cacheName !== appCacheName) {
                        console.log(`[SW] Deleting old cache: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Take control of all clients immediately
            return self.clients.claim();
        })
    );
});

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
            try {
                return await fetch(e.request, { cache: "no-cache" });
            } catch (ex) {
                console.error("[SW] Fetching error (md file)", e.request.url, ex);
                return new Response("", { status: 404 });
            }
        }

        // IMPORTANT: Because we deleted old caches in 'activate', 
        // this match will now ONLY find assets in the current 'appCacheName'
        // or the 'user' cache. The broken v3.0.8 assets are gone.
        const r = await caches.match(e.request);
        if (r) { return r; }

        //make sure we always have a fresh reply for checklist data
        let response = null;
        if (e.request.url.toLowerCase().endsWith("/" + checklistFileName)) {
            response = await fetch(e.request, { cache: "no-cache" });
        } else {
            response = await fetch(e.request).then(function (response) {
                if (!response.ok && response.status != 304) {
                    console.log("Fetching problems", response.status, e.request.url);
                    if(communicationPort) communicationPort.postMessage({ type: "FETCHING_RESSOURCE_FAILED" });
                    return null;
                }
                return response;
            });
        }
        //
        let cache = null;

        function urlForUserCache(url) {
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

// ... (Keep your existing refreshCachedChecklistData, message listener, and handleAppMessage functions here exactly as they were)
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
            console.log("Could not update the data. Fetch failed.", err);
        });
}

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
       // ... (Keep your existing CACHE_ASSETS logic)
        // Utility to check internet connectivity
        const checkInternetConnection = async () => {
            if (!navigator.onLine) return false; 
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
                        missingAssets.push(relUrl);
                    }
                }

                if (missingAssets.length > 0) {
                    console.log(`[SW] Attempting to cache ${missingAssets.length} new assets...`);
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
                } 
            } catch (error) {
                console.error("[SW] Critical error during asset caching:", error);
            }
        })();
    }
}
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

const checklistURL = "./usercontent/data/checklist.json";
const checklistFileName = "checklist.json";

// --- CACHE DEFINITIONS ---
let appCacheNameBase = "static";
let appCacheName = appCacheNameBase + "-v" + import.meta.env.VITE_APP_VERSION;
let userCacheName = "user";
// NEW: Dedicated cache for the critical data file
let dataCacheName = "checklist-data";

let communicationPort;

precacheAndRoute(self.__WB_MANIFEST);

// 1. WORKBOX CLEANUP
cleanupOutdatedCaches();

// 2. FORCE IMMEDIATE ACTIVATION
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// 3. CACHE CLEANUP
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Only delete old STATIC caches.
                    // Explicitly ignore 'user' and 'checklist-data' caches.
                    if (cacheName.startsWith(appCacheNameBase) && cacheName !== appCacheName) {
                        console.log(`[SW] Deleting old cache: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});

//* Fetch Strategy
self.addEventListener('fetch', function (e) {
    let isChecklistHeadRequest = (e.request.method.toLowerCase() == "head" && e.request.url.toLowerCase().endsWith("/" + checklistFileName));
    let isUpdatePHPRequest = e.request.url.toLowerCase().includes("/update.php");

    // A. Network-Only requests (HEAD checks, PHP scripts)
    if (isChecklistHeadRequest || isUpdatePHPRequest) {
        e.respondWith(fetch(e.request, { cache: "no-cache" }).catch((ex) => {
            return new Response(null, { status: 404, statusText: "Offline" });
        }));
        return;
    }

    // B. Network-Only for Markdown files (User content)
    const isUserMdFile = (
        e.request.url.toLowerCase().includes("/usercontent/") &&
        e.request.url.toLowerCase().endsWith(".md")
    );
    if (isUserMdFile) {
        e.respondWith(fetch(e.request, { cache: "no-cache" }).catch((ex) => {
            return new Response("", { status: 404 });
        }));
        return;
    }

    // C. STALE-WHILE-REVALIDATE for Checklist.json
    // 1. Serve from 'checklist-data' cache immediately.
    // 2. Update 'checklist-data' cache in background.
    if (e.request.url.toLowerCase().endsWith("/" + checklistFileName)) {
        e.respondWith((async function () {
            const dataCache = await caches.open(dataCacheName);
            let cachedResponse = await dataCache.match(e.request);

            // 1. SAFETY NET: If new cache is empty, check legacy caches
            if (!cachedResponse) {
                const userCache = await caches.open(userCacheName); // Check old 'user' cache
                cachedResponse = await userCache.match(e.request);

                if (cachedResponse) {
                    // Copy to new cache so we don't have to check legacy next time
                    dataCache.put(e.request, cachedResponse.clone());
                }
            }

            // 2. NETWORK UPDATE: Always try to update in the background
            const networkPromise = fetch(e.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    dataCache.put(e.request, networkResponse.clone());
                }
                return networkResponse;
            });

            // 3. RETURN STRATEGY: 
            // If we have data (new or old), return it fast & update in background.
            if (cachedResponse) {
                e.waitUntil(networkPromise.catch(() => { }));
                return cachedResponse;
            }

            // If we have absolutely nothing, we must wait for the network.
            return networkPromise;
        })());
        return;
    }

    // D. Cache-First Strategy for all other assets (App Shell & Images)
    e.respondWith((async function () {
        const r = await caches.match(e.request);
        if (r) { return r; }

        const response = await fetch(e.request).then(function (response) {
            if (!response.ok && response.status != 304) {
                if (communicationPort) communicationPort.postMessage({ type: "FETCHING_RESSOURCE_FAILED" });
                return null;
            }
            return response;
        });

        if (!response) return null;

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

        if (cache !== null && response.status == 200 && e.request.method.toLowerCase() != "head") {
            cache.put(e.request, response.clone());
        }

        return response;
    })());
});

// Update function now uses the dedicated cache
function refreshCachedChecklistData() {
    let dataRequest = new Request(checklistURL, {
        method: 'GET',
        cache: "reload"
    });
    fetch(dataRequest)
        .then(function (response) {
            // FIX: Save to dedicated data cache
            caches.open(dataCacheName).then(function (cache) {
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
                return;
            }

            try {
                // We still use userCacheName for images/assets
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
                    // Safety check: though checklist.json should be in dataCacheName now,
                    // we keep this check just in case a migration happens weirdly.
                    if (request.url.toLowerCase().endsWith("/" + checklistFileName)) {
                        continue;
                    }

                    if (!assetMap.has(request.url)) {
                        await cache.delete(request);
                    }
                }

                // Fetch missing assets...
                const missingAssets = [];
                for (const [absUrl, relUrl] of assetMap) {
                    // Check specific user cache first
                    const match = await cache.match(absUrl);
                    if (!match) {
                        missingAssets.push(relUrl);
                    }
                }

                if (missingAssets.length > 0) {
                    await Promise.all(missingAssets.map(async (url) => {
                        try {
                            const req = new Request(url);
                            const res = await fetch(req);
                            if (res.ok) {
                                await cache.put(req, res);
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
export const CacheScope = {
  DATASET: "dataset",
  LANGUAGE: "language",
  ALL: "all",
};

const DEV = import.meta.env && import.meta.env.DEV;

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return [CacheScope.ALL];
  const normalized = scopes.filter(Boolean);
  return normalized.length > 0 ? normalized : [CacheScope.ALL];
}

function shouldNotify(subscriptionScopes, invalidatedScope) {
  if (subscriptionScopes.includes(CacheScope.ALL)) return true;
  if (invalidatedScope === CacheScope.ALL) return true;
  if (invalidatedScope === CacheScope.DATASET) return true;
  return subscriptionScopes.includes(invalidatedScope);
}

export const CacheManager = {
  revision: {
    dataset: 0,
    language: 0,
    all: 0,
  },

  _subscribers: new Map(),
  _registry: new Map(),

  subscribe(id, optionsOrHandler) {
    const options = typeof optionsOrHandler === "function"
      ? { scopes: [CacheScope.ALL], clear: optionsOrHandler }
      : optionsOrHandler;

    if (!id || typeof options?.clear !== "function") {
      throw new Error("CacheManager.subscribe requires an id and a clear function.");
    }

    const scopes = normalizeScopes(options.scopes);
    this._subscribers.set(id, {
      scopes,
      clear: options.clear,
      description: options.description || "",
    });
    this._registry.set(id, {
      scopes,
      description: options.description || "",
      registeredAt: options.registeredAt || "subscribe",
    });

    return () => {
      this._subscribers.delete(id);
      this._registry.delete(id);
    };
  },

  registerCache(id, options = {}) {
    if (!id) throw new Error("CacheManager.registerCache requires an id.");
    this._registry.set(id, {
      scopes: normalizeScopes(options.scopes),
      description: options.description || "",
      registeredAt: options.registeredAt || "manual",
    });
  },

  managedMap(id, options = {}) {
    const cache = new Map();
    this.subscribe(id, {
      scopes: options.scopes,
      description: options.description || "Managed Map cache.",
      registeredAt: "managedMap",
      clear: () => cache.clear(),
    });
    return cache;
  },

  managedObject(id, options = {}) {
    const cache = {};
    this.subscribe(id, {
      scopes: options.scopes,
      description: options.description || "Managed object cache.",
      registeredAt: "managedObject",
      clear: () => {
        Object.keys(cache).forEach(key => delete cache[key]);
      },
    });
    return cache;
  },

  invalidate(scope = CacheScope.ALL, reason = "") {
    if (scope === CacheScope.DATASET) {
      this.revision.dataset += 1;
    } else if (scope === CacheScope.LANGUAGE) {
      this.revision.language += 1;
    } else {
      this.revision.dataset += 1;
      this.revision.language += 1;
    }
    this.revision.all += 1;

    const event = {
      scope,
      reason,
      revision: { ...this.revision },
    };

    this._subscribers.forEach((subscription, id) => {
      if (!shouldNotify(subscription.scopes, scope)) return;
      try {
        subscription.clear(event);
      } catch (ex) {
        console.warn(`[CacheManager] Failed to clear "${id}".`, ex);
      }
    });
  },

  key(parts = [], options = {}) {
    const includeDataset = options.dataset !== false;
    const includeLanguage = options.language !== false;
    return JSON.stringify([
      includeDataset ? this.revision.dataset : null,
      includeLanguage ? this.revision.language : null,
      ...parts,
    ]);
  },

  contextRevision(options = {}) {
    const includeDataset = options.dataset !== false;
    const includeLanguage = options.language !== false;
    return [
      includeDataset ? this.revision.dataset : "x",
      includeLanguage ? this.revision.language : "x",
    ].join(":");
  },

  devReport() {
    return Array.from(this._registry.entries()).map(([id, info]) => ({
      id,
      scopes: [...info.scopes],
      description: info.description,
      registeredAt: info.registeredAt,
      subscribed: this._subscribers.has(id),
    }));
  },
};

if (DEV && typeof window !== "undefined") {
  window.__NATURALIST_CACHE_MANAGER__ = CacheManager;
  window.__NATURALIST_CACHE_REPORT__ = () => {
    const report = CacheManager.devReport();
    console.table(report);
    return report;
  };
}

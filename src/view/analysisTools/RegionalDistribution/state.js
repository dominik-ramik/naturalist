/**
 * RegionalDistribution - persistent state
 *
 * Global state  (currentMap, configCollapsed) lives under 'rd:global'.
 * Per-map state (segment, operation, etc.)    lives under 'rd:<dataPath>'.
 */

const PFX = 'rd:';

const MAP_DEFAULTS = {
  segmentTrack:     null,    // null = auto; 'category' | 'numeric'
  categoryStatus:   null,    // null = any presence; string = specific status code
  numericOperation: 'mean',
  threshold:        0,       // for pct_above / pct_below
  denominator:      'filter',
  useGroups:        false,
};

const GLOBAL_DEFAULTS = {
  currentMapDataPath: null,
  configCollapsed:    false,
};

function load(key, defaults) {
  try {
    const raw = localStorage.getItem(PFX + key);
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch { return { ...defaults }; }
}

function save(key, obj) {
  localStorage.setItem(PFX + key, JSON.stringify(obj));
  return obj;
}

export function getMapState(dataPath) {
  return load(dataPath, MAP_DEFAULTS);
}

export function setMapState(dataPath, partial) {
  return save(dataPath, { ...getMapState(dataPath), ...partial });
}

export function getGlobalState() {
  return load('global', GLOBAL_DEFAULTS);
}

export function setGlobalState(partial) {
  return save('global', { ...getGlobalState(), ...partial });
}
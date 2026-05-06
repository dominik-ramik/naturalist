import path from 'node:path';
import fs   from 'node:fs';

const SKIP_SEGMENTS = new Set([
  'src', 'app', 'views', 'view', 'components', 'component',
  'widgets', 'modules', 'pages', 'features', 'lib', 'utils',
]);
const GENERIC_BASENAMES = new Set([
  'index', 'main', 'component', 'view', 'widget', 'module',
]);

const VIRTUAL_ID  = 'virtual:i18n-self';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

// Per-locale bundle virtual modules - one chunk per language.
const VIRTUAL_LOADERS_ID      = 'virtual:i18n-loaders';
const RESOLVED_LOADERS_ID     = '\0' + VIRTUAL_LOADERS_ID;
const VIRTUAL_BUNDLE_PREFIX   = 'virtual:i18n-bundle/';
const RESOLVED_BUNDLE_PREFIX  = '\0virtual:i18n-bundle/';

function deriveKey(absoluteFilePath, projectRoot) {
  // Strip any Vite query suffix (e.g. ?t=1234 added in dev HMR) so that
  // path operations and fs.existsSync work on the real filesystem path.
  const cleanPath = absoluteFilePath.split('?')[0];
  const rel      = path.relative(projectRoot, cleanPath).replace(/\\/g, '/');
  const parts    = rel.split('/');
  const ext      = path.extname(parts[parts.length - 1]);
  const basename = path.basename(parts[parts.length - 1], ext);
  const dirs     = parts.slice(0, -1);

  const meaningfulDirs = [];
  let skipping = true;
  for (const seg of dirs) {
    if (skipping && SKIP_SEGMENTS.has(seg.toLowerCase())) continue;
    skipping = false;
    meaningfulDirs.push(seg);
  }

  if (GENERIC_BASENAMES.has(basename.toLowerCase())) {
    for (let i = meaningfulDirs.length - 1; i >= 0; i--) {
      if (!GENERIC_BASENAMES.has(meaningfulDirs[i].toLowerCase())) return meaningfulDirs[i];
    }
    return basename;
  }
  return basename;
}

// ---------------------------------------------------------------------------
// Helpers for virtual bundle generation
// ---------------------------------------------------------------------------

function findAllI18nDirs(startDir) {
  const results = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.name.endsWith('.i18n')) {
        results.push(full);
      } else {
        walk(full);
      }
    }
  }
  walk(startDir);
  return results;
}

/**
 * Generates the source of `virtual:i18n-bundle/{code}`.
 * All locale JSON files (shared + every *.i18n/ dir) are read from the
 * filesystem and inlined as JS object literals, so Rollup bundles everything
 * into a single chunk - one per language.
 */
function generateBundleModule(code, projectRoot) {
  const localesDir = path.join(projectRoot, 'src', 'i18n', 'locales');
  const lines = [];

  const sharedFile = path.join(localesDir, `${code}.json`);
  lines.push(`const _shared = ${fs.existsSync(sharedFile) ? fs.readFileSync(sharedFile, 'utf-8') : '{}'};`);

  const i18nDirs = findAllI18nDirs(projectRoot);
  const componentVars = [];
  for (const dir of i18nDirs) {
    const key = path.basename(dir, '.i18n');
    const jsonFile = path.join(dir, `${code}.json`);
    if (fs.existsSync(jsonFile)) {
      lines.push(`const _${key} = ${fs.readFileSync(jsonFile, 'utf-8')};`);
      componentVars.push(key);
    }
  }

  lines.push(`export default {`);
  lines.push(`  shared: _shared,`);
  lines.push(`  components: {`);
  for (const key of componentVars) {
    lines.push(`    ${JSON.stringify(key)}: _${key},`);
  }
  lines.push(`  },`);
  lines.push(`};`);

  return lines.join('\n');
}

/**
 * Generates the source of `virtual:i18n-loaders`.
 * Exports a `bundleLoaders` map keyed by locale code, where each value is
 * a lazy `() => import(...)` that Rollup will split into a separate chunk.
 */
function generateLoadersModule(projectRoot) {
  const localesDir = path.join(projectRoot, 'src', 'i18n', 'locales');
  let codes = [];
  try {
    codes = fs.readdirSync(localesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.basename(f, '.json'));
  } catch { /* locales dir missing - bundleLoaders will be empty */ }

  const lines = ['export const bundleLoaders = {'];
  for (const code of codes) {
    lines.push(`  ${JSON.stringify(code)}: () => import(${JSON.stringify(VIRTUAL_BUNDLE_PREFIX + code)}),`);
  }
  lines.push('};');
  return lines.join('\n');
}

export default function i18nSelfPlugin(options = {}) {
  const i18nEntryRelative = options.i18nEntry ?? 'src/i18n/index.js';
  let projectRoot  = process.cwd();
  let i18nEntryAbs = '';

  return {
    name: 'vite-plugin-i18n-self',

    configResolved(config) {
      projectRoot  = config.root;
      i18nEntryAbs = path.resolve(projectRoot, i18nEntryRelative);
    },

    resolveId(id) {
      if (id === VIRTUAL_ID)                       return RESOLVED_ID;
      if (id === VIRTUAL_LOADERS_ID)               return RESOLVED_LOADERS_ID;
      if (id.startsWith(VIRTUAL_BUNDLE_PREFIX))    return RESOLVED_BUNDLE_PREFIX + id.slice(VIRTUAL_BUNDLE_PREFIX.length);
    },

    load(id) {
      if (id === RESOLVED_LOADERS_ID) {
        return generateLoadersModule(projectRoot);
      }
      if (id.startsWith(RESOLVED_BUNDLE_PREFIX)) {
        const code = id.slice(RESOLVED_BUNDLE_PREFIX.length);
        return generateBundleModule(code, projectRoot);
      }
      if (id !== RESOLVED_ID) return;
      // Fallback for SSR / test harnesses - no importer context available.
      return [
        `import { createLocalT } from ${JSON.stringify(i18nEntryAbs)};`,
        `const selfKey = '__unknown__';`,
        `const { t, tf } = createLocalT('__unknown__');`,
        `export { selfKey, t, tf };`,
      ].join('\n');
    },

    transform(code, id) {
      if (!code.includes(VIRTUAL_ID)) return null;
      if (id === RESOLVED_ID) return null;

      const cleanId = id.split('?')[0];
      const key = deriveKey(cleanId, projectRoot);

      let rel = path.relative(path.dirname(cleanId), i18nEntryAbs).replace(/\\/g, '/');
      if (!rel.startsWith('.')) rel = './' + rel;

      const rewritten = code.replace(
        /import\s*\{([^}]+)\}\s*from\s*['"]virtual:i18n-self['"]/g,
        (_, imports) => {
          const names = imports.split(',').map(s => s.trim()).filter(Boolean);
          const needsLocalT = names.includes('t') || names.includes('tf');

          // Only import what the component actually uses.
          const coreImports = [];
          if (names.includes('registerMessages')) coreImports.push('registerMessages');
          if (needsLocalT) coreImports.push('createLocalT');

          const lines = [];
          if (coreImports.length > 0) {
            lines.push(`import { ${coreImports.join(', ')} } from ${JSON.stringify(rel)};`);
          }

          if (names.includes('selfKey')) {
            lines.push(`const selfKey = ${JSON.stringify(key)};`);
          }

          if (needsLocalT) {
            const locals = ['t', 'tf'].filter(n => names.includes(n)).join(', ');
            lines.push(`const { ${locals} } = createLocalT(${JSON.stringify(key)});`);
          }

          return lines.join('\n');
        }
      );

      return { code: rewritten, map: null };
    },

    // Invalidate the affected per-locale bundle module in dev so HMR picks up
    // changes to any locale JSON file (shared locales/ or component .i18n/).
    handleHotUpdate({ file, server }) {
      const normalizedFile = file.replace(/\\/g, '/');
      const isLocaleJson =
        (normalizedFile.includes('/locales/') || normalizedFile.includes('.i18n/')) &&
        normalizedFile.endsWith('.json');
      if (!isLocaleJson) return;

      const code = path.basename(file, '.json');
      const bundleId = RESOLVED_BUNDLE_PREFIX + code;
      const mod = server.moduleGraph.getModuleById(bundleId);
      if (mod) {
        server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}
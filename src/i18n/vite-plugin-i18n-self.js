import path from 'node:path';

const SKIP_SEGMENTS = new Set([
  'src', 'app', 'views', 'view', 'components', 'component',
  'widgets', 'modules', 'pages', 'features', 'lib', 'utils',
]);
const GENERIC_BASENAMES = new Set([
  'index', 'main', 'component', 'view', 'widget', 'module',
]);

const VIRTUAL_ID  = 'virtual:i18n-self';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

function deriveKey(absoluteFilePath, projectRoot) {
  const rel      = path.relative(projectRoot, absoluteFilePath).replace(/\\/g, '/');
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
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    load(id) {
      if (id !== RESOLVED_ID) return;
      // Fallback for SSR / test harnesses - no importer context available.
      return [
        `import { registerMessages, createLocalT } from ${JSON.stringify(i18nEntryAbs)};`,
        `const selfKey = '__unknown__';`,
        `const { t, tf } = createLocalT('__unknown__');`,
        `export { registerMessages, selfKey, t, tf };`,
      ].join('\n');
    },

    transform(code, id) {
      if (!code.includes(VIRTUAL_ID)) return null;
      if (id === RESOLVED_ID) return null;

      const key = deriveKey(id, projectRoot);

      let rel = path.relative(path.dirname(id), i18nEntryAbs).replace(/\\/g, '/');
      if (!rel.startsWith('.')) rel = './' + rel;

      const rewritten = code.replace(
        /import\s*\{([^}]+)\}\s*from\s*['"]virtual:i18n-self['"]/g,
        (_, imports) => {
          const names = imports.split(',').map(s => s.trim()).filter(Boolean);
          const needsLocalT = names.includes('t') || names.includes('tf');

          // Single import from the real module - no duplicate export statements.
          const coreImports = ['registerMessages'];
          if (needsLocalT) coreImports.push('createLocalT');

          const lines = [
            `import { ${coreImports.join(', ')} } from ${JSON.stringify(rel)};`,
          ];

          if (names.includes('selfKey')) {
            lines.push(`const selfKey = ${JSON.stringify(key)};`);
          }

          if (needsLocalT) {
            // Destructure only what the importer actually asked for.
            const locals = ['t', 'tf'].filter(n => names.includes(n)).join(', ');
            lines.push(`const { ${locals} } = createLocalT(${JSON.stringify(key)});`);
          }

          return lines.join('\n');
        }
      );

      return { code: rewritten, map: null };
    },
  };
}
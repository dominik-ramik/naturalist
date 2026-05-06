// scripts/collect-translations.js
// Aggregates all *.i18n/{locale}.json files into 
// a single translations/{locale}.json for translator handoff.
// The reverse (scatter) script splits it back.

import { glob } from 'glob';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const LOCALES = ['fr', 'de', 'es']; // en is source of truth, not handed off
const OUT_DIR = './translations';
mkdirSync(OUT_DIR, { recursive: true });

for (const locale of LOCALES) {
  const files = await glob(`src/**/*.i18n/${locale}.json`);
  const aggregated = {};
  
  for (const file of files) {
    // Use directory name as namespace key — matches selfKey derivation
    const namespace = path.basename(path.dirname(file), '.i18n');
    aggregated[namespace] = JSON.parse(readFileSync(file, 'utf8'));
  }

  // Also include shared locales
  try {
    aggregated._shared = JSON.parse(
      readFileSync(`src/i18n/locales/${locale}.json`, 'utf8')
    );
  } catch { /* locale not yet created */ }

  writeFileSync(
    path.join(OUT_DIR, `${locale}.json`),
    JSON.stringify(aggregated, null, 2)
  );
  console.log(`Collected → translations/${locale}.json`);
}
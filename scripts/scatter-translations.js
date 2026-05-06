// scripts/scatter-translations.js
// Takes a translated translations/{locale}.json and 
// writes it back into the correct *.i18n/{locale}.json files.

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const locale = process.argv[2]; // e.g. "fr"
const source = JSON.parse(
  readFileSync(`./translations/${locale}.json`, 'utf8')
);

for (const [namespace, messages] of Object.entries(source)) {
  const dest = namespace === '_shared'
    ? `src/i18n/locales/${locale}.json`
    : `src/views/${namespace}/${namespace}.i18n/${locale}.json`;
  
  writeFileSync(dest, JSON.stringify(messages, null, 2));
  console.log(`Scattered → ${dest}`);
}
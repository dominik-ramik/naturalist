/**
 * index.js — SpreadsheetViewer component family
 *
 * Usage in .vitepress/theme/index.js:
 *
 *   import DefaultTheme from 'vitepress/theme'
 *   import { SpreadsheetPlugin } from './components/SpreadsheetViewer'
 *   import './components/SpreadsheetViewer/spreadsheet.css'
 *
 *   export default {
 *     ...DefaultTheme,
 *     enhanceApp({ app }) {
 *       app.use(SpreadsheetPlugin)
 *
 *       // Optional — provide global style overrides
 *       app.provide('spreadsheet-config', {
 *         classes: {
 *           header:  { background: '#dce9f7', fontWeight: 'bold' },
 *           warning: { background: '#fff3cd' },
 *           success: { background: '#d4edda' },
 *         },
 *         highlight: { background: '#fff8c5', outline: '2px solid #e3b341' },
 *         striped:   { odd: '#ffffff', even: '#f0f4fa' },
 *       })
 *     }
 *   }
 */

import Spreadsheet from './Spreadsheet.vue'
import Sheet       from './Sheet.vue'
import SCols       from './SCols.vue'
import SCol        from './SCol.vue'
import SRow        from './SRow.vue'
import SCell       from './SCell.vue'

/** Vue plugin — registers all components globally */
export const SpreadsheetPlugin = {
  install(app) {
    app.component('Spreadsheet', Spreadsheet)
    app.component('Sheet',       Sheet)
    app.component('SCols',       SCols)
    app.component('SCol',        SCol)
    app.component('SRow',        SRow)
    app.component('SCell',       SCell)
  },
}

// Also export individually for tree-shakeable local registration
export { Spreadsheet, Sheet, SCols, SCol, SRow, SCell }
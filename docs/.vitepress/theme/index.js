import DefaultTheme from 'vitepress/theme'
import { SpreadsheetPlugin } from './components/SpreadsheetViewer'
import './components/SpreadsheetViewer/spreadsheet.css'

export default {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.use(SpreadsheetPlugin)

    // Optional global config
    app.provide('spreadsheet-config', {
      classes: {
        header:     { background: '#dce9f7', fontWeight: 'bold' },
        groupLabel: { background: '#f4f4f4', fontStyle: 'italic' },
        total:      { background: '#f0f0f0', fontWeight: 'bold', borderTop: '2px solid #999' },
        warning:    { background: '#fff3cd' },
        success:    { background: '#d4edda' },
      },
    })
  },
}
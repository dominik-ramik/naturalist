/**
 * Thin reporting abstraction for custom-type plugins.
 *
 * Plugins import `report` from this module instead of importing Logger
 * directly, keeping them decoupled from the specific logging implementation
 * and from any i18n infrastructure wired into Logger.
 *
 * The host (index.js) calls setReporter() once at module-initialization time,
 * routing all plugin reports to the application Logger.  When no reporter is
 * wired (e.g. isolated unit tests) calls are silently dropped, so plugins
 * never need a Logger shim in test environments.
 */

let _report = null;

/**
 * Wire a concrete reporting function.  Call this once before any data loading.
 *
 * @param {(level: string, message: string, groupTitle?: string) => void} reportFn
 */
export function setReporter(reportFn) {
  _report = reportFn;
}

/**
 * Report an issue at the given severity level.
 *
 * @param {"error"|"warning"|"info"|"critical"} level
 * @param {string} message
 * @param {string} [groupTitle]
 */
export function report(level, message, groupTitle) {
  if (_report) {
    _report(level, message, groupTitle);
  }
}

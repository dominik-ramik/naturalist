/**
 * @file shared/fullscreenableImage.js
 *
 * Single source of truth for the "fullscreenable" image/map interaction.
 *
 * THREE public surfaces, one behaviour:
 *
 *   1. renderFullscreenableImage(fullSource, { thumbSource?, title? })
 *      Mithril vnode — wraps an <img> with thumbnail-aware lazy-swap.
 *      Used by: CustomTypeImage, CustomTypeMap.
 *
 *   2. renderFullscreenableObject(child, { wrapperClass?, title? })
 *      Mithril vnode — wraps a caller-supplied child vnode (e.g. SVG <object>).
 *      No thumbnail swap — pure toggle.
 *      Used by: CustomTypeMapregions, RegionalDistribution.
 *
 *   3. wrapImgHtmlForFullscreen(imgTag, resolvedSrc, altText?)
 *      Wraps a raw <img …> HTML string in a fullscreenable <span>.
 *      Called post-DOMPurify so injection is safe.
 *      Used by: Utils.js / mdImagesClickableAndUsercontentRelative.
 *
 * Changing the interaction model (e.g. switching from CSS fullscreen to a
 * dialog with controls) only requires editing this file.
 */

import m from "mithril";

// ─── CSS class contract (private) ────────────────────────────────────────────
//
// Kept private so callers never reference class names directly.
// A future refactor (e.g. to a dialog) changes only this file.

const FS_WRAP      = "fullscreenable-image";
const FS_CLICKABLE = "clickable";
const FS_ACTIVE    = "fullscreen";

// ─── Core click handler (private) ────────────────────────────────────────────

/**
 * Toggles fullscreen CSS state on the wrapper element.
 * When the wrapper contains an `img.image-in-view` with `data-fullsrc` /
 * `data-thumbsrc` attributes, also performs a lazy full-resolution swap on
 * enter and restores the thumbnail on exit.
 * When those attributes are absent (SVG <object>, plain img) it is a pure
 * CSS class toggle with no side-effects.
 *
 * Compatible with:
 *   - Mithril onclick (Mithril sets `this` to the DOM element)
 *   - native addEventListener (`this` is the element)
 *   - inline onclick="..." via the window shim (browser sets `this`)
 *
 * @param {MouseEvent} e
 */
function handleFullscreenClick(e) {
  const wrap = /** @type {Element} */ (this ?? e.currentTarget);
  const goingFullscreen = !wrap.classList.contains(FS_ACTIVE);

  wrap.classList.toggle(FS_ACTIVE);
  wrap.classList.toggle(FS_CLICKABLE);

  const img = wrap.querySelector("img.image-in-view");
  if (img) {
    if (goingFullscreen) {
      const full  = img.dataset.fullsrc;
      const thumb = img.dataset.thumbsrc;
      if (full && full !== thumb) {
        // Thumbnail is already visible (pre-cached by caller). Load the full
        // version in the background; swap once ready. Silently keeps the
        // thumbnail if the request fails (offline fallback).
        const loader  = new window.Image();
        loader.onload = () => {
          // Guard: user may have exited fullscreen before load completed.
          if (wrap.classList.contains(FS_ACTIVE)) img.src = full;
        };
        loader.src = full;
      }
    } else {
      // Restore thumbnail to free the large decoded bitmap from memory.
      if (img.dataset.thumbsrc) img.src = img.dataset.thumbsrc;
    }
  }

  e.preventDefault();
  e.stopPropagation();
}

// ─── Window shim for HTML-string callers ─────────────────────────────────────
//
// wrapImgHtmlForFullscreen emits an inline onclick="__fsImgClick(event)"
// because it operates on raw HTML strings and cannot plant a JS reference.
// Installed once at module load time; no caller needs to set this up.
// The name is intentionally obscure to avoid accidental collisions.

if (typeof window !== "undefined") {
  window.__fsImgClick = function (e) {
    handleFullscreenClick.call(e.currentTarget, e);
  };
}

// ─── Surface 1: Mithril <img> wrapper ────────────────────────────────────────

/**
 * Renders a fullscreenable image element with optional thumbnail-aware lazy-swap.
 *
 * @param {string} fullSource          URL of the full-resolution image (required).
 * @param {Object} [opts={}]
 * @param {string} [opts.thumbSource]  URL of the thumbnail. When omitted or
 *                                     identical to fullSource the lazy-swap is
 *                                     a no-op (single-URL images).
 * @param {string} [opts.title=""]     Plain-text alt text and tooltip.
 * @returns {import("mithril").Vnode}
 */
export function renderFullscreenableImage(fullSource, { thumbSource, title = "" } = {}) {
  const thumb = thumbSource ?? fullSource;

  return m(
    `span.image-in-view-wrap.${FS_WRAP}.${FS_CLICKABLE}`,
    { title, onclick: handleFullscreenClick },
    m("img.image-in-view", {
      src:             thumb,
      alt:             title,
      "data-thumbsrc": thumb,
      "data-fullsrc":  fullSource,
    })
  );
}

// ─── Surface 2: Mithril wrapper for caller-supplied children ─────────────────

/**
 * Renders a fullscreenable wrapper around a caller-supplied child vnode.
 * Intended for non-image children such as SVG <object> elements, where the
 * caller owns the child but must not own the fullscreen behaviour.
 * No thumbnail swap is involved.
 *
 * @param {import("mithril").Children} child  The child vnode to wrap.
 * @param {Object} [opts={}]
 * @param {string} [opts.wrapperClass=""]  Additional CSS classes for the wrapper
 *                                         (e.g. "image-wrap", "map-chart-image-wrap").
 *                                         The fullscreenable classes are always added.
 * @param {string} [opts.title=""]         Tooltip text.
 * @returns {import("mithril").Vnode}
 */
export function renderFullscreenableObject(child, { wrapperClass = "", title = "" } = {}) {
  const cls = [wrapperClass, FS_WRAP, FS_CLICKABLE].filter(Boolean).join(".");
  return m(`div.${cls}`, { title, onclick: handleFullscreenClick }, child);
}

// ─── Surface 3: raw HTML string wrapper ──────────────────────────────────────

/**
 * Wraps a raw `<img …>` HTML string in a fullscreenable <span>, rewriting
 * its src to resolvedSrc.
 *
 * Safe to call after DOMPurify — injection happens post-sanitization and the
 * onclick uses the window.__fsImgClick shim installed at module load time.
 *
 * @param {string} imgTag       The original <img …> HTML string.
 * @param {string} resolvedSrc  The rewritten src (e.g. usercontent-relative URL).
 * @param {string} [altText=""] Plain-text alt string for the title attribute.
 * @returns {string}
 */
export function wrapImgHtmlForFullscreen(imgTag, resolvedSrc, altText = "") {
  const rewrittenImg = imgTag.replace(/src="[^"]*"/, `src="${resolvedSrc}"`);
  const titleAttr    = altText ? ` title="${altText}"` : "";
  return (
    `<span class="${FS_WRAP} ${FS_CLICKABLE}"${titleAttr}` +
    ` onclick="__fsImgClick(event)">` +
    rewrittenImg +
    `</span>`
  );
}
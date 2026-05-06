// src/components/FullscreenableMedia.js
//
// Thin Mithril component.  Renders a two-level wrapper around either an
// <img> or an <object> (SVG).  Does NOT attach its own event handler -
// FullscreenManager's document-level listener handles all clicks.
//
// DOM structure produced:
//
//   .fullscreenable-image.fullscreen-clickable[.extraWrapClass]   ← OUTER
//     .image-wrap[.image-wrap--fill]                              ← INNER
//       <img> or <object>
//
// OUTER (.fullscreenable-image):
//   - Full-width flex container that centres the inner wrapper.
//   - Receives extraWrapClass so callers can override layout (max-height, bg…).
//   - Becomes the fixed fullscreen overlay when FullscreenManager adds .fullscreen.
//   - Holds `title` for the fullscreen caption (::before) and aria/tooltip.
//
// INNER (.image-wrap):
//   - display: inline-block so it shrinks to the exact image dimensions.
//   - position: relative - the ::after expand-hint icon is anchored here,
//     so the icon is always in the corner of the image, never in the corner
//     of the (potentially wider) outer zone.
//   - Gets .image-wrap--fill for svg-object type, so the <object> can use
//     width:100% against a properly-sized parent instead of a shrink-wrap box.
//
// Props:
//   fullSrc        {string}  required  – URL for the full-resolution asset.
//   thumbSrc       {string}  optional  – Thumbnail URL. Defaults to fullSrc.
//   title          {string}  optional  – Caption / tooltip / aria-label.
//   type           {string}  optional  – 'img' (default) or 'svg-object'.
//   svgId          {string}  optional  – id="" on the <object> (svg-object only).
//   svgStyle       {string}  optional  – inline style for the <object>.
//   oncreate       {fn}      optional  – forwarded to the inner media element.
//   extraWrapClass {string}  optional  – extra class(es) on the OUTER wrapper.

import m from 'mithril';

import './FullscreenableMedia.css';

export function FullscreenableMedia() {
  return {
    view({ attrs }) {
      const {
        fullSrc,
        thumbSrc = fullSrc,   // fall back to full when no thumb provided
        title = '',
        type = 'img',
        svgId,
        svgStyle = 'pointer-events: none; width: 100%; height: auto;',
        oncreate,
        extraWrapClass = '',
      } = attrs;

      // OUTER: centering shell + fullscreen overlay + click target
      const outerClass =
        '.fullscreenable-image.fullscreen-clickable' +
        (extraWrapClass ? '.' + extraWrapClass.split(' ').join('.') : '');

      const outerAttrs = { title };

      if (type === 'svg-object') {
        // .image-wrap--fill: gives the inner block an explicit 100% width so
        // the <object> child can resolve its own width:100% correctly.
        return m(outerClass, outerAttrs,
          m('.image-wrap.image-wrap--fill',
            m(
              `object[type=image/svg+xml][style=${svgStyle}][data=${fullSrc}]` +
              (svgId ? `#${svgId}` : ''),
              { oncreate }
            )
          )
        );
      }

      // Default: img
      // .image-wrap (no --fill): shrinks to the natural image dimensions so the
      // ::after icon always anchors to the image corner, not the container edge.
      return m(outerClass, outerAttrs,
        m('.image-wrap',
          m('img.image-in-view', {
            src:             thumbSrc,
            alt:             title,
            'data-thumbsrc': thumbSrc,
            'data-fullsrc':  fullSrc,
            oncreate,
          })
        )
      );
    },
  };
}
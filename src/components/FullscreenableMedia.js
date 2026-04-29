// src/components/FullscreenableMedia.js
//
// Thin Mithril component.  Renders a .fullscreenable-image wrapper around
// either an <img> or an <object> (SVG).  Does NOT attach its own event
// handler — FullscreenManager's document-level listener handles all clicks.
//
// Props:
//   fullSrc   {string}  required  – URL for the full-resolution asset.
//   thumbSrc  {string}  optional  – URL for the thumbnail. Defaults to fullSrc.
//   title     {string}  optional  – Caption / tooltip / aria-label.
//   type      {string}  optional  – 'img' (default) or 'svg-object'.
//   svgId     {string}  optional  – id="" attribute for the <object> (svg-object only).
//   svgStyle  {string}  optional  – inline style for the <object> (svg-object only).
//   oncreate  {fn}      optional  – forwarded to the inner element's oncreate hook.
//   extraWrapClass {string} optional – additional CSS class(es) on the wrapper.

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

      const wrapClass =
        '.image-wrap.fullscreenable-image.fullscreen-clickable' +
        (extraWrapClass ? '.' + extraWrapClass.split(' ').join('.') : '');

      const wrapAttrs = { title };

      if (type === 'svg-object') {
        return m(wrapClass, wrapAttrs,
          m(
            `object[type=image/svg+xml][style=${svgStyle}][data=${fullSrc}]` +
            (svgId ? `#${svgId}` : ''),
            { oncreate }
          )
        );
      }

      // Default: img
      return m(wrapClass, wrapAttrs,
        m('img.image-in-view', {
          src:              thumbSrc,
          alt:              title,
          'data-thumbsrc':  thumbSrc,
          'data-fullsrc':   fullSrc,
          oncreate,
        })
      );
    },
  };
}
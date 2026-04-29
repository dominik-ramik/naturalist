// src/components/FullscreenManager.js
//
// Pure-JS singleton.  Owns 100% of fullscreen behavior.
// No Mithril dependency — safe to import from anywhere.
//
// To swap the CSS-toggle implementation for a dialog/lightbox in the future,
// edit only the `enter()` and `exit()` methods here.  Every call site is
// insulated from that decision.
//
// Image src swap contract (img elements only):
//   data-thumbsrc  – low-res URL shown in-list
//   data-fullsrc   – high-res URL shown when fullscreen
// If both are the same (or data-fullsrc is absent) no swap occurs.

export const FullscreenManager = {
  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Enter fullscreen for a .fullscreenable-image wrapper element.
   * @param {Element} wrapEl
   */
  enter(wrapEl) {
    wrapEl.classList.add('fullscreen');
    wrapEl.classList.remove('clickable');

    // Thumb → full swap for <img> children
    const img = wrapEl.querySelector('img.image-in-view');
    if (img) {
      const full = img.dataset.fullsrc;
      const thumb = img.dataset.thumbsrc;
      if (full && full !== thumb) {
        const loader = new window.Image();
        loader.onload = function () {
          // Guard: user may have closed fullscreen before the load finished.
          if (wrapEl.classList.contains('fullscreen')) {
            img.src = full;
          }
        };
        loader.src = full;
      }
    }
  },

  /**
   * Exit fullscreen for a .fullscreenable-image wrapper element.
   * @param {Element} wrapEl
   */
  exit(wrapEl) {
    wrapEl.classList.remove('fullscreen');
    wrapEl.classList.add('clickable');

    // Full → thumb swap for <img> children
    const img = wrapEl.querySelector('img.image-in-view');
    if (img) {
      const thumb = img.dataset.thumbsrc;
      if (thumb) img.src = thumb;
    }
  },

  /**
   * Toggle fullscreen for a .fullscreenable-image wrapper element.
   * @param {Element} wrapEl
   */
  toggle(wrapEl) {
    if (wrapEl.classList.contains('fullscreen')) {
      this.exit(wrapEl);
    } else {
      this.enter(wrapEl);
    }
  },

  // ── Initialization ───────────────────────────────────────────────────────────

  /**
   * Call once at app startup.
   * Installs a single capture-phase document listener that handles all
   * .fullscreenable-image clicks — including those inside <object> SVG
   * children and m.trust() HTML injected by the markdown pipeline.
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;
    // Escape key exits any open fullscreen image.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = document.querySelector('.fullscreenable-image.fullscreen');
      if (open) {
        this.exit(open);
        e.preventDefault();
      }
    });

    // Capture phase: fires before the target's own handlers and works even
    // when the click originates inside an <object> (SVG map) or m.trust() HTML.
    document.addEventListener('click', (e) => {
      const wrap = e.target.closest('.fullscreenable-image');
      if (!wrap) return;
      e.preventDefault();
      e.stopPropagation();
      this.toggle(wrap);
    }, true /* capture */);
  },
};
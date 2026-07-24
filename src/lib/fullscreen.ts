// =============================================================
// CROSS-BROWSER FULLSCREEN / KIOSK-MODE DETECTION
// =============================================================
// The kiosk runs on whatever tablet a church already owns, so nothing here
// may assume a vendor. Everything is feature-detected at runtime.
//
// Four states matter, and they need different exit affordances:
//   1. Fullscreen API supported, in fullscreen   -> exitFullscreen() works
//   2. Fullscreen API supported, in a normal tab -> offer to go fullscreen
//   3. Fullscreen API absent (e.g. Safari on iPhone) -> never offer it
//   4. Launched from the home screen (PWA/standalone) -> the OS owns the
//      chrome; the Fullscreen API cannot exit it, so we must offer a
//      navigation escape instead of a fullscreen one.
// =============================================================

/** Vendor-prefixed shapes older WebKit still ships. */
interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
}

/** True when the browser exposes a usable Fullscreen API. */
export function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as FullscreenDocument;
  const el = document.documentElement as FullscreenElement;
  const hasEnabledFlag =
    d.fullscreenEnabled || d.webkitFullscreenEnabled || d.mozFullScreenEnabled || d.msFullscreenEnabled;
  const hasRequest =
    typeof el.requestFullscreen === 'function' ||
    typeof el.webkitRequestFullscreen === 'function' ||
    typeof el.mozRequestFullScreen === 'function' ||
    typeof el.msRequestFullscreen === 'function';
  return Boolean(hasEnabledFlag && hasRequest);
}

/** The element currently presented fullscreen, if any. */
export function getFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const d = document as FullscreenDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? d.mozFullScreenElement ?? d.msFullscreenElement ?? null;
}

/**
 * True when the page was launched from the home screen rather than a browser
 * tab. In this mode there is no browser chrome to hide, the Fullscreen API is
 * a no-op, and only an OS gesture can leave the app.
 */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayModeStandalone =
    typeof window.matchMedia === 'function' &&
    ['standalone', 'fullscreen', 'minimal-ui'].some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches);
  return iosStandalone || displayModeStandalone;
}

/**
 * Request fullscreen. Resolves to false (rather than throwing) when the
 * browser refuses or does not support it, so callers can show a real message
 * instead of appearing broken.
 */
export async function requestFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as FullscreenElement;
  const fn = el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.mozRequestFullScreen ?? el.msRequestFullscreen;
  if (typeof fn !== 'function') return false;
  try {
    await fn.call(el);
    return getFullscreenElement() !== null;
  } catch {
    return false;
  }
}

/** Leave fullscreen. Resolves to false if the browser would not do it. */
export async function exitFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const d = document as FullscreenDocument;
  if (!getFullscreenElement()) return true; // already out
  const fn = d.exitFullscreen ?? d.webkitExitFullscreen ?? d.mozCancelFullScreen ?? d.msExitFullscreen;
  if (typeof fn !== 'function') return false;
  try {
    await fn.call(d);
    return true;
  } catch {
    return false;
  }
}

/** Subscribe to fullscreen changes across vendor prefixes. */
export function onFullscreenChange(handler: () => void): () => void {
  const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
  events.forEach((e) => document.addEventListener(e, handler));
  return () => events.forEach((e) => document.removeEventListener(e, handler));
}

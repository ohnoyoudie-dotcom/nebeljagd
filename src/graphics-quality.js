/** Quality policy shared by desktop and touch/iPad gameplay.
 * Keep a simple high/low signal for the terrain, grass and water renderers.
 * iPadOS Safari may identify an iPad as a touch-enabled Macintosh. */
export function isIPadDevice({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  return /\biPad\b/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function initialGraphicsQuality({ requestedQuality = null, coarsePointer = false, iPad = false } = {}) {
  if (requestedQuality === 'high') return 'high';
  return requestedQuality === 'low' || requestedQuality === 'ipad' || coarsePointer || iPad ? 'low' : 'high';
}

/** Cap actual GPU render pixels and shadow memory without reducing world/map resolution.
 * Desktop low stays compatible with the established 2048 shadow quality checks. */
export function graphicsSettings(quality, { iPad = false, coarsePointer = false, devicePixelRatio = 1 } = {}) {
  const high = quality !== 'low', touch = iPad || coarsePointer;
  const cap = high ? (touch ? 1.5 : 1.75) : (touch ? 1 : 1.15);
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Object.freeze({
    quality: high ? 'high' : 'low', touch,
    pixelRatio: Math.min(ratio, cap),
    shadowMapSize: high ? (touch ? 2048 : 4096) : (touch ? 1024 : 2048),
    shadowBlurSamples: high ? (touch ? 12 : 24) : (touch ? 8 : 14),
    shadowRadius: high ? (touch ? 2 : 3) : (touch ? 1.5 : 2),
  });
}

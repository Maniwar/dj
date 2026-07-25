// Injected by vite.config.ts at build time.
declare const __APP_VERSION__: string
declare const __BUILD_SHA__: string

export const APP_VERSION = __APP_VERSION__
export const BUILD_SHA = __BUILD_SHA__

/** e.g. "v1.0.0 · a1b2c3d" — the string shown in the tab title and the boot console. */
export const BUILD_STAMP = `v${APP_VERSION} · ${BUILD_SHA}`

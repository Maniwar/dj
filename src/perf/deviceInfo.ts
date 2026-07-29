import { getRefreshHz } from './sampler'

// ============================================================================================
// WHAT MACHINE PRODUCED THESE NUMBERS
// ============================================================================================
// The whole point of the export is that a file arrives with no accompanying explanation and is
// still readable. "The tablet was slow" is not a bug report; "SM-X910, Adreno 740, DPR 1.75,
// 4.97 physical megapixels, 60Hz, 8 cores" is. Every field here exists because a previous round
// of this investigation had to be re-run to establish it by asking the user.
//
// Nothing in this module is called per frame. It runs once when the panel mounts and once more
// when a report is built.

export type GpuInfo = { vendor: string | null; renderer: string | null; webgl2: boolean }

export type DeviceInfo = {
  ua: string
  uaData: {
    platform?: string
    platformVersion?: string
    model?: string
    architecture?: string
    mobile?: boolean
    brands?: Array<{ brand: string; version: string }>
  } | null
  dpr: number
  viewport: { w: number; h: number; physicalW: number; physicalH: number; megapixels: number }
  screen: { w: number; h: number; availW: number; availH: number; colorDepth: number }
  cores: number | null
  memoryGB: number | null
  maxTouchPoints: number
  pointerCoarse: boolean
  reducedMotion: boolean
  refreshHz: number
  connection: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } | null
  gpu: GpuInfo
  lang: string
  tz: string
}

type NavigatorUAData = {
  platform?: string
  mobile?: boolean
  brands?: Array<{ brand: string; version: string }>
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>
}

// getHighEntropyValues is async and is what turns "Android" into "SM-X910". It is requested once
// at panel mount and cached, so building a report never has to await anything — a report built
// during a benchmark must not introduce a microtask boundary that could land in a window.
let highEntropy: Record<string, unknown> | null = null

export async function primeDeviceInfo(): Promise<void> {
  const uaData = (navigator as unknown as { userAgentData?: NavigatorUAData }).userAgentData
  if (!uaData?.getHighEntropyValues) return
  try {
    highEntropy = await uaData.getHighEntropyValues([
      'platform',
      'platformVersion',
      'model',
      'architecture',
      'bitness',
    ])
  } catch {
    /* the browser is entitled to refuse; the plain UA string still identifies the family */
  }
}

let gpuCache: GpuInfo | null = null

/**
 * Ask a THROWAWAY context, not the site's.
 *
 * ThermalRunaway's renderer is the one context that matters and it is created lazily behind the
 * boot gate, so it may not exist when the panel mounts. A 1x1 context answers the same question,
 * and it is explicitly destroyed with WEBGL_lose_context afterwards: some Android drivers cap the
 * number of live contexts at a handful, and leaking one here could cost the site the one it
 * actually needs.
 */
export function gpuInfo(): GpuInfo {
  if (gpuCache) return gpuCache
  const out: GpuInfo = { vendor: null, renderer: null, webgl2: false }
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null
    if (gl) {
      out.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      if (dbg) {
        out.vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? '') || null
        out.renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '') || null
      } else {
        // Firefox and privacy modes hide the real strings. The masked ones are still worth having
        // — they at least confirm a hardware context was obtained rather than SwiftShader.
        out.vendor = gl.getParameter(gl.VENDOR) as string
        out.renderer = gl.getParameter(gl.RENDERER) as string
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    /* a blocked or exhausted context is itself a finding; nulls carry it */
  }
  gpuCache = out
  return out
}

export function deviceInfo(): DeviceInfo {
  const dpr = window.devicePixelRatio || 1
  const w = window.innerWidth
  const h = window.innerHeight
  const uaData = (navigator as unknown as { userAgentData?: NavigatorUAData }).userAgentData ?? null
  const conn = (navigator as unknown as { connection?: Record<string, unknown> }).connection ?? null

  return {
    ua: navigator.userAgent,
    uaData: uaData
      ? {
          platform: (highEntropy?.platform as string) ?? uaData.platform,
          platformVersion: highEntropy?.platformVersion as string | undefined,
          model: highEntropy?.model as string | undefined,
          architecture: highEntropy?.architecture as string | undefined,
          mobile: uaData.mobile,
          brands: uaData.brands,
        }
      : null,
    dpr,
    viewport: {
      w,
      h,
      // PHYSICAL pixels are what the compositor has to fill, and they are the number that
      // explains why a maximised tablet browser struggles where the same tablet with a smaller
      // window does not. CSS pixels have repeatedly misled this investigation.
      physicalW: Math.round(w * dpr),
      physicalH: Math.round(h * dpr),
      megapixels: Math.round((w * dpr * h * dpr) / 1e4) / 100,
    },
    screen: {
      w: screen.width,
      h: screen.height,
      availW: screen.availWidth,
      availH: screen.availHeight,
      colorDepth: screen.colorDepth,
    },
    cores: navigator.hardwareConcurrency ?? null,
    memoryGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    refreshHz: getRefreshHz(),
    connection: conn
      ? {
          effectiveType: conn.effectiveType as string | undefined,
          downlink: conn.downlink as number | undefined,
          rtt: conn.rtt as number | undefined,
          saveData: conn.saveData as boolean | undefined,
        }
      : null,
    gpu: gpuInfo(),
    lang: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

/**
 * A short, filename-safe token identifying the machine — this is how the user tells two exported
 * files apart in their downloads folder without opening either. Prefers the Client Hints model
 * ("SM-X910"), then the GPU renderer, then a coarse UA family.
 */
export function deviceSlug(d: DeviceInfo = deviceInfo()): string {
  const model = d.uaData?.model
  if (model) return slug(model)

  const r = d.gpu.renderer
  if (r) {
    // "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics ..., D3D11)" — the useful part is the middle.
    const m = /ANGLE \([^,]+,\s*([^,)]+)/.exec(r)
    return slug(m ? m[1] : r).slice(0, 28)
  }

  const ua = d.ua
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac OS X/i.test(ua)) return 'mac'
  return 'device'
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/\(r\)|\(tm\)|®|™/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'device'
  )
}

/** One line for the panel header. Deliberately short — it sits above a 44px-tall control stack. */
export function deviceSummary(d: DeviceInfo = deviceInfo()): string {
  const name = d.uaData?.model || d.uaData?.platform || (/Windows/.test(d.ua) ? 'Windows' : 'device')
  return [
    name,
    `${d.viewport.w}x${d.viewport.h}@${d.dpr}`,
    `${d.viewport.megapixels}MP`,
    `${d.refreshHz}Hz`,
    `${d.cores ?? '?'}c`,
    d.memoryGB ? `${d.memoryGB}GB` : null,
    d.gpu.renderer ? shortGpu(d.gpu.renderer) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function shortGpu(r: string): string {
  const m = /ANGLE \([^,]+,\s*([^,)]+)/.exec(r)
  return (m ? m[1] : r).replace(/\(R\)|\(TM\)/g, '').trim().slice(0, 32)
}

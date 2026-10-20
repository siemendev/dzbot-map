import { DzMap } from './DzMap'
import type { ControlsOptions, DzMapOptions, Locale, WorldPoint } from './types'

const CONTROL_NAMES = ['zoom', 'fullscreen', 'placeNames', 'tileType'] as const

function coordinate(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** `x,z` or `x,z,label`; the label may contain commas. */
export function parsePin(value: string): { at: WorldPoint; label?: string } | null {
  const [x, z, ...label] = value.split(',')
  const at: WorldPoint = [Number(x), Number(z)]
  if (!Number.isFinite(at[0]) || !Number.isFinite(at[1])) return null
  const text = label.join(',').trim()
  return { at, label: text || undefined }
}

export function parseControls(value: string | null, fallback: ControlsOptions): ControlsOptions {
  if (value === null) return fallback
  const names = value.split(',').map((name) => name.trim())
  return Object.fromEntries(CONTROL_NAMES.map((name) => [name, names.includes(name)]))
}

export interface EmbedOptions {
  map: string
  center?: WorldPoint
  zoom?: number | 'cover'
  placeNames: boolean
  controls: ControlsOptions
  pins: Array<{ at: WorldPoint; label?: string }>
  data?: string
  fit: boolean
  locale?: Locale
}

const DEFAULT_CONTROLS: ControlsOptions = { zoom: true, fullscreen: true, placeNames: true }

/** Reads the embed's URL parameters: `map`, `x`, `z`, `zoom`, `names`, `controls`, `pin` (repeatable), `data`, `fit`, `lang`. */
export function parseEmbed(search: string): EmbedOptions {
  const params = new URLSearchParams(search)
  const x = coordinate(params.get('x'))
  const z = coordinate(params.get('z'))
  const zoomParam = params.get('zoom')
  const lang = params.get('lang')
  return {
    map: params.get('map') ?? 'nasdara',
    center: x !== undefined && z !== undefined ? [x, z] : undefined,
    zoom: zoomParam === 'cover' ? 'cover' : coordinate(zoomParam),
    placeNames: params.get('names') !== '0',
    controls: parseControls(params.get('controls'), DEFAULT_CONTROLS),
    pins: params.getAll('pin').map(parsePin).filter((pin) => pin !== null),
    data: params.get('data') ?? undefined,
    fit: params.get('fit') === '1',
    locale: lang === 'de' || lang === 'en' ? lang : undefined,
  }
}

/** Builds the embed URL for a set of options; the inverse of `parseEmbed`. */
export function embedUrl(options: Partial<EmbedOptions>, base = 'https://map.dzbot.de/embed'): string {
  const params = new URLSearchParams()
  params.set('map', options.map ?? 'nasdara')
  if (options.center) {
    params.set('x', String(Math.round(options.center[0])))
    params.set('z', String(Math.round(options.center[1])))
  }
  if (options.zoom !== undefined) params.set('zoom', typeof options.zoom === 'number' ? String(Math.round(options.zoom * 100) / 100) : options.zoom)
  if (options.placeNames === false) params.set('names', '0')
  if (options.controls) {
    const on = CONTROL_NAMES.filter((name) => options.controls![name])
    const isDefault = on.join() === CONTROL_NAMES.filter((name) => DEFAULT_CONTROLS[name]).join()
    if (!isDefault) params.set('controls', on.join(','))
  }
  for (const pin of options.pins ?? []) params.append('pin', `${Math.round(pin.at[0])},${Math.round(pin.at[1])}${pin.label ? `,${pin.label}` : ''}`)
  if (options.data) params.set('data', options.data)
  if (options.fit) params.set('fit', '1')
  if (options.locale) params.set('lang', options.locale)
  return `${base}?${params.toString()}`
}

/** The map of an embed page, configured by its URL. */
export function mountEmbed(element: HTMLElement, search: string, defaults: Partial<DzMapOptions> = {}): DzMap {
  const options = parseEmbed(search)
  const fitToContent = options.fit && (options.pins.length > 0 || options.data !== undefined)
  const map = new DzMap(element, {
    ...defaults,
    map: options.map,
    center: options.center,
    zoom: options.zoom ?? (options.center ? 5 : 'cover'),
    placeNames: options.placeNames,
    controls: options.controls,
    locale: options.locale ?? (navigator.language?.startsWith('de') ? 'de' : 'en'),
  })
  for (const pin of options.pins) map.addPin(pin.at, { label: pin.label })
  if (fitToContent && !options.data) map.fitBounds(options.pins.map((pin) => pin.at), { maxZoom: 6 })
  if (options.data) {
    map.addGeoJSON(options.data, { fit: fitToContent }).catch((error: unknown) => console.warn('DzMap embed: could not load data', error))
  }
  return map
}

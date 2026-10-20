import { DzMap } from './DzMap'
import { parseControls, parsePin } from './embed'
import type { DzMapOptions, Locale } from './types'

export * from './index'

const DEFAULT_HEIGHT = '400px'

declare global {
  interface HTMLElement {
    dzmap?: DzMap
  }
}

/**
 * Turns every `<div data-dzmap="chernarus">` below `root` into a map. Options come from attributes:
 * `data-center="x,z"`, `data-zoom`, `data-place-names`, `data-controls="zoom,fullscreen,placeNames,tileType"`,
 * `data-pins="x,z,label;x,z,label"`, `data-geojson="url"`, `data-locale`. The map is at `element.dzmap`, and the
 * element fires `dzmap:ready` once it exists.
 */
export function init(root: ParentNode = document): DzMap[] {
  const maps: DzMap[] = []
  for (const element of root.querySelectorAll<HTMLElement>('[data-dzmap]:not([data-dzmap-ready])')) {
    const data = element.dataset
    const [x, z] = (data.center ?? '').split(',').map(Number)
    const zoom = data.zoom === 'cover' ? 'cover' : data.zoom ? Number(data.zoom) : undefined
    if (element.clientHeight === 0) element.style.height = DEFAULT_HEIGHT
    const options: DzMapOptions = {
      map: data.dzmap || undefined,
      center: Number.isFinite(x) && Number.isFinite(z) && data.center ? [x, z] : undefined,
      zoom: zoom ?? (data.center ? 5 : 'cover'),
      placeNames: data.placeNames !== undefined && data.placeNames !== 'false',
      controls: parseControls(data.controls ?? null, { zoom: true, fullscreen: true }),
      locale: (data.locale as Locale | undefined) ?? (document.documentElement.lang?.startsWith('de') ? 'de' : 'en'),
    }
    const map = new DzMap(element, options)
    for (const pin of (data.pins ?? '').split(';').map(parsePin)) if (pin) map.addPin(pin.at, { label: pin.label })
    if (data.geojson) map.addGeoJSON(data.geojson).catch((error: unknown) => console.warn('DzMap: could not load GeoJSON', error))
    element.dzmap = map
    element.dispatchEvent(new CustomEvent('dzmap:ready', { detail: map, bubbles: true }))
    maps.push(map)
  }
  return maps
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init())
  else queueMicrotask(() => init())
}

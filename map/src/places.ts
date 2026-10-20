import type { PlaceName } from './types'
import type { PlaceFeature } from './vector'

export type Thresholds = [number, number, number, number]

export const DEFAULT_THRESHOLDS: Thresholds = [933, 467, 233, 117]

export interface PlaceNamesResponse {
  places: PlaceName[]
  thresholds?: Thresholds
}

function fontSize(radius: number): number {
  const minR = 300, maxR = 4500, minF = 12, maxF = 20
  const t = Math.log(Math.max(minR, radius) / minR) / Math.log(maxR / minR)
  return Math.round(minF + Math.min(1, t) * (maxF - minF))
}

function minZoom(radius: number, [t1, t2, t3, t4]: Thresholds): number {
  if (radius >= t1) return 1
  if (radius >= t2) return 2
  if (radius >= t3) return 3
  if (radius >= t4) return 4
  return 5
}

/** Place names as map features: bigger places show from further out and fade once you are inside them. */
export function placeFeatures(places: readonly PlaceName[], thresholds: Thresholds = DEFAULT_THRESHOLDS): PlaceFeature[] {
  return places
    .filter((place) => !place.type || place.type === 'city' || place.type === 'poi')
    .map((place) => {
      const radius = place.radius ?? 300
      return {
        type: 'place',
        at: [place.x, place.z],
        name: place.name,
        radius: place.radius,
        color: 'white',
        fontSize: fontSize(radius),
        fadeOutRadiusPx: 1600,
        minZoom: minZoom(radius, thresholds),
      }
    })
}

export async function fetchPlaceNames(apiUrl: string, mapId: string, signal?: AbortSignal): Promise<PlaceNamesResponse> {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/public/map/${encodeURIComponent(mapId)}/places`, { signal })
  if (!response.ok) throw new Error(`Place names for ${mapId}: HTTP ${response.status}`)
  return (await response.json()) as PlaceNamesResponse
}

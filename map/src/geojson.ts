import type { WorldPoint } from './types'
import type { Feature } from './vector'

type Position = number[]

interface Geometry {
  type: string
  coordinates?: unknown
  geometries?: Geometry[]
}

interface GeoJsonFeature {
  type: 'Feature'
  geometry: Geometry | null
  properties?: Record<string, unknown> | null
}

export type GeoJson = { type: 'FeatureCollection'; features: GeoJsonFeature[] } | GeoJsonFeature | Geometry

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : typeof value === 'number' ? String(value) : undefined
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

function point(position: Position): WorldPoint {
  return [Number(position[0]), Number(position[1])]
}

/**
 * GeoJSON as map features. Coordinates are DayZ world metres `[x, z]`, not longitude/latitude. Styling follows
 * the simplestyle properties (`title`, `marker-color`, `stroke`, `fill`, `fill-opacity`) plus `radius` (metres)
 * for an area around a point and `label` as an alternative to `title`.
 */
export function geoJsonFeatures(data: GeoJson): Feature[] {
  const out: Feature[] = []
  const add = (geometry: Geometry | null, props: Record<string, unknown>) => {
    if (!geometry) return
    const label = text(props.label) ?? text(props.title) ?? text(props.name)
    const color = text(props['marker-color']) ?? text(props.color) ?? text(props.stroke)
    const coords = geometry.coordinates as never
    switch (geometry.type) {
      case 'Point': {
        const radius = num(props.radius)
        out.push({ type: 'point', at: point(coords), color, label, area: radius ? { radius, opacity: num(props['fill-opacity']) } : undefined })
        return
      }
      case 'MultiPoint':
        for (const p of coords as Position[]) add({ type: 'Point', coordinates: p }, props)
        return
      case 'LineString':
        out.push({ type: 'line', points: (coords as Position[]).map(point), color: text(props.stroke) ?? color, width: num(props['stroke-width']), opacity: num(props['stroke-opacity']) })
        return
      case 'MultiLineString':
        for (const line of coords as Position[][]) add({ type: 'LineString', coordinates: line }, props)
        return
      case 'Polygon': {
        const [outer] = coords as Position[][]
        if (!outer) return
        out.push({
          type: 'polygon',
          points: outer.map(point),
          fill: text(props.fill) ?? color,
          stroke: text(props.stroke) ?? text(props.fill) ?? color,
          fillOpacity: num(props['fill-opacity']),
          fadeOnZoom: false,
          label,
        })
        return
      }
      case 'MultiPolygon':
        for (const polygon of coords as Position[][][]) add({ type: 'Polygon', coordinates: polygon }, props)
        return
      case 'GeometryCollection':
        for (const g of geometry.geometries ?? []) add(g, props)
        return
    }
  }
  if (data.type === 'FeatureCollection') {
    for (const feature of (data as { features: GeoJsonFeature[] }).features ?? []) add(feature.geometry, feature.properties ?? {})
  } else if (data.type === 'Feature') {
    add((data as GeoJsonFeature).geometry, (data as GeoJsonFeature).properties ?? {})
  } else {
    add(data as Geometry, {})
  }
  return out
}
